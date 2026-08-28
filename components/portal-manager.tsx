'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ManagerScheduleEditor from '@/components/manager-schedule-editor'

const supabase = createClient()

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'manager' | 'teammate' | 'dev'
  requested_role: 'manager' | 'teammate' | 'dev'
  requested_manager_id: string | null
  manager_id: string | null
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type ManagerOption = { id: string; full_name: string | null; nickname: string | null; email: string; role: string }
type AttendanceRow = { employee_id: string; employee_name: string; email: string; role: string; manager_id: string | null; timezone: string; attendance_status: string; clock_in: string | null; break_started: string | null; leave_credits: number | null }
type LeaveReview = { id: string; employee_id: string; employee_name: string; employee_email: string; leave_type: string; start_date: string; end_date: string; credits_requested: number; reason: string | null; status: string; created_at: string }
type OtReview = { id: string; employee_id: string; time_entry_id: string; requested_minutes: number; reason: string | null; status: string; created_at: string }
type ScheduleReview = { id: string; employee_id: string; requested_schedule: Array<{ weekday: number; is_working: boolean; start_time: string; end_time: string }>; effective_date: string | null; reason: string | null; status: string; created_at: string }
type SwapReview = { id: string; requester_id: string; swap_with_id: string; requester_date: string; swap_with_date: string; reason: string | null; status: string; created_at: string }
type AuditRow = { id: number; actor_id: string | null; actor_name: string; action: string; entity_type: string; entity_id: string | null; old_value: unknown; new_value: unknown; reason: string | null; created_at: string }
type TimeEntry = { id: string; employee_id: string; work_date: string; clock_in: string; clock_out: string | null; status: string; ot_eligible: boolean; is_unscheduled: boolean }

