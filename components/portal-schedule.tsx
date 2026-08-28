'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DAYS, previewPacific, type ScheduleDraft } from '@/lib/schedule-utils'

const supabase = createClient()

type ScheduleRecord = ScheduleDraft & {
  id: string
  timezone: string
  effective_from: string
  effective_to: string | null
  notes?: string | null
}

type Profile = { id: string; timezone: string }

type ScheduleRequest = {
  id: string
  requested_schedule: ScheduleDraft[]
  effective_date: string | null
  reason: string | null
  status: string
  review_note: string | null
  created_at: string
}

type SwapPerson = { id: string; display_name: string; email: string; timezone: string }

type SwapRequest = {
  id: string
  requester_id: string
  swap_with_id: string
  requester_date: string
  swap_with_date: string
  reason: string | null
  status: string
  review_note: string | null
  created_at: string
}

type Rotation = {
  id: string
  pacific_weekend_day: 'Saturday' | 'Sunday'
  alternating: boolean
  anchor_week_start: string | null
  anchor_working: boolean | null
  active: boolean
}

type Override = {
  id: string
  work_date: string
  is_working: boolean
  start_time: string | null
  end_time: string | null
  timezone: string
  reason: string | null
}

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') {
    const target = event.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') event.preventDefault()
  }
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function todayInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  return `${map.year}-${map.month}-${map.day}`
}

