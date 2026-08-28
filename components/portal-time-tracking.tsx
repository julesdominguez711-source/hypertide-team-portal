'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PortalLiveStatus from '@/components/portal-live-status'

const supabase = createClient()

type TimeEntry = {
  id: string
  work_date: string
  clock_in: string
  clock_out: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  ot_eligible: boolean
  is_unscheduled: boolean
  status: string
}

type OtRequest = {
  id: string
  time_entry_id: string
  requested_minutes: number
  reason: string | null
  status: string
  review_note: string | null
  created_at: string
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours ? `${hours}h ${mins}m` : `${mins}m`
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PortalTimeTracking({
  employeeId,
  onMessage,
  onError,
}: {
  employeeId: string
  onMessage: (value: string) => void
  onError: (value: string) => void
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [onBreak, setOnBreak] = useState(false)
  const [recent, setRecent] = useState<TimeEntry[]>([])
  const [otRequests, setOtRequests] = useState<OtRequest[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyAction, setBusyAction] = useState('')
  const [otTarget, setOtTarget] = useState<TimeEntry | null>(null)
  const [otReason, setOtReason] = useState('')

  async function load() {
    const [{ data: entries, error: entryError }, { data: breaks, error: breakError }, { data: otRows, error: otError }] = await Promise.all([
      supabase.from('time_entries').select('*').eq('employee_id', employeeId).order('clock_in', { ascending: false }).limit(14),
      supabase.from('breaks').select('id').eq('employee_id', employeeId).is('ended_at', null).limit(1),
      supabase.from('ot_requests').select('*').eq('employee_id', employeeId).order('created_at', { ascending: false }),
    ])
    if (entryError || breakError || otError) onError((entryError || breakError || otError)?.message || 'Unable to load time tracking.')
    const rows = (entries || []) as TimeEntry[]
    setRecent(rows)
    setEntry(rows.find((row) => !row.clock_out) || null)
    setOnBreak(Boolean(breaks?.length))
    setOtRequests((otRows || []) as OtRequest[])
  }

  useEffect(() => { load() }, [employeeId])

  const otByEntry = useMemo(() => new Map(otRequests.map((request) => [request.time_entry_id, request])), [otRequests])
  const eligibleCount = recent.filter((row) => row.ot_eligible && row.clock_out && !otByEntry.has(row.id)).length

  async function run(fn: string, ok: string, action: string) {
    setBusyAction(action)
    onError('')
    onMessage('')
    const { error } = await supabase.rpc(fn)
    if (error) onError(error.message)
    else {
      onMessage(ok)
      await load()
      setRefreshKey((value) => value + 1)
    }
    setBusyAction('')
  }

  async function submitOt(event: FormEvent) {
    event.preventDefault()
    if (!otTarget) return
    setBusyAction('ot')
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('submit_ot_request', {
      p_time_entry_id: otTarget.id,
      p_reason: otReason || null,
    })
    if (error) onError(error.message)
    else {
      onMessage('OT request submitted for Manager approval.')
      setOtTarget(null)
      setOtReason('')
      await load()
    }
    setBusyAction('')
  }

  return (
    <div className="stack">
      <PortalLiveStatus employeeId={employeeId} refreshKey={refreshKey} />

      <div className="card">
        <div className="section-head">
          <div><h2>Current shift</h2><p className="muted">Attendance uses server time, not the browser clock.</p></div>
          <span className={`status-badge ${onBreak ? 'pending' : entry ? 'approved' : ''}`}>{onBreak ? 'On Break' : entry ? 'Working' : 'Not Clocked In'}</span>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          {!entry && <button className="btn btn-primary" disabled={Boolean(busyAction)} onClick={() => run('clock_in_now', 'Clocked in successfully.', 'clock-in')}>{busyAction === 'clock-in' ? 'Clocking In…' : 'Clock In'}</button>}
          {entry && !onBreak && <button className="btn btn-secondary" disabled={Boolean(busyAction)} onClick={() => run('start_paid_break', 'Paid break started.', 'break')}>{busyAction === 'break' ? 'Starting…' : 'Start Break'}</button>}
          {entry && onBreak && <button className="btn btn-secondary" disabled={Boolean(busyAction)} onClick={() => run('end_paid_break', 'Break ended.', 'resume')}>{busyAction === 'resume' ? 'Resuming…' : 'Resume Work'}</button>}
          {entry && <button className="btn btn-primary" disabled={Boolean(busyAction)} onClick={() => run('clock_out_now', 'Clocked out successfully.', 'clock-out')}>{busyAction === 'clock-out' ? 'Clocking Out…' : 'Clock Out'}</button>}
        </div>
      </div>

      <div className="summary-strip">
        <div className="mini-stat"><span>OT awaiting request</span><strong>{eligibleCount}</strong></div>
        <div className="mini-stat"><span>Pending OT</span><strong>{otRequests.filter((r) => r.status === 'pending').length}</strong></div>
        <div className="mini-stat"><span>Approved OT</span><strong>{otRequests.filter((r) => r.status === 'approved').length}</strong></div>
      </div>

      <div className="card">
        <div className="section-head"><div><h2>Recent entries</h2><p className="muted">OT becomes eligible only after clock-out and always needs Manager approval.</p></div><button className="btn btn-secondary" type="button" onClick={load}>Refresh</button></div>
        <div className="list" style={{ marginTop: 16 }}>
          {recent.length === 0 && <div className="empty-state">No time entries yet.</div>}
          {recent.map((row) => {
            const ot = otByEntry.get(row.id)
            return <div className="row time-entry-row" key={row.id}>
              <div>
                <strong>{row.work_date}</strong>
                <div className="muted">{new Date(row.clock_in).toLocaleTimeString()} → {row.clock_out ? new Date(row.clock_out).toLocaleTimeString() : 'Open'}</div>
                <div className="entry-meta">{row.is_unscheduled ? 'Unscheduled shift' : 'Scheduled shift'} · {pretty(row.status)}</div>
                {ot?.review_note && <div className="muted">Manager note: {ot.review_note}</div>}
              </div>
              <div className="actions">
                {row.ot_eligible && row.clock_out && !ot && <button type="button" className="btn btn-primary" onClick={() => { setOtTarget(row); setOtReason('') }}>Request OT</button>}
                {ot && <span className={`status-badge ${ot.status}`}>{minutesLabel(ot.requested_minutes)} · {pretty(ot.status)}</span>}
                {!row.ot_eligible && <span className="pill">{row.is_unscheduled ? 'Unscheduled' : 'Regular'}</span>}
              </div>
            </div>
          })}
        </div>
      </div>

      <div className="card">
        <h2>OT history</h2>
        <div className="list">
          {otRequests.length === 0 && <div className="empty-state">No OT requests yet.</div>}
          {otRequests.map((request) => <div className="row" key={request.id}><div><strong>{minutesLabel(request.requested_minutes)}</strong><div className="muted">{request.reason || 'No reason provided'}</div>{request.review_note && <div className="muted">Review: {request.review_note}</div>}</div><span className={`status-badge ${request.status}`}>{pretty(request.status)}</span></div>)}
        </div>
      </div>

      {otTarget && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOtTarget(null) }}>
        <div className="modal-card">
          <div className="section-head"><div><h2>Submit OT request</h2><p className="muted">{otTarget.work_date} · this request cannot auto-approve.</p></div><button type="button" className="icon-button" onClick={() => setOtTarget(null)}>×</button></div>
          <form className="stack" style={{ marginTop: 16 }} onSubmit={submitOt}>
            <label className="field"><span>Reason / work completed</span><textarea rows={4} value={otReason} onChange={(e) => setOtReason(e.target.value)} placeholder="Optional context for your Manager" /></label>
            <div className="actions"><button type="button" className="btn btn-secondary" onClick={() => setOtTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={busyAction === 'ot'}>{busyAction === 'ot' ? 'Submitting…' : 'Submit OT'}</button></div>
          </form>
        </div>
      </div>}
    </div>
  )
}
