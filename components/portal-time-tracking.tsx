'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PortalLiveStatus from '@/components/portal-live-status'

const supabase = createClient()

type TimeEntry = {
  id: string
  work_date: string
  clock_in: string
  clock_out: string | null
  ot_eligible: boolean
  is_unscheduled: boolean
}

export default function PortalTimeTracking({
  onMessage,
  onError,
}: {
  onMessage: (value: string) => void
  onError: (value: string) => void
}) {
  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [onBreak, setOnBreak] = useState(false)
  const [recent, setRecent] = useState<TimeEntry[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyAction, setBusyAction] = useState('')

  async function load() {
    const [{ data: entries }, { data: breaks }] = await Promise.all([
      supabase.from('time_entries').select('*').order('clock_in', { ascending: false }).limit(7),
      supabase.from('breaks').select('id').is('ended_at', null).limit(1),
    ])
    const rows = (entries || []) as TimeEntry[]
    setRecent(rows)
    setEntry(rows.find((row) => !row.clock_out) || null)
    setOnBreak(Boolean(breaks?.length))
  }

  useEffect(() => { load() }, [])

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

  return (
    <div className="stack">
      <PortalLiveStatus refreshKey={refreshKey} />

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

      <div className="card">
        <div className="section-head"><div><h2>Recent entries</h2><p className="muted">Your latest attendance records.</p></div><button className="btn btn-secondary" type="button" onClick={load}>Refresh</button></div>
        <div className="list" style={{ marginTop: 16 }}>
          {recent.length === 0 && <div className="empty-state">No time entries yet.</div>}
          {recent.map((row) => (
            <div className="row" key={row.id}>
              <div><strong>{row.work_date}</strong><div className="muted">{new Date(row.clock_in).toLocaleTimeString()} → {row.clock_out ? new Date(row.clock_out).toLocaleTimeString() : 'Open'}</div></div>
              <span className="pill">{row.ot_eligible ? 'OT Eligible' : row.is_unscheduled ? 'Unscheduled' : 'Regular'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