export default function PortalSchedule({ profile, onMessage, onError }: { profile: Profile; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [rows, setRows] = useState<ScheduleRecord[]>([])
  const [historyRows, setHistoryRows] = useState<ScheduleRecord[]>([])
  const [requests, setRequests] = useState<ScheduleRequest[]>([])
  const [swaps, setSwaps] = useState<SwapRequest[]>([])
  const [people, setPeople] = useState<SwapPerson[]>([])
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [overrides, setOverrides] = useState<Override[]>([])
  const [draft, setDraft] = useState<ScheduleDraft[]>(DAYS.map((d) => ({ weekday: d.weekday, is_working: false, start_time: '09:00', end_time: '17:00' })))
  const [effectiveDate, setEffectiveDate] = useState('')
  const [scheduleReason, setScheduleReason] = useState('')
  const [swapWithId, setSwapWithId] = useState('')
  const [requesterDate, setRequesterDate] = useState('')
  const [swapWithDate, setSwapWithDate] = useState('')
  const [swapReason, setSwapReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const minDate = todayInZone(profile.timezone)

  async function load() {
    setLoading(true)
    const [currentResult, historyResult, requestResult, swapResult, peopleResult, rotationResult, overrideResult] = await Promise.all([
      supabase.rpc('get_my_current_schedule'),
      supabase.from('schedules').select('*').eq('employee_id', profile.id).order('effective_from', { ascending: false }).limit(35),
      supabase.from('schedule_requests').select('*').eq('employee_id', profile.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('shift_swap_requests').select('*').or(`requester_id.eq.${profile.id},swap_with_id.eq.${profile.id}`).order('created_at', { ascending: false }).limit(10),
      supabase.rpc('list_shift_swap_people'),
      supabase.from('weekend_rotations').select('*').eq('employee_id', profile.id).eq('active', true),
      supabase.from('schedule_overrides').select('*').eq('employee_id', profile.id).order('work_date', { ascending: false }).limit(12),
    ])

    const firstError = currentResult.error || historyResult.error || requestResult.error || swapResult.error || peopleResult.error || rotationResult.error || overrideResult.error
    if (firstError) onError(firstError.message)

    const current = (currentResult.data || []) as ScheduleRecord[]
    setRows(current)
    setHistoryRows((historyResult.data || []) as ScheduleRecord[])
    setRequests((requestResult.data || []) as ScheduleRequest[])
    setSwaps((swapResult.data || []) as SwapRequest[])
    const personRows = (peopleResult.data || []) as SwapPerson[]
    setPeople(personRows)
    setSwapWithId((currentValue) => currentValue || personRows[0]?.id || '')
    setRotations((rotationResult.data || []) as Rotation[])
    setOverrides((overrideResult.data || []) as Override[])

    const map = new Map(current.map((row) => [row.weekday, row]))
    setDraft(DAYS.map((day) => {
      const row = map.get(day.weekday)
      return {
        weekday: day.weekday,
        is_working: Boolean(row?.is_working),
        start_time: row?.start_time?.slice(0, 5) || '09:00',
        end_time: row?.end_time?.slice(0, 5) || '17:00',
      }
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [profile.id])

  const byWeekday = useMemo(() => new Map<number, ScheduleRecord>(rows.map((row) => [row.weekday, row])), [rows])
  const peopleMap = useMemo(() => new Map(people.map((person) => [person.id, person.display_name])), [people])
  const groupedHistory = useMemo(() => {
    const groups = new Map<string, ScheduleRecord[]>()
    for (const row of historyRows) {
      const key = row.effective_from
      groups.set(key, [...(groups.get(key) || []), row])
    }
    return Array.from(groups.entries()).slice(0, 5)
  }, [historyRows])

  function updateDraft(index: number, patch: Partial<ScheduleDraft>) {
    setDraft((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  async function submitSchedule(event: FormEvent) {
    event.preventDefault()
    setBusy('schedule')
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('submit_schedule_request', {
      p_schedule: draft,
      p_effective_date: effectiveDate,
      p_reason: scheduleReason,
    })
    if (error) onError(error.message)
    else {
      onMessage('Schedule change request submitted for Manager approval.')
      setScheduleReason('')
      setEffectiveDate('')
      await load()
    }
    setBusy('')
  }

  async function submitSwap(event: FormEvent) {
    event.preventDefault()
    setBusy('swap')
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('submit_shift_swap_request', {
      p_swap_with_id: swapWithId,
      p_requester_date: requesterDate,
      p_swap_with_date: swapWithDate,
      p_reason: swapReason,
    })
    if (error) onError(error.message)
    else {
      onMessage('Shift swap request submitted for Manager approval.')
      setRequesterDate('')
      setSwapWithDate('')
      setSwapReason('')
      await load()
    }
    setBusy('')
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="section-head">
          <div><h2>Current weekly schedule</h2><p className="muted">Local schedule beside the Pacific Time equivalent.</p></div>
          <div className="actions"><span className="pill">{profile.timezone}</span><button type="button" className="btn btn-secondary" onClick={load}>Refresh</button></div>
        </div>
        {loading ? <div className="empty-state" style={{ marginTop: 16 }}>Loading schedule…</div> : (
          <div className="schedule-table" style={{ marginTop: 16 }}>
            <div className="schedule-row schedule-head"><strong>Day</strong><strong>Status</strong><strong>Start</strong><strong>End</strong><strong>Pacific Time</strong></div>
            {DAYS.map((day, index) => {
              const row = byWeekday.get(day.weekday)
              if (!row || !row.is_working) return <div className="schedule-row" key={day.name}><strong>{day.name}</strong><span>Off</span><span>—</span><span>—</span><span className="muted">Off</span></div>
              const preview = previewPacific(row, index, row.timezone)
              return <div className="schedule-row" key={day.name}><strong>{day.name}</strong><span>Working</span><span>{row.start_time.slice(0, 5)}</span><span>{row.end_time.slice(0, 5)}</span><span className="pacific-preview">{preview?.label || '—'}</span></div>
            })}
          </div>
        )}
        {rotations.length > 0 && <div className="rotation-strip">{rotations.map((rotation) => <span key={rotation.id}><strong>{rotation.pacific_weekend_day}:</strong> {rotation.alternating ? `Alternating · anchor week ${rotation.anchor_working ? 'working' : 'off'}` : 'Every week'}</span>)}</div>}
      </div>

      <div className="two-column-grid">
        <div className="card">
          <div className="section-head"><div><h2>Request schedule change</h2><p className="muted">Changes only take effect after Manager approval.</p></div><span className="status-badge pending">Approval required</span></div>
          <form className="stack" style={{ marginTop: 16 }} onSubmit={submitSchedule} onKeyDown={preventEnterSubmit}>
            <div className="compact-schedule-editor">
              {DAYS.map((day, index) => <div className="compact-schedule-row" key={day.name}>
                <strong>{day.name}</strong>
                <select value={draft[index].is_working ? 'working' : 'off'} onChange={(e) => updateDraft(index, { is_working: e.target.value === 'working' })}><option value="working">Working</option><option value="off">Off</option></select>
                <input type="time" disabled={!draft[index].is_working} value={draft[index].start_time} onChange={(e) => updateDraft(index, { start_time: e.target.value })} />
                <input type="time" disabled={!draft[index].is_working} value={draft[index].end_time} onChange={(e) => updateDraft(index, { end_time: e.target.value })} />
              </div>)}
            </div>
            <div className="form-grid">
              <label className="field"><span>Effective date</span><input type="date" min={minDate} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required /></label>
              <label className="field"><span>Reason</span><input value={scheduleReason} onChange={(e) => setScheduleReason(e.target.value)} placeholder="Why is the schedule changing?" required /></label>
            </div>
            <button className="btn btn-primary" disabled={busy === 'schedule'}>{busy === 'schedule' ? 'Submitting…' : 'Submit Schedule Request'}</button>
          </form>
        </div>

        <div className="card">
          <div className="section-head"><div><h2>Request shift swap</h2><p className="muted">Swap one scheduled shift with another active teammate.</p></div><span className="status-badge pending">Approval required</span></div>
          <form className="stack" style={{ marginTop: 16 }} onSubmit={submitSwap} onKeyDown={preventEnterSubmit}>
            <label className="field"><span>Swap with</span><select value={swapWithId} onChange={(e) => setSwapWithId(e.target.value)} required><option value="">Choose teammate</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name} · {person.timezone}</option>)}</select></label>
            <div className="form-grid">
              <label className="field"><span>Your shift date</span><input type="date" min={minDate} value={requesterDate} onChange={(e) => setRequesterDate(e.target.value)} required /></label>
              <label className="field"><span>Their shift date</span><input type="date" min={minDate} value={swapWithDate} onChange={(e) => setSwapWithDate(e.target.value)} required /></label>
            </div>
            <label className="field"><span>Reason</span><textarea rows={3} value={swapReason} onChange={(e) => setSwapReason(e.target.value)} required /></label>
            <button className="btn btn-primary" disabled={busy === 'swap' || !swapWithId}>{busy === 'swap' ? 'Submitting…' : 'Submit Shift Swap'}</button>
          </form>
        </div>
      </div>

      <div className="two-column-grid">
        <div className="card">
          <h2>Request history</h2>
          <div className="list">
            {requests.length === 0 && <div className="empty-state">No schedule-change requests yet.</div>}
            {requests.map((request) => <div className="row" key={request.id}><div><strong>Effective {formatDate(request.effective_date)}</strong><div className="muted">{request.reason || 'No reason'} · {formatDate(request.created_at.slice(0, 10))}</div>{request.review_note && <div className="muted">Review: {request.review_note}</div>}</div><span className={`status-badge ${request.status}`}>{pretty(request.status)}</span></div>)}
          </div>
        </div>
        <div className="card">
          <h2>Shift swap history</h2>
          <div className="list">
            {swaps.length === 0 && <div className="empty-state">No shift swaps yet.</div>}
            {swaps.map((swap) => {
              const outgoing = swap.requester_id === profile.id
              const otherId = outgoing ? swap.swap_with_id : swap.requester_id
              return <div className="row" key={swap.id}><div><strong>{outgoing ? 'With' : 'From'} {peopleMap.get(otherId) || 'Teammate'}</strong><div className="muted">{formatDate(swap.requester_date)} ↔ {formatDate(swap.swap_with_date)}</div>{swap.review_note && <div className="muted">Review: {swap.review_note}</div>}</div><span className={`status-badge ${swap.status}`}>{pretty(swap.status)}</span></div>
            })}
          </div>
        </div>
      </div>

      <div className="two-column-grid">
        <div className="card">
          <h2>Schedule history</h2>
          <div className="list">
            {groupedHistory.map(([date, group]) => <div className="row" key={date}><div><strong>Effective {formatDate(date)}</strong><div className="muted">{group.filter((r) => r.is_working).length} working day(s) · {group[0]?.notes || 'Schedule version'}</div></div><span className="pill">{group.some((r) => !r.effective_to) ? 'Open-ended' : 'Historical'}</span></div>)}
          </div>
        </div>
        <div className="card">
          <h2>Date-specific overrides</h2>
          <div className="list">
            {overrides.length === 0 && <div className="empty-state">No date-specific overrides.</div>}
            {overrides.map((override) => <div className="row" key={override.id}><div><strong>{formatDate(override.work_date)}</strong><div className="muted">{override.is_working ? `${override.start_time?.slice(0, 5)}–${override.end_time?.slice(0, 5)} · ${override.timezone}` : 'Off'}{override.reason ? ` · ${override.reason}` : ''}</div></div><span className="pill">Override</span></div>)}
          </div>
        </div>
      </div>
    </div>
  )
}
