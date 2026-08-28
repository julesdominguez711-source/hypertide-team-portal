'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DAYS, TIMEZONES, initialSchedule, previewPacific, type ScheduleDraft } from '@/lib/schedule-utils'

const supabase = createClient()

type ManagerOption = {
  id: string
  full_name: string | null
  nickname: string | null
  email: string
  role: string
}

function managerLabel(manager: ManagerOption) {
  return manager.nickname || manager.full_name || manager.email
}

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') event.preventDefault()
}

export default function PortalOnboarding({ onDone }: { onDone: () => void }) {
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
    setSchedule((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }

  function copyMondayToWeekdays() {
    const monday = schedule[0]
    setSchedule((current) => current.map((row, index) => index >= 1 && index <= 4
      ? { ...row, is_working: monday.is_working, start_time: monday.start_time, end_time: monday.end_time }
      : row))
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
      p_weekend_working_this_week: pacificWeekendDays.length > 0 && alternatingWeekend ? weekendWorking === 'yes' : null,
      p_pacific_weekend_days: pacificWeekendDays,
    })

    if (submitError) setError(submitError.message)
    else onDone()
    setBusy(false)
  }

  return (
    <div className="auth-wrap">
      <div className="card onboarding-card">
        <h1 className="title">Set up your Hypertide profile</h1>
        <p className="subtitle">Enter your details and normal weekly schedule in your own local time. Pacific Time is shown automatically for management.</p>

        <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
          <div className="form-grid">
            <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
            <label className="field"><span>Nickname</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>
            <label className="field">
              <span>Requested role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as 'manager' | 'teammate' | 'dev')}>
                <option value="teammate">Teammate</option>
                <option value="dev">Dev</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <label className="field">
              <span>Time zone</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
              </select>
            </label>
            {role !== 'manager' && (
              <label className="field">
                <span>Manager</span>
                <select value={managerId} onChange={(event) => setManagerId(event.target.value)} required={managers.length > 0}>
                  {managers.length === 0 && <option value="">Admin will assign later</option>}
                  {managers.map((manager) => <option key={manager.id} value={manager.id}>{managerLabel(manager)} ({manager.role})</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="section-head">
            <div><h2>Weekly schedule</h2><p className="muted">Times below are in {timezone}. Overnight shifts are supported.</p></div>
            <button type="button" className="btn btn-secondary" onClick={copyMondayToWeekdays}>Copy Monday to weekdays</button>
          </div>

          <div className="schedule-table">
            <div className="schedule-row schedule-head"><strong>Day</strong><strong>Status</strong><strong>Start</strong><strong>End</strong><strong>Pacific Time</strong></div>
            {DAYS.map((day, index) => {
              const row = schedule[index]
              return (
                <div className="schedule-row" key={day.name}>
                  <strong>{day.name}</strong>
                  <select value={row.is_working ? 'working' : 'off'} onChange={(event) => updateSchedule(index, { is_working: event.target.value === 'working' })}>
                    <option value="off">Off</option><option value="working">Working</option>
                  </select>
                  <input type="time" value={row.start_time} disabled={!row.is_working} onChange={(event) => updateSchedule(index, { start_time: event.target.value })} />
                  <input type="time" value={row.end_time} disabled={!row.is_working} onChange={(event) => updateSchedule(index, { end_time: event.target.value })} />
                  <span className="pacific-preview">{row.is_working ? previews[index]?.label || 'Enter valid times' : 'Off'}</span>
                </div>
              )
            })}
          </div>

          {pacificWeekendDays.length > 0 && (
            <div className="weekend-card">
              <h3>Pacific weekend shift detected</h3>
              <p className="muted">Your schedule touches {pacificWeekendDays.join(' and ')} in America/Los_Angeles.</p>
              <label className="field">
                <span>Will you be on alternating weekend shifts?</span>
                <select value={alternatingWeekend ? 'yes' : 'no'} onChange={(event) => { setAlternatingWeekend(event.target.value === 'yes'); setWeekendWorking('') }}>
                  <option value="no">No</option><option value="yes">Yes</option>
                </select>
              </label>
              {alternatingWeekend && (
                <label className="field">
                  <span>Will you have a weekend shift this week?</span>
                  <select value={weekendWorking} onChange={(event) => setWeekendWorking(event.target.value as 'yes' | 'no' | '')} required>
                    <option value="">Select</option>
                    <option value="yes">Yes — this weekend is working</option>
                    <option value="no">No — this weekend is off</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving profile and schedule…' : 'Submit for approval'}</button>
        </form>
      </div>
    </div>
  )
}
