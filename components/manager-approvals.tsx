'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  requested_role: 'manager' | 'teammate' | 'dev'
  requested_manager_id: string | null
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  onboarding_complete: boolean
}

type LeaveReview = { id: string; employee_id: string; employee_name: string; employee_email: string; start_date: string; end_date: string; credits_requested: number; reason: string | null }
type OtReview = { id: string; employee_id: string; requested_minutes: number; reason: string | null }
type ScheduleReview = { id: string; employee_id: string; requested_schedule: Array<{ is_working: boolean }>; effective_date: string | null; reason: string | null }
type SwapReview = { id: string; requester_id: string; swap_with_id: string; requester_date: string; swap_with_date: string; reason: string | null }

function name(profile?: Profile) { return profile?.nickname || profile?.full_name || profile?.email || 'Employee' }
function pretty(value: string) { return value === 'dev' ? 'Dev' : value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
function dateLabel(value: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function minutesLabel(value: number) { const h = Math.floor(value / 60); const m = value % 60; return h ? `${h}h ${m}m` : `${m}m` }

export default function ManagerApprovals({ onMessage, onError, onCountChange }: { onMessage: (value: string) => void; onError: (value: string) => void; onCountChange?: (value: number) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [leaveRows, setLeaveRows] = useState<LeaveReview[]>([])
  const [otRows, setOtRows] = useState<OtReview[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleReview[]>([])
  const [swapRows, setSwapRows] = useState<SwapReview[]>([])
  const [busyId, setBusyId] = useState('')
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles])
  const pendingProfiles = profiles.filter((p) => p.status === 'pending' && p.onboarding_complete)
  const total = pendingProfiles.length + leaveRows.length + otRows.length + scheduleRows.length + swapRows.length

  async function load() {
    const [p, l, o, s, w] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_leave_requests_for_review'),
      supabase.from('ot_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('schedule_requests').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('shift_swap_requests').select('*').eq('status', 'pending').order('created_at'),
    ])
    const error = p.error || l.error || o.error || s.error || w.error
    if (error) onError(error.message)
    setProfiles((p.data || []) as Profile[])
    setLeaveRows((l.data || []) as LeaveReview[])
    setOtRows((o.data || []) as OtReview[])
    setScheduleRows((s.data || []) as ScheduleReview[])
    setSwapRows((w.data || []) as SwapReview[])
  }

  useEffect(() => { load() }, [])
  useEffect(() => { onCountChange?.(total) }, [total, onCountChange])

  async function approveProfile(profile: Profile) {
    setBusyId(profile.id)
    const { error } = await supabase.rpc('approve_profile', { p_user_id: profile.id, p_role: profile.requested_role, p_manager_id: profile.requested_role === 'manager' ? null : profile.requested_manager_id })
    if (error) onError(error.message); else { onMessage(`${name(profile)} approved.`); await load() }
    setBusyId('')
  }

  async function review(kind: 'leave' | 'ot' | 'schedule' | 'swap', id: string, decision: 'approve' | 'reject') {
    setBusyId(id)
    onError('')
    const fn = kind === 'leave' ? 'review_leave_request' : kind === 'ot' ? 'review_ot_request' : kind === 'schedule' ? 'review_schedule_request' : 'review_shift_swap_request'
    const { error } = await supabase.rpc(fn, { p_request_id: id, p_decision: decision, p_review_note: null })
    if (error) onError(error.message)
    else { onMessage(`${pretty(kind)} request ${decision === 'approve' ? 'approved' : 'rejected'}.`); await load() }
    setBusyId('')
  }

  const actionButtons = (kind: 'leave' | 'ot' | 'schedule' | 'swap', id: string) => <div className="actions"><button className="btn btn-secondary" disabled={busyId === id} onClick={() => review(kind, id, 'reject')}>Reject</button><button className="btn btn-primary" disabled={busyId === id} onClick={() => review(kind, id, 'approve')}>{busyId === id ? 'Saving…' : 'Approve'}</button></div>

  return <div className="stack">
    <div className="card"><div className="section-head"><div><h2>New account approvals</h2><p className="muted">Only Admin can grant Manager/Admin roles.</p></div><span className="pill">{pendingProfiles.length}</span></div><div className="list" style={{ marginTop: 16 }}>{pendingProfiles.length === 0 && <div className="empty-state">No pending profiles.</div>}{pendingProfiles.map((p) => <div className="row" key={p.id}><div><strong>{name(p)}</strong><div className="muted">{p.email} · requests {pretty(p.requested_role)}</div></div><button className="btn btn-primary" disabled={busyId === p.id} onClick={() => approveProfile(p)}>{busyId === p.id ? 'Approving…' : 'Approve'}</button></div>)}</div></div>

    <div className="card"><div className="section-head"><div><h2>Leave approvals</h2><p className="muted">Requests outside the auto-approval limits.</p></div><span className="pill">{leaveRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{leaveRows.length === 0 && <div className="empty-state">No leave approvals.</div>}{leaveRows.map((r) => <div className="row" key={r.id}><div><strong>{r.employee_name}</strong><div className="muted">{dateLabel(r.start_date)} to {dateLabel(r.end_date)} · {r.credits_requested} credit(s)</div>{r.reason && <div className="muted">{r.reason}</div>}</div>{actionButtons('leave', r.id)}</div>)}</div></div>

    <div className="card"><div className="section-head"><div><h2>Overtime approvals</h2><p className="muted">OT is never auto-approved.</p></div><span className="pill">{otRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{otRows.length === 0 && <div className="empty-state">No OT approvals.</div>}{otRows.map((r) => <div className="row" key={r.id}><div><strong>{name(profileMap.get(r.employee_id))}</strong><div className="muted">{minutesLabel(r.requested_minutes)} · {r.reason || 'No reason provided'}</div></div>{actionButtons('ot', r.id)}</div>)}</div></div>

    <div className="card"><div className="section-head"><div><h2>Schedule-change approvals</h2><p className="muted">Approval creates a new effective-dated schedule version.</p></div><span className="pill">{scheduleRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{scheduleRows.length === 0 && <div className="empty-state">No schedule approvals.</div>}{scheduleRows.map((r) => <div className="row" key={r.id}><div><strong>{name(profileMap.get(r.employee_id))}</strong><div className="muted">Effective {dateLabel(r.effective_date)} · {r.requested_schedule?.filter((d) => d.is_working).length || 0} working day(s)</div><div className="muted">{r.reason}</div></div>{actionButtons('schedule', r.id)}</div>)}</div></div>

    <div className="card"><div className="section-head"><div><h2>Shift-swap approvals</h2><p className="muted">Approval creates date-specific schedule overrides.</p></div><span className="pill">{swapRows.length}</span></div><div className="list" style={{ marginTop: 16 }}>{swapRows.length === 0 && <div className="empty-state">No shift-swap approvals.</div>}{swapRows.map((r) => <div className="row" key={r.id}><div><strong>{name(profileMap.get(r.requester_id))} ↔ {name(profileMap.get(r.swap_with_id))}</strong><div className="muted">{dateLabel(r.requester_date)} ↔ {dateLabel(r.swap_with_date)}</div><div className="muted">{r.reason}</div></div>{actionButtons('swap', r.id)}</div>)}</div></div>
  </div>
}
