'use client'

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'manager' | 'teammate' | 'dev'
  requested_role: 'manager' | 'teammate' | 'dev'
  requested_manager_id: string | null
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type TimeEntry = {
  id: string
  work_date: string
  clock_in: string
  clock_out: string | null
  ot_eligible: boolean
  is_unscheduled: boolean
}

type ManagerOption = {
  id: string
  full_name: string | null
  nickname: string | null
  email: string
  role: string
}

type ScheduleDraft = {
  weekday: number
  is_working: boolean
  start_time: string
  end_time: string
}

type ScheduleRecord = ScheduleDraft & {
  id: string
  timezone: string
  effective_from: string
  effective_to: string | null
}

type PacificPreview = {
  label: string
  weekendDays: string[]
}

type LeaveRow = {
  id: string
  leave_type: string
  start_date: string
  end_date: string
  credits_requested: number
  status: string
}

const supabase = createClient()

const DAYS = [
  { name: 'Monday', weekday: 1 },
  { name: 'Tuesday', weekday: 2 },
  { name: 'Wednesday', weekday: 3 },
  { name: 'Thursday', weekday: 4 },
  { name: 'Friday', weekday: 5 },
  { name: 'Saturday', weekday: 6 },
  { name: 'Sunday', weekday: 0 },
]

const TIMEZONES = [
  'Asia/Manila',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'UTC',
]

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') {
    const target = event.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') event.preventDefault()
  }
}

function initialSchedule(): ScheduleDraft[] {
  return DAYS.map((day) => ({
    weekday: day.weekday,
    is_working: false,
    start_time: '09:00',
    end_time: '17:00',
  }))
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const map: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

function offsetMs(date: Date, timeZone: string) {
  const p = zoneParts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()
}

function localDateTimeToDate(
  ymd: { year: number; month: number; day: number },
  time: string,
  timeZone: string,
) {
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, 0)
  let guess = new Date(target)

  for (let i = 0; i < 4; i += 1) {
    guess = new Date(target - offsetMs(guess, timeZone))
  }

  return guess
}

function addDateDays(
  ymd: { year: number; month: number; day: number },
  days: number,
) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function currentMonday(timeZone: string) {
  const p = zoneParts(new Date(), timeZone)
  const localDate = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const day = localDate.getUTCDay()
  return addDateDays({ year: p.year, month: p.month, day: p.day }, -((day + 6) % 7))
}

function previewPacific(
  row: ScheduleDraft,
  index: number,
  timeZone: string,
): PacificPreview | null {
  if (!row.is_working || !row.start_time || !row.end_time) return null

  try {
    const monday = currentMonday(timeZone)
    const startDate = addDateDays(monday, index)
    const [sh, sm] = row.start_time.split(':').map(Number)
    const [eh, em] = row.end_time.split(':').map(Number)
    const endDate = addDateDays(startDate, eh * 60 + em <= sh * 60 + sm ? 1 : 0)
    const start = localDateTimeToDate(startDate, row.start_time, timeZone)
    const end = localDateTimeToDate(endDate, row.end_time, timeZone)

    const weekdayFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'long',
    })
    const shortFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const startDay = weekdayFmt.format(start)
    const endDay = weekdayFmt.format(end)
    const weekendDays = Array.from(
      new Set([startDay, endDay].filter((day) => day === 'Saturday' || day === 'Sunday')),
    )

    return {
      label: `${shortFmt.format(start)} – ${shortFmt.format(end)} PT`,
      weekendDays,
    }
  } catch {
    return null
  }
}

