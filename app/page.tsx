'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PortalAuth from '@/components/portal-auth'
import PortalOnboarding from '@/components/portal-onboarding'
import PortalDashboard from '@/components/portal-dashboard'
import PortalTimeTracking from '@/components/portal-time-tracking'
import LeavePanel from '@/components/leave-panel'
import PortalSchedule from '@/components/portal-schedule'
import PortalManager from '@/components/portal-manager'

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

const supabase = createClient()

function prettyRole(role: string) {
  return role === 'dev' ? 'Dev' : role.charAt(0).toUpperCase() + role.slice(1)
}

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Dashboard')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshProfile(uid?: string) {
    const id = uid || userId
    if (!id) return
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (profileError) setError(profileError.message)
    else { setError(''); setProfile(data as Profile) }
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return
      const uid = data.user?.id || null
      setUserId(uid)
      if (uid) await refreshProfile(uid)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const uid = session?.user?.id || null
      setUserId(uid)
      if (uid) await refreshProfile(uid)
      else setProfile(null)
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  if (loading) return <div className="auth-wrap"><div className="card auth-card">Loading portal…</div></div>
  if (!userId) return <PortalAuth />

  if (!profile) return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Loading profile</h1>{error && <div className="error">{error}</div>}<button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => refreshProfile(userId)}>Try Again</button></div></div>
  if (!profile.onboarding_complete) return <PortalOnboarding onDone={() => refreshProfile()} />

  if (profile.status === 'pending') return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Pending approval</h1><p className="subtitle">Your profile and schedule were submitted. An Admin or Manager must approve the account before portal access is enabled.</p><div className="row"><span>Requested role</span><strong>{prettyRole(profile.requested_role)}</strong></div><button className="btn btn-secondary" style={{ marginTop: 16, width: '100%' }} onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>

  if (profile.status !== 'active') return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Account unavailable</h1><p className="subtitle">Your account status is {profile.status}.</p><button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>

  const management = profile.role === 'admin' || profile.role === 'manager'
  const tabs = ['Dashboard', 'Time Tracking', 'Leave', 'Schedule', ...(management ? ['Manager'] : [])]
  const displayName = profile.nickname || profile.full_name || profile.email

  return <div className="shell">
    <aside className="sidebar"><div className="brand">Hypertide</div><div className="nav">{tabs.map((name) => <button type="button" key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setMessage(''); setError('') }}>{name}</button>)}</div></aside>
    <main className="main">
      <div className="topbar"><div className="welcome-title">Welcome, {displayName}</div><div className="actions"><span className="pill position-pill">{prettyRole(profile.role)}</span><button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>
      {message && <div className="success portal-alert">{message}</div>}
      {error && <div className="error portal-alert">{error}</div>}
      {tab === 'Dashboard' && <PortalDashboard profile={profile} />}
      {tab === 'Time Tracking' && <PortalTimeTracking employeeId={profile.id} onMessage={setMessage} onError={setError} />}
      {tab === 'Leave' && <LeavePanel profile={profile} onMessage={setMessage} onError={setError} />}
      {tab === 'Schedule' && <PortalSchedule profile={profile} onMessage={setMessage} onError={setError} />}
      {tab === 'Manager' && management && <PortalManager currentProfile={profile} onMessage={setMessage} onError={setError} />}
    </main>
  </div>
}
