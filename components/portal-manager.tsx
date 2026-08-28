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
  requested_role: 'manager' | 'teammate' | 'dev'
  requested_manager_id: string | null
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type ManagerOption = {
  id: string
  full_name: string | null
  nickname: string | null
  email: string
  role: string
}

function label(manager: ManagerOption) {
  return manager.nickname || manager.full_name || manager.email
}

function pretty(value: string) {
  return value === 'dev' ? 'Dev' : value.charAt(0).toUpperCase() + value.slice(1)
}

export default function PortalManager({ onMessage, onError }: { onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [pending, setPending] = useState<Profile[]>([])
  const [all, setAll] = useState<Profile[]>([])
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [busyId, setBusyId] = useState('')

  async function load() {
    const [{ data, error }, { data: managerData, error: managerError }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_active_managers'),
    ])

    if (error) onError(error.message)
    if (managerError) onError(managerError.message)

    const rows = (data || []) as Profile[]
    setAll(rows)
    setPending(rows.filter((profile) => profile.status === 'pending' && profile.onboarding_complete))
    setManagers((managerData || []) as ManagerOption[])
  }

  useEffect(() => { load() }, [])

  async function approve(profile: Profile) {
    setBusyId(profile.id)
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('approve_profile', {
      p_user_id: profile.id,
      p_role: profile.requested_role,
      p_manager_id: profile.requested_role === 'manager' ? null : profile.requested_manager_id,
    })
    if (error) onError(error.message)
    else {
      onMessage(`${profile.nickname || profile.full_name || profile.email} approved.`)
      await load()
    }
    setBusyId('')
  }

  function requestedManagerName(profile: Profile) {
    if (!profile.requested_manager_id) return 'Unassigned'
    const found = managers.find((manager) => manager.id === profile.requested_manager_id)
    return found ? label(found) : 'Selected manager'
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="section-head"><div><h2>Pending approvals</h2><p className="muted">New team members waiting for portal access.</p></div><span className="pill">{pending.length} pending</span></div>
        <div className="list" style={{ marginTop: 16 }}>
          {pending.length === 0 && <div className="empty-state">No pending profiles.</div>}
          {pending.map((profile) => (
            <div className="row" key={profile.id}>
              <div><strong>{profile.full_name || profile.email}</strong><div className="muted">{profile.email} · requests {pretty(profile.requested_role)}{profile.requested_role !== 'manager' ? ` · Manager: ${requestedManagerName(profile)}` : ''}</div></div>
              <button className="btn btn-primary" disabled={busyId === profile.id} onClick={() => approve(profile)}>{busyId === profile.id ? 'Approving…' : 'Approve'}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="section-head"><div><h2>People</h2><p className="muted">Current portal accounts and status.</p></div><button type="button" className="btn btn-secondary" onClick={load}>Refresh</button></div>
        <div className="list" style={{ marginTop: 16 }}>
          {all.map((profile) => (
            <div className="row" key={profile.id}>
              <div><strong>{profile.full_name || profile.email}</strong><div className="muted">{profile.email} · {profile.timezone}</div></div>
              <span className="pill">{pretty(profile.role)} / {pretty(profile.status)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