function managerLabel(manager: ManagerOption) {
  return manager.nickname || manager.full_name || manager.email
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Dashboard')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [signupCompleted, setSignupCompleted] = useState(false)

  async function refreshProfile(uid?: string) {
    const id = uid || userId
    if (!id) return

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (profileError) setError(profileError.message)
    else setProfile(data as Profile)
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return
      const uid = data.user?.id || null
      setUserId(uid)
      if (uid) await refreshProfile(uid)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const uid = session?.user?.id || null
      setUserId(uid)
      if (uid) await refreshProfile(uid)
      else setProfile(null)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <Center>
        <div className="card">Loading portal…</div>
      </Center>
    )
  }

  if (!userId) {
    return (
      <AuthScreen
        signupCompleted={signupCompleted}
        setSignupCompleted={setSignupCompleted}
      />
    )
  }

  if (!profile?.onboarding_complete) return <Onboarding onDone={() => refreshProfile()} />

  if (profile.status === 'pending') {
    return (
      <Center>
        <div className="card auth-card">
          <h1>Pending approval</h1>
          <p className="muted">
            Your profile and schedule were submitted. An Admin or Manager must approve the
            account before portal access is enabled.
          </p>
          <div className="row">
            <span>Requested role</span>
            <strong>{profile.requested_role}</strong>
          </div>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </Center>
    )
  }

  if (profile.status !== 'active') {
    return (
      <Center>
        <div className="card auth-card">
          <h1>Account unavailable</h1>
          <p>
            Your account status is <strong>{profile.status}</strong>.
          </p>
          <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </Center>
    )
  }

  const management = profile.role === 'admin' || profile.role === 'manager'
  const tabs = [
    'Dashboard',
    'Time Tracking',
    'Leave',
    'Schedule',
    ...(management ? ['Manager'] : []),
  ]

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Hypertide</div>
        <div className="nav">
          {tabs.map((name) => (
            <button
              key={name}
              className={tab === name ? 'active' : ''}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1 style={{ margin: 0 }}>{tab}</h1>
            <div className="muted">
              Welcome, {profile.nickname || profile.full_name || profile.email}
            </div>
          </div>
          <div className="actions">
            <span className="pill">{profile.role}</span>
            <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>

        {message && (
          <div className="success" style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}
        {error && (
          <div className="error" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {tab === 'Dashboard' && <Dashboard profile={profile} />}
        {tab === 'Time Tracking' && (
          <TimeTracking setMessage={setMessage} setError={setError} />
        )}
        {tab === 'Leave' && <Leave setMessage={setMessage} setError={setError} />}
        {tab === 'Schedule' && <Schedule profile={profile} />}
        {tab === 'Manager' && management && <Manager />}
      </main>
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="auth-wrap">{children}</div>
}

function AuthScreen({
  signupCompleted,
  setSignupCompleted,
}: {
  signupCompleted: boolean
  setSignupCompleted: (value: boolean) => void
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        setBusy(false)
        return
      }

      const { error: authError } = await supabase.auth.signUp({ email, password })

      if (authError) {
        setError(authError.message)
      } else {
        setSignupCompleted(true)
        await supabase.auth.signOut()
        setPassword('')
        setConfirmPassword('')
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) setError(authError.message)
    }

    setBusy(false)
  }

  if (signupCompleted) {
    return (
      <Center>
        <div className="card auth-card">
          <h1 className="title">Account created successfully</h1>
          <p className="subtitle">
            Your account is ready. Sign in with your email and password to continue your profile setup.
          </p>
          <div className="success" style={{ marginBottom: 16 }}>
            Registration successful.
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => {
              setSignupCompleted(false)
              setMode('login')
              setError('')
            }}
          >
            Go to Login
          </button>
        </div>
      </Center>
    )
  }

  return (
    <Center>
      <div className="card auth-card">
        <h1 className="title">Hypertide Team Portal</h1>
        <p className="subtitle">Scheduling, attendance, leave, and approvals.</p>

        <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>

          {mode === 'signup' && (
            <label className="field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          )}

          {error && <div className="error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 12, width: '100%' }}
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setConfirmPassword('')
            setError('')
          }}
        >
          {mode === 'login' ? 'Create a new account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </Center>
  )
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState('')
  const [nickname, setNickname] = useState('')
  const [timezone, setTimezone] = useState('Asia/Manila')
  const [role, setRole] = useState<'manager' | 'teammate' | 'dev'>('teammate')
  const [managerId, setManagerId] = useState('')
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [schedule, setSchedule] = useState<ScheduleDraft[]>(initialSchedule())
  const [alternatingWeekend, setAlternatingWeekend] = useState(false)
  const [weekendWorking, setWeekendWorking] = useState<'yes' | 'no' | ''>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('list_active_managers').then(({ data }) => {
      const rows = (data || []) as ManagerOption[]
      setManagers(rows)
      if (rows.length) setManagerId((current) => current || rows[0].id)
    })
  }, [])

  const previews = useMemo(
    () => schedule.map((row, index) => previewPacific(row, index, timezone)),
    [schedule, timezone],
  )

  const pacificWeekendDays = useMemo(
    () => Array.from(new Set(previews.flatMap((preview) => preview?.weekendDays || []))),
    [previews],
  )

  function updateSchedule(index: number, patch: Partial<ScheduleDraft>) {
    setSchedule((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    )
  }

  function copyMondayToWeekdays() {
    const monday = schedule[0]
    setSchedule((current) =>
      current.map((row, index) =>
        index >= 1 && index <= 4
          ? {
              ...row,
              is_working: monday.is_working,
              start_time: monday.start_time,
              end_time: monday.end_time,
            }
          : row,
      ),
    )
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    if (!schedule.some((row) => row.is_working)) {
      setError('Please set at least one working day.')
      setBusy(false)
      return
    }

    if ((role === 'teammate' || role === 'dev') && managers.length > 0 && !managerId) {
      setError('Please select a manager.')
      setBusy(false)
      return
    }

    if (pacificWeekendDays.length > 0 && alternatingWeekend && !weekendWorking) {
      setError('Please tell us whether you are working the Pacific weekend this week.')
      setBusy(false)
      return
    }

    const payload = schedule.map((row) => ({
      weekday: row.weekday,
      is_working: row.is_working,
      start_time: row.is_working ? row.start_time : null,
      end_time: row.is_working ? row.end_time : null,
    }))

    const { error: submitError } = await supabase.rpc('submit_onboarding', {
      p_full_name: fullName,
      p_nickname: nickname,
      p_timezone: timezone,
      p_requested_role: role,
      p_requested_manager_id: role === 'manager' ? null : managerId || null,
      p_schedule: payload,
      p_alternating_weekend: pacificWeekendDays.length > 0 ? alternatingWeekend : false,
      p_weekend_working_this_week:
        pacificWeekendDays.length > 0 && alternatingWeekend
          ? weekendWorking === 'yes'
          : null,
      p_pacific_weekend_days: pacificWeekendDays,
    })

    if (submitError) setError(submitError.message)
    else onDone()

    setBusy(false)
  }

  return (
    <Center>
      <div className="card onboarding-card">
        <h1 className="title">Set up your Hypertide profile</h1>
        <p className="subtitle">
          Enter your details and your normal weekly schedule in your own local time. Pacific
          Time is shown automatically for management.
        </p>

        <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>Nickname</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </label>

            <label className="field">
              <span>Requested role</span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as 'manager' | 'teammate' | 'dev')
                }
              >
                <option value="teammate">Teammate</option>
                <option value="dev">Dev</option>
                <option value="manager">Manager</option>
              </select>
            </label>

            <label className="field">
              <span>Time zone</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {TIMEZONES.map((tz) => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
            </label>

            {role !== 'manager' && (
              <label className="field">
                <span>Manager</span>
                <select
                  value={managerId}
                  onChange={(event) => setManagerId(event.target.value)}
                  required={managers.length > 0}
                >
                  {managers.length === 0 && <option value="">Admin will assign later</option>}
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {managerLabel(manager)} ({manager.role})
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="section-head">
            <div>
              <h2>Weekly schedule</h2>
              <p className="muted">Times below are in {timezone}. Overnight shifts are supported.</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={copyMondayToWeekdays}
            >
              Copy Monday to weekdays
            </button>
          </div>

          <div className="schedule-table">
            <div className="schedule-row schedule-head">
              <strong>Day</strong>
              <strong>Status</strong>
              <strong>Start</strong>
              <strong>End</strong>
              <strong>Pacific Time</strong>
            </div>

            {DAYS.map((day, index) => {
              const row = schedule[index]
              return (
                <div className="schedule-row" key={day.name}>
                  <strong>{day.name}</strong>
                  <select
                    value={row.is_working ? 'working' : 'off'}
                    onChange={(event) =>
                      updateSchedule(index, { is_working: event.target.value === 'working' })
                    }
                  >
                    <option value="off">Off</option>
                    <option value="working">Working</option>
                  </select>
                  <input
                    type="time"
                    value={row.start_time}
                    disabled={!row.is_working}
                    onChange={(event) => updateSchedule(index, { start_time: event.target.value })}
                  />
                  <input
                    type="time"
                    value={row.end_time}
                    disabled={!row.is_working}
                    onChange={(event) => updateSchedule(index, { end_time: event.target.value })}
                  />
                  <span className="pacific-preview">
                    {row.is_working ? previews[index]?.label || 'Enter valid times' : 'Off'}
                  </span>
                </div>
              )
            })}
          </div>

          {pacificWeekendDays.length > 0 && (
            <div className="weekend-card">
              <h3>Pacific weekend shift detected</h3>
              <p className="muted">
                Your schedule touches {pacificWeekendDays.join(' and ')} in America/Los_Angeles.
              </p>

              <label className="field">
                <span>Will you be on alternating weekend shifts?</span>
                <select
                  value={alternatingWeekend ? 'yes' : 'no'}
                  onChange={(event) => {
                    setAlternatingWeekend(event.target.value === 'yes')
                    setWeekendWorking('')
                  }}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>

              {alternatingWeekend && (
                <label className="field">
                  <span>Will you have a weekend shift this week?</span>
                  <select
                    value={weekendWorking}
                    onChange={(event) =>
                      setWeekendWorking(event.target.value as 'yes' | 'no' | '')
                    }
                    required
                  >
                    <option value="">Select</option>
                    <option value="yes">Yes — this weekend is working</option>
                    <option value="no">No — this weekend is off</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {error && <div className="error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving profile and schedule…' : 'Submit for approval'}
          </button>
        </form>
      </div>
    </Center>
  )
}

function Dashboard({ profile }: { profile: Profile }) {
  return (
    <div className="grid">
      <div className="card">
        <div className="muted">Status</div>
        <div className="metric">Active</div>
      </div>
      <div className="card">
        <div className="muted">Timezone</div>
        <div className="metric" style={{ fontSize: 22 }}>
          {profile.timezone}
        </div>
      </div>
      <div className="card">
        <div className="muted">Role</div>
        <div className="metric" style={{ textTransform: 'capitalize' }}>
          {profile.role}
        </div>
      </div>
    </div>
  )
}

function TimeTracking({
  setMessage,
  setError,
}: {
  setMessage: (value: string) => void
  setError: (value: string) => void
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [onBreak, setOnBreak] = useState(false)
  const [recent, setRecent] = useState<TimeEntry[]>([])

  async function load() {
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .order('clock_in', { ascending: false })
      .limit(7)

    const rows = (data || []) as TimeEntry[]
    setRecent(rows)
    setEntry(rows.find((row) => !row.clock_out) || null)

    const { data: breaks } = await supabase
      .from('breaks')
      .select('id')
      .is('ended_at', null)
      .limit(1)

    setOnBreak(Boolean(breaks?.length))
  }

  useEffect(() => {
    load()
  }, [])

  async function run(fn: string, ok: string) {
    setError('')
    setMessage('')
    const { error } = await supabase.rpc(fn)
    if (error) setError(error.message)
    else {
      setMessage(ok)
      await load()
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Current shift</h2>
        <p className="muted">Server time is used for attendance.</p>
        <div className="actions">
          {!entry && (
            <button
              className="btn btn-primary"
              onClick={() => run('clock_in_now', 'Clocked in successfully.')}
            >
              Clock In
            </button>
          )}
          {entry && !onBreak && (
            <button
              className="btn btn-secondary"
              onClick={() => run('start_paid_break', 'Paid break started.')}
            >
              Start Break
            </button>
          )}
          {entry && onBreak && (
            <button
              className="btn btn-secondary"
              onClick={() => run('end_paid_break', 'Break ended.')}
            >
              Resume Work
            </button>
          )}
          {entry && (
            <button
              className="btn btn-primary"
              onClick={() => run('clock_out_now', 'Clocked out successfully.')}
            >
              Clock Out
            </button>
          )}
        </div>
        {entry && (
          <p className="muted">Clocked in: {new Date(entry.clock_in).toLocaleString()}</p>
        )}
      </div>

      <div className="card">
        <h2>Recent entries</h2>
        <div className="list">
          {recent.map((row) => (
            <div className="row" key={row.id}>
              <div>
                <strong>{row.work_date}</strong>
                <div className="muted">
                  {new Date(row.clock_in).toLocaleTimeString()} →{' '}
                  {row.clock_out ? new Date(row.clock_out).toLocaleTimeString() : 'Open'}
                </div>
              </div>
              <span className="pill">
                {row.ot_eligible ? 'OT eligible' : row.is_unscheduled ? 'Unscheduled' : 'Regular'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Leave({
  setMessage,
  setError,
}: {
  setMessage: (value: string) => void
  setError: (value: string) => void
}) {
  const [type, setType] = useState('vacation')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [dayType, setDayType] = useState('full')
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState<LeaveRow[]>([])

  async function load() {
    const { data } = await supabase
      .from('leave_requests')
      .select('*')
      .order('created_at', { ascending: false })
    setHistory((data || []) as LeaveRow[])
  }

  useEffect(() => {
    load()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    setError('')

    const days = Math.max(
      1,
      Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1,
    )
    const credits = dayType === 'half' ? 0.5 : days
    const { data: auth } = await supabase.auth.getUser()

    const { error } = await supabase.from('leave_requests').insert({
      employee_id: auth.user?.id,
      leave_type: type,
      start_date: start,
      end_date: end,
      day_type: dayType,
      credits_requested: credits,
      reason,
      status: 'pending',
    })

    if (error) setError(error.message)
    else {
      setMessage('Leave request submitted.')
      setStart('')
      setEnd('')
      setReason('')
      await load()
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>File leave</h2>
        <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
          <div className="form-grid">
            <label className="field">
              <span>Leave type</span>
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="vacation">Vacation</option>
                <option value="sick">Sick</option>
              </select>
            </label>

            <label className="field">
              <span>Day type</span>
              <select value={dayType} onChange={(event) => setDayType(event.target.value)}>
                <option value="full">Full day</option>
                <option value="half">Half day</option>
              </select>
            </label>

            <label className="field">
              <span>Start date</span>
              <input
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>

            <label className="field">
              <span>End date</span>
              <input
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </label>

          <button type="submit" className="btn btn-primary">
            Submit leave request
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Leave history</h2>
        <div className="list">
          {history.map((row) => (
            <div className="row" key={row.id}>
              <div>
                <strong>{row.leave_type}</strong>
                <div className="muted">
                  {row.start_date} to {row.end_date} · {row.credits_requested} credit(s)
                </div>
              </div>
              <span className="pill">{row.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Schedule({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<ScheduleRecord[]>([])

  useEffect(() => {
    supabase
      .from('schedules')
      .select('*')
      .is('effective_to', null)
      .then(({ data }) => setRows((data || []) as ScheduleRecord[]))
  }, [])

  const byWeekday = new Map<number, ScheduleRecord>(
    rows.map((row) => [row.weekday, row] as [number, ScheduleRecord]),
  )

  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>Current weekly schedule</h2>
          <p className="muted">Your local schedule is shown beside its Pacific Time equivalent.</p>
        </div>
        <span className="pill">{profile.timezone}</span>
      </div>

      <div className="schedule-table">
        <div className="schedule-row schedule-head">
          <strong>Day</strong>
          <strong>Status</strong>
          <strong>Start</strong>
          <strong>End</strong>
          <strong>Pacific Time</strong>
        </div>

        {DAYS.map((day, index) => {
          const row = byWeekday.get(day.weekday)

          if (!row || !row.is_working) {
            return (
              <div className="schedule-row" key={day.name}>
                <strong>{day.name}</strong>
                <span>Off</span>
                <span>—</span>
                <span>—</span>
                <span className="muted">Off</span>
              </div>
            )
          }

          const preview = previewPacific(row, index, row.timezone)
          return (
            <div className="schedule-row" key={day.name}>
              <strong>{day.name}</strong>
              <span>Working</span>
              <span>{row.start_time.slice(0, 5)}</span>
              <span>{row.end_time.slice(0, 5)}</span>
              <span className="pacific-preview">{preview?.label || '—'}</span>
            </div>
          )
        })}
      </div>

      <p className="muted" style={{ marginTop: 16 }}>
        Schedule-change requests and shift swaps will be added to this page next.
      </p>
    </div>
  )
}

function Manager() {
  const [pending, setPending] = useState<Profile[]>([])
  const [all, setAll] = useState<Profile[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])

  async function load() {
    const [{ data }, { data: managerData }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_active_managers'),
    ])

    const rows = (data || []) as Profile[]
    setAll(rows)
    setPending(
      rows.filter((profile) => profile.status === 'pending' && profile.onboarding_complete),
    )
    setManagers((managerData || []) as ManagerOption[])
  }

  useEffect(() => {
    load()
  }, [])

  async function approve(profile: Profile) {
    const { error } = await supabase.rpc('approve_profile', {
      p_user_id: profile.id,
      p_role: profile.requested_role,
      p_manager_id: profile.requested_role === 'manager' ? null : profile.requested_manager_id,
    })

    if (!error) await load()
    else alert(error.message)
  }

  function requestedManagerName(profile: Profile) {
    if (!profile.requested_manager_id) return 'Unassigned'
    const found = managers.find((manager) => manager.id === profile.requested_manager_id)
    return found ? managerLabel(found) : 'Selected manager'
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Pending approvals</h2>
        <div className="list">
          {pending.length === 0 && <div className="muted">No pending profiles.</div>}
          {pending.map((profile) => (
            <div className="row" key={profile.id}>
              <div>
                <strong>{profile.full_name || profile.email}</strong>
                <div className="muted">
                  {profile.email} · requests {profile.requested_role}
                  {profile.requested_role !== 'manager'
                    ? ` · manager: ${requestedManagerName(profile)}`
                    : ''}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => approve(profile)}>
                Approve
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>People</h2>
        <div className="list">
          {all.map((profile) => (
            <div className="row" key={profile.id}>
              <div>
                <strong>{profile.full_name || profile.email}</strong>
                <div className="muted">
                  {profile.email} · {profile.timezone}
                </div>
              </div>
              <span className="pill">
                {profile.role} / {profile.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
