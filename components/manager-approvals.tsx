'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type PendingProfile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  requested_role: 'manager' | 'teammate' | 'dev'
  requested_manager_id: string | null
  status: 'pending'
  onboarding_complete: boolean
}

function displayName(profile: PendingProfile) {
  return profile.nickname || profile.full_name || profile.email
}

function prettyRole(role: string) {
  return role === 'dev' ? 'Dev' : role.charAt(0).toUpperCase() + role.slice(1)
}

export default function ManagerApprovals({ onMessage, onError, onCountChange }: { onMessage: (value: string) => void; onError: (value: string) => void; onCountChange?: (value: number) => void }) {
  const [rows, setRows] = useState<PendingProfile[]>([])
  const [busyId, setBusyId] = useState('')

  async function load() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,nickname,requested_role,requested_manager_id,status,onboarding_complete')
      .eq('status', 'pending')
      .eq('onboarding_complete', true)
      .order('created_at')

    if (error) {
      onError(error.message)
      return
    }

    const next = (data || []) as PendingProfile[]
    setRows(next)
    onCountChange?.(next.length)
  }

  useEffect(() => { load() }, [])

  async function approve(profile: PendingProfile) {
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
      onMessage(`${displayName(profile)} approved.`)
      await load()
    }
    setBusyId('')
  }

  return <div className="card">
    <div className="section-head"><div><h2>Account Approvals</h2><p className="muted">Approve teammates, devs, and Manager requests after onboarding.</p></div></div>
    {rows.length === 0 ? <div className="empty-state">No accounts waiting for approval.</div> : <div className="stack">
      {rows.map((profile) => <div className="manager-row" key={profile.id}>
        <div><strong>{displayName(profile)}</strong><div className="muted">{profile.email} · Requested {prettyRole(profile.requested_role)}</div></div>
        <button type="button" className="btn btn-primary" disabled={busyId === profile.id} onClick={() => approve(profile)}>{busyId === profile.id ? 'Approving…' : 'Approve'}</button>
      </div>)}
    </div>}
  </div>
}
