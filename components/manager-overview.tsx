'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type AttendanceRow = {
  employee_id: string
  employee_name: string
  email: string
  role: string
  timezone: string
  attendance_status: string
  clock_in: string | null
  break_started: string | null
}

function pretty(value: string) {
  return value === 'dev' ? 'Dev' : value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function ptLabel(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value)) + ' PT'
}

export default function ManagerOverview({ pendingCount, onError }: { pendingCount: number; onError: (value: string) => void }) {
  const [rows, setRows] = useState<AttendanceRow[]>([])

  async function load() {
    const { data, error } = await supabase.rpc('manager_attendance_snapshot')
    if (error) onError(error.message)
    else setRows((data || []) as AttendanceRow[])
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const counts = useMemo(() => ({
    working: rows.filter((r) => r.attendance_status === 'Working').length,
    break: rows.filter((r) => r.attendance_status === 'Break').length,
    leave: rows.filter((r) => r.attendance_status === 'Leave').length,
    absent: rows.filter((r) => r.attendance_status === 'Not clocked in').length,
  }), [rows])

  return <div className="stack">
    <div className="manager-kpi-grid">
      <div className="card manager-kpi"><span>Working</span><strong>{counts.working}</strong></div>
      <div className="card manager-kpi"><span>On Break</span><strong>{counts.break}</strong></div>
      <div className="card manager-kpi"><span>On Leave</span><strong>{counts.leave}</strong></div>
      <div className="card manager-kpi"><span>Not Clocked In</span><strong>{counts.absent}</strong></div>
      <div className="card manager-kpi"><span>Pending Actions</span><strong>{pendingCount}</strong></div>
    </div>
    <div className="card">
      <div className="section-head"><div><h2>Live attendance</h2><p className="muted">Refreshes automatically every 30 seconds.</p></div><button className="btn btn-secondary" onClick={load}>Refresh now</button></div>
      <div className="attendance-grid" style={{ marginTop: 16 }}>
        {rows.map((row) => <div className="attendance-person" key={row.employee_id}>
          <div><strong>{row.employee_name}</strong><span>{pretty(row.role)} · {row.timezone}</span></div>
          <div className="attendance-right">
            <span className={`status-badge attendance-${row.attendance_status.toLowerCase().replaceAll(' ', '-')}`}>{row.attendance_status}</span>
            {row.clock_in && <small>In {ptLabel(row.clock_in)}</small>}
            {row.break_started && <small>Break {ptLabel(row.break_started)}</small>}
          </div>
        </div>)}
      </div>
    </div>
  </div>
}
