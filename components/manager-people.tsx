'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'manager' | 'teammate' | 'dev'
  manager_id: string | null
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type ManagerOption = { id: string; full_name: string | null; nickname: string | null; email: string }

type ManagedStatus = 'active' | 'inactive' | 'terminated'

function name(profile: Pick<Profile, 'nickname' | 'full_name' | 'email'>) { return profile.nickname || profile.full_name || profile.email }
function managerName(manager: ManagerOption) { return manager.nickname || manager.full_name || manager.email }
function pretty(value: string) { return value === 'dev' ? 'Dev' : value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }

function PersonRow({ profile, managers, currentRole, onSaved, onMessage, onError }: { profile: Profile; managers: ManagerOption[]; currentRole: 'admin' | 'manager'; onSaved: () => Promise<void>; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [managerId, setManagerId] = useState(profile.manager_id || '')
  const [status, setStatus] = useState<ManagedStatus>(profile.status === 'active' ? 'active' : profile.status === 'inactive' ? 'inactive' : 'terminated')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const restricted = currentRole !== 'admin' && (profile.role === 'admin' || profile.role === 'manager')

  async function save() {
    setBusy(true)
    onError('')
    const { error } = await supabase.rpc('manage_profile', {
      p_user_id: profile.id,
      p_manager_id: profile.role === 'admin' || profile.role === 'manager' ? null : managerId || null,
      p_status: status,
      p_reason: reason,
    })
    if (error) onError(error.message)
    else {
      onMessage(`${name(profile)} updated.`)
      setReason('')
      await onSaved()
    }
    setBusy(false)
  }

  return <div className="people-admin-row">
    <div className="people-admin-person"><strong>{name(profile)}</strong><span>{profile.email}</span><span>{pretty(profile.role)} · {profile.timezone}</span></div>
    <select disabled={restricted || profile.role === 'admin' || profile.role === 'manager'} value={managerId} onChange={(e) => setManagerId(e.target.value)}><option value="">Unassigned</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{managerName(manager)}</option>)}</select>
    <select disabled={restricted} value={status} onChange={(e) => setStatus(e.target.value as ManagedStatus)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></select>
    <input disabled={restricted} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={restricted ? 'Admin only' : 'Reason required'} />
    <button className="btn btn-primary" disabled={restricted || !reason.trim() || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
  </div>
}

export default function ManagerPeople({ currentRole, onMessage, onError }: { currentRole: 'admin' | 'manager'; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [people, setPeople] = useState<Profile[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])

  async function load() {
    const [peopleResult, managerResult] = await Promise.all([
      supabase.from('profiles').select('*').neq('status', 'pending').eq('onboarding_complete', true).order('created_at'),
      supabase.rpc('list_active_managers'),
    ])
    const error = peopleResult.error || managerResult.error
    if (error) onError(error.message)
    setPeople((peopleResult.data || []) as Profile[])
    setManagers((managerResult.data || []) as ManagerOption[])
  }

  useEffect(() => { load() }, [])

  return <div className="card">
    <div className="section-head"><div><h2>Employee management</h2><p className="muted">Reassign Managers or change employment status. Every change requires a reason and is audited.</p></div><button className="btn btn-secondary" onClick={load}>Refresh</button></div>
    <div className="people-admin-table">
      <div className="people-admin-head"><strong>Employee</strong><strong>Manager</strong><strong>Status</strong><strong>Reason</strong><strong></strong></div>
      {people.map((profile) => <PersonRow key={profile.id} profile={profile} managers={managers} currentRole={currentRole} onSaved={load} onMessage={onMessage} onError={onError} />)}
    </div>
  </div>
}