function displayName(profile: Pick<Profile, 'nickname' | 'full_name' | 'email'>) { return profile.nickname || profile.full_name || profile.email }
function managerLabel(manager: ManagerOption) { return manager.nickname || manager.full_name || manager.email }
function pretty(value: string) { return value === 'dev' ? 'Dev' : value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
function dateLabel(value: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function minutesLabel(value: number) { const h = Math.floor(value / 60); const m = value % 60; return h ? `${h}h ${m}m` : `${m}m` }
function ptLabel(value: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) + ' PT' }

function pacificInput(value: string | null) {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`
}

function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  return { year: +map.year, month: +map.month, day: +map.day, hour: +map.hour, minute: +map.minute, second: +map.second }
}

function pacificToIso(value: string) {
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const target = Date.UTC(year, month - 1, day, hour, minute, 0)
  let guess = new Date(target)
  for (let i = 0; i < 4; i += 1) {
    const p = partsAt(guess, 'America/Los_Angeles')
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess.getTime()
    guess = new Date(target - offset)
  }
  return guess.toISOString()
}

function PersonManagerRow({ profile, managers, currentRole, onSaved, onMessage, onError }: { profile: Profile; managers: ManagerOption[]; currentRole: string; onSaved: () => Promise<void>; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [managerId, setManagerId] = useState(profile.manager_id || '')
  const [status, setStatus] = useState(profile.status === 'pending' ? 'active' : profile.status)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const restricted = currentRole !== 'admin' && (profile.role === 'admin' || profile.role === 'manager')

  async function save() {
    setBusy(true)
    onError('')
    const { error } = await supabase.rpc('manage_profile', { p_user_id: profile.id, p_manager_id: profile.role === 'admin' || profile.role === 'manager' ? null : managerId || null, p_status: status, p_reason: reason })
    if (error) onError(error.message)
    else { onMessage(`${displayName(profile)} updated.`); setReason(''); await onSaved() }
    setBusy(false)
  }

  return <div className="people-admin-row">
    <div className="people-admin-person"><strong>{displayName(profile)}</strong><span>{profile.email}</span><span>{pretty(profile.role)} · {profile.timezone}</span></div>
    <select disabled={restricted || profile.role === 'admin' || profile.role === 'manager'} value={managerId} onChange={(e) => setManagerId(e.target.value)}><option value="">Unassigned</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{managerLabel(manager)}</option>)}</select>
    <select disabled={restricted || profile.status === 'pending'} value={status} onChange={(e) => setStatus(e.target.value as Profile['status'])}><option value="active">Active</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select>
    <input disabled={restricted || profile.status === 'pending'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={restricted ? 'Admin only' : 'Reason required'} />
    <button className="btn btn-primary" disabled={restricted || profile.status === 'pending' || !reason.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
  </div>
}

export default function PortalManager({ currentProfile, onMessage, onError }: { currentProfile: Profile; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [section, setSection] = useState<'Overview' | 'Approvals' | 'People' | 'Schedules' | 'Corrections' | 'Audit'>('Overview')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [attendance, setAttendance] = useState<AttendanceRow[]>([])
  const [leaveRows, setLeaveRows] = useState<LeaveReview[]>([])
  const [otRows, setOtRows] = useState<OtReview[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleReview[]>([])
  const [swapRows, setSwapRows] = useState<SwapReview[]>([])
  const [auditRows, setAuditRows] = useState<AuditRow[]>([])
  const [busyId, setBusyId] = useState('')
  const [correctionEmployee, setCorrectionEmployee] = useState('')
  const [correctionEntries, setCorrectionEntries] = useState<TimeEntry[]>([])
  const [correctionTarget, setCorrectionTarget] = useState<TimeEntry | null>(null)
  const [clockInEdit, setClockInEdit] = useState('')
  const [clockOutEdit, setClockOutEdit] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')
  const [loading, setLoading] = useState(true)

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const pendingProfiles = profiles.filter((p) => p.status === 'pending' && p.onboarding_complete)
  const manageablePeople = profiles.filter((p) => p.onboarding_complete && p.status !== 'pending')
  const approvalCount = pendingProfiles.length + leaveRows.length + otRows.length + scheduleRows.length + swapRows.length

  async function load() {
    setLoading(true)
    const [profileResult, managerResult, attendanceResult, leaveResult, otResult, scheduleResult, swapResult, auditResult] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_active_managers'),
      supabase.rpc('manager_attendance_snapshot'),
      supabase.rpc('list_leave_requests_for_review'),
      supabase.from('ot_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('schedule_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('shift_swap_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.rpc('list_audit_logs', { p_limit: 100 }),
    ])
    const firstError = profileResult.error || managerResult.error || attendanceResult.error || leaveResult.error || otResult.error || scheduleResult.error || swapResult.error || auditResult.error
    if (firstError) onError(firstError.message)
    setProfiles((profileResult.data || []) as Profile[])
    setManagers((managerResult.data || []) as ManagerOption[])
    setAttendance((attendanceResult.data || []) as AttendanceRow[])
    setLeaveRows((leaveResult.data || []) as LeaveReview[])
    setOtRows((otResult.data || []) as OtReview[])
    setScheduleRows((scheduleResult.data || []) as ScheduleReview[])
    setSwapRows((swapResult.data || []) as SwapReview[])
    setAuditRows((auditResult.data || []) as AuditRow[])
    setCorrectionEmployee((current) => current || ((profileResult.data || []) as Profile[]).find((p) => p.status !== 'pending')?.id || '')
    setLoading(false)
  }

  useEffect(() => { load(); const poll = window.setInterval(loadAttendanceOnly, 30000); return () => window.clearInterval(poll) }, [])

  async function loadAttendanceOnly() {
    const { data } = await supabase.rpc('manager_attendance_snapshot')
    if (data) setAttendance(data as AttendanceRow[])
  }

  useEffect(() => {
    if (!correctionEmployee) return
    supabase.from('time_entries').select('*').eq('employee_id', correctionEmployee).order('clock_in', { ascending: false }).limit(20).then(({ data, error }) => {
      if (error) onError(error.message)
      else setCorrectionEntries((data || []) as TimeEntry[])
    })
  }, [correctionEmployee])

  async function approveProfile(profile: Profile) {
    setBusyId(profile.id)
    const { error } = await supabase.rpc('approve_profile', { p_user_id: profile.id, p_role: profile.requested_role, p_manager_id: profile.requested_role === 'manager' ? null : profile.requested_manager_id })
    if (error) onError(error.message); else { onMessage(`${displayName(profile)} approved.`); await load() }
    setBusyId('')
  }

  async function review(kind: 'leave' | 'ot' | 'schedule' | 'swap', id: string, decision: 'approve' | 'reject') {
    setBusyId(id)
    onError('')
    const fn = kind === 'leave' ? 'review_leave_request' : kind === 'ot' ? 'review_ot_request' : kind === 'schedule' ? 'review_schedule_request' : 'review_shift_swap_request'
    const args = kind === 'leave' ? { p_request_id: id, p_decision: decision, p_review_note: null } : { p_request_id: id, p_decision: decision, p_review_note: null }
    const { error } = await supabase.rpc(fn, args)
    if (error) onError(error.message); else { onMessage(`${pretty(kind)} request ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() }
    setBusyId('')
  }

  function openCorrection(entry: TimeEntry) {
    setCorrectionTarget(entry)
    setClockInEdit(pacificInput(entry.clock_in))
    setClockOutEdit(pacificInput(entry.clock_out))
    setCorrectionReason('')
  }

  async function saveCorrection(event: FormEvent) {
    event.preventDefault()
    if (!correctionTarget) return
    setBusyId(correctionTarget.id)
    const { error } = await supabase.rpc('correct_time_entry', {
      p_time_entry_id: correctionTarget.id,
      p_clock_in: pacificToIso(clockInEdit),
      p_clock_out: clockOutEdit ? pacificToIso(clockOutEdit) : null,
      p_reason: correctionReason,
    })
    if (error) onError(error.message)
    else {
      onMessage('Time entry corrected and audit history recorded.')
      setCorrectionTarget(null)
      const { data } = await supabase.from('time_entries').select('*').eq('employee_id', correctionEmployee).order('clock_in', { ascending: false }).limit(20)
      setCorrectionEntries((data || []) as TimeEntry[])
      await load()
    }
    setBusyId('')
  }

  const counts = useMemo(() => ({
    Working: attendance.filter((r) => r.attendance_status === 'Working').length,
    Break: attendance.filter((r) => r.attendance_status === 'Break').length,
    Leave: attendance.filter((r) => r.attendance_status === 'Leave').length,
    'Not clocked in': attendance.filter((r) => r.attendance_status === 'Not clocked in').length,
  }), [attendance])

  return <div className="stack manager-portal">
    <div className="manager-tabs">{(['Overview', 'Approvals', 'People', 'Schedules', 'Corrections', 'Audit'] as const).map((item) => <button type="button" className={section === item ? 'active' : ''} key={item} onClick={() => setSection(item)}>{item}{item === 'Approvals' && approvalCount > 0 ? <span>{approvalCount}</span> : null}</button>)}</div>

    {loading && profiles.length === 0 ? <div className="card">Loading management dashboard…</div> : null}

    {section === 'Overview' && <>
      <div className="manager-kpi-grid">
        <div className="card manager-kpi"><span>Working</span><strong>{counts.Working}</strong></div>
        <div className="card manager-kpi"><span>On Break</span><strong>{counts.Break}</strong></div>
        <div className="card manager-kpi"><span>On Leave</span><strong>{counts.Leave}</strong></div>
        <div className="card manager-kpi"><span>Not Clocked In</span><strong>{counts['Not clocked in']}</strong></div>
        <div className="card manager-kpi"><span>Pending Actions</span><strong>{approvalCount}</strong></div>
      </div>
      <div className="card">
        <div className="section-head"><div><h2>Live attendance</h2><p className="muted">Refreshes automatically every 30 seconds.</p></div><button className="btn btn-secondary" onClick={loadAttendanceOnly}>Refresh now</button></div>
        <div className="attendance-grid" style={{ marginTop: 16 }}>{attendance.map((row) => <div className="attendance-person" key={row.employee_id}><div><strong>{row.employee_name}</strong><span>{pretty(row.role)} · {row.timezone}</span></div><div className="attendance-right"><span className={`status-badge attendance-${row.attendance_status.toLowerCase().replaceAll(' ', '-')}`}>{row.attendance_status}</span>{row.clock_in && <small>In {ptLabel(row.clock_in)}</small>}{row.break_started && <small>Break {ptLabel(row.break_started)}</small>}</div></div>)}</div>
      </div>
    </>}

    {section === 'Approvals' && <div className="stack">
      <div className="card"><div className="section-head"><div><h2>New account approvals</h2><p className="muted">Only Admin can grant Manager/Admin roles.</p></div><span className="pill">{pendingProfiles.length}</span></div><div className="list" style={{ marginTop: 16 }}>{pendingProfiles.length === 0 && <div className="empty-state">No pending profiles.</div>}{pendingProfiles.map((p) => <div className="row" key={p.id}><div><strong>{displayName(p)}</strong><div className="muted">{p.email} · requests {pretty(p.requested_role)}</div></div><button className="btn btn-primary" disabled={busyId === p.id} onClick={() => approveProfile(p)}>{busyId === p.id ? 'Approving…' : 'Approve'}</button></div>)}</div></div>

      <div className="card"><div className="section-head"><div><h2>Leave</h2><p className="muted">Requests outside auto-approval rules.</p></div><span className="pill">{leaveRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{leaveRows.length === 0 && <div className="empty-state">No leave approvals.</div>}{leaveRows.map((r) => <div className="row" key={r.id}><div><strong>{r.employee_name}</strong><div className="muted">{dateLabel(r.start_date)} to {dateLabel(r.end_date)} · {r.credits_requested} credit(s)</div>{r.reason && <div className="muted">{r.reason}</div>}</div><div className="actions"><button className="btn btn-secondary" disabled={busyId === r.id} onClick={() => review('leave', r.id, 'reject')}>Reject</button><button className="btn btn-primary" disabled={busyId === r.id} onClick={() => review('leave', r.id, 'approve')}>Approve</button></div></div>)}</div></div>

      <div className="card"><div className="section-head"><div><h2>Overtime</h2><p className="muted">OT is never auto-approved.</p></div><span className="pill">{otRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{otRows.length === 0 && <div className="empty-state">No OT approvals.</div>}{otRows.map((r) => <div className="row" key={r.id}><div><strong>{displayName(profileMap.get(r.employee_id) || { nickname: null, full_name: null, email: 'Employee' })}</strong><div className="muted">{minutesLabel(r.requested_minutes)} · {r.reason || 'No reason provided'}</div></div><div className="actions"><button className="btn btn-secondary" disabled={busyId === r.id} onClick={() => review('ot', r.id, 'reject')}>Reject</button><button className="btn btn-primary" disabled={busyId === r.id} onClick={() => review('ot', r.id, 'approve')}>Approve</button></div></div>)}</div></div>

      <div className="card"><div className="section-head"><div><h2>Schedule changes</h2><p className="muted">Approved requests create an effective-dated schedule version.</p></div><span className="pill">{scheduleRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{scheduleRows.length === 0 && <div className="empty-state">No schedule approvals.</div>}{scheduleRows.map((r) => <div className="row" key={r.id}><div><strong>{displayName(profileMap.get(r.employee_id) || { nickname: null, full_name: null, email: 'Employee' })}</strong><div className="muted">Effective {dateLabel(r.effective_date)} · {r.requested_schedule?.filter((d) => d.is_working).length || 0} working day(s)</div><div className="muted">{r.reason}</div></div><div className="actions"><button className="btn btn-secondary" disabled={busyId === r.id} onClick={() => review('schedule', r.id, 'reject')}>Reject</button><button className="btn btn-primary" disabled={busyId === r.id} onClick={() => review('schedule', r.id, 'approve')}>Approve</button></div></div>)}</div></div>

      <div className="card"><div className="section-head"><div><h2>Shift swaps</h2><p className="muted">Approval creates date-specific overrides for both teammates.</p></div><span className="pill">{swapRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{swapRows.length === 0 && <div className="empty-state">No shift swap approvals.</div>}{swapRows.map((r) => <div className="row" key={r.id}><div><strong>{displayName(profileMap.get(r.requester_id) || { nickname: null, full_name: null, email: 'Employee' })} ↔ {displayName(profileMap.get(r.swap_with_id) || { nickname: null, full_name: null, email: 'Employee' })}</strong><div className="muted">{dateLabel(r.requester_date)} ↔ {dateLabel(r.swap_with_date)}</div><div className="muted">{r.reason}</div></div><div className="actions"><button className="btn btn-secondary" disabled={busyId === r.id} onClick={() => review('swap', r.id, 'reject')}>Reject</button><button className="btn btn-primary" disabled={busyId === r.id} onClick={() => review('swap', r.id, 'approve')}>Approve</button></div></div>)}</div></div>
    </div>}

    {section === 'People' && <div className="card"><div className="section-head"><div><h2>Employee management</h2><p className="muted">Reassign Managers or change employment status. Every save requires a reason and is audited.</p></div><button className="btn btn-secondary" onClick={load}>Refresh</button></div><div className="people-admin-table"><div className="people-admin-head"><strong>Employee</strong><strong>Manager</strong><strong>Status</strong><strong>Reason</strong><strong></strong></div>{manageablePeople.map((profile) => <PersonManagerRow key={profile.id} profile={profile} managers={managers} currentRole={currentProfile.role} onSaved={load} onMessage={onMessage} onError={onError} />)}</div></div>}

    {section === 'Schedules' && <ManagerScheduleEditor people={manageablePeople} onMessage={onMessage} onError={onError} />}

    {section === 'Corrections' && <div className="card"><div className="section-head"><div><h2>Attendance corrections</h2><p className="muted">Times are displayed and edited in Pacific Time. A correction reason is mandatory.</p></div><span className="status-badge approved">Audit logged</span></div><label className="field" style={{ marginTop: 16 }}><span>Employee</span><select value={correctionEmployee} onChange={(e) => setCorrectionEmployee(e.target.value)}>{manageablePeople.map((p) => <option key={p.id} value={p.id}>{displayName(p)}</option>)}</select></label><div className="list" style={{ marginTop: 16 }}>{correctionEntries.length === 0 && <div className="empty-state">No time entries for this employee.</div>}{correctionEntries.map((entry) => <div className="row" key={entry.id}><div><strong>{entry.work_date}</strong><div className="muted">{ptLabel(entry.clock_in)} → {ptLabel(entry.clock_out)} · {pretty(entry.status)}</div></div><button className="btn btn-secondary" onClick={() => openCorrection(entry)}>Edit</button></div>)}</div></div>}

    {section === 'Audit' && <div className="card"><div className="section-head"><div><h2>Audit log</h2><p className="muted">Actor, action, old/new values, reason, and timestamp.</p></div><button className="btn btn-secondary" onClick={load}>Refresh</button></div><div className="audit-list" style={{ marginTop: 16 }}>{auditRows.length === 0 && <div className="empty-state">No audit events yet.</div>}{auditRows.map((row) => <details className="audit-row" key={row.id}><summary><div><strong>{pretty(row.action)}</strong><span>{row.actor_name} · {row.entity_type}</span></div><div><span>{new Date(row.created_at).toLocaleString()}</span>{row.reason && <small>{row.reason}</small>}</div></summary><div className="audit-values"><div><strong>Old value</strong><pre>{JSON.stringify(row.old_value, null, 2)}</pre></div><div><strong>New value</strong><pre>{JSON.stringify(row.new_value, null, 2)}</pre></div></div></details>)}</div></div>}

    {correctionTarget && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setCorrectionTarget(null) }}><div className="modal-card"><div className="section-head"><div><h2>Correct time entry</h2><p className="muted">Pacific Time · {correctionTarget.work_date}</p></div><button className="icon-button" onClick={() => setCorrectionTarget(null)}>×</button></div><form className="stack" style={{ marginTop: 16 }} onSubmit={saveCorrection}><label className="field"><span>Clock in (Pacific)</span><input type="datetime-local" value={clockInEdit} onChange={(e) => setClockInEdit(e.target.value)} required /></label><label className="field"><span>Clock out (Pacific)</span><input type="datetime-local" value={clockOutEdit} onChange={(e) => setClockOutEdit(e.target.value)} /></label><label className="field"><span>Correction reason</span><textarea rows={3} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} required /></label><div className="actions"><button type="button" className="btn btn-secondary" onClick={() => setCorrectionTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={busyId === correctionTarget.id || !correctionReason.trim()}>{busyId === correctionTarget.id ? 'Saving…' : 'Save Correction'}</button></div></form></div></div>}
  </div>
}
