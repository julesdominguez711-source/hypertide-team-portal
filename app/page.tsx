'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PortalAuth from '@/components/portal-auth'
import PortalOnboarding from '@/components/portal-onboarding'
import MyCalendarPage from '@/components/my-calendar-page'
import TeamCalendarPage from '@/components/team-calendar-page'
import styles from '@/components/calendar-portal.module.css'

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
  const [view, setView] = useState<'my' | 'team'>('my')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshProfile(uid?: string) {
    const id = uid || userId
    if (!id) return
    const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', id).single()
    if (profileError) setError(profileError.message)
    else {
      setError('')
      setProfile(data as Profile)
    }
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
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="auth-wrap"><div className="card auth-card">Loading portal…</div></div>
  if (!userId) return <PortalAuth />

  if (!profile) return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Loading profile</h1>{error && <div className="error">{error}</div>}<button type="button" className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => refreshProfile(userId)}>Try Again</button></div></div>
  if (!profile.onboarding_complete) return <PortalOnboarding onDone={() => refreshProfile()} />

  if (profile.status === 'pending') return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Pending approval</h1><p className="subtitle">Your profile and schedule were submitted. An Admin or Manager must approve the account before portal access is enabled.</p><div className="row"><span>Requested role</span><strong>{prettyRole(profile.requested_role)}</strong></div><button className="btn btn-secondary" style={{ marginTop: 16, width: '100%' }} onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>

  if (profile.status !== 'active') return <div className="auth-wrap"><div className="card auth-card"><h1 className="title">Account unavailable</h1><p className="subtitle">Your account status is {profile.status}.</p><button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => supabase.auth.signOut()}>Sign out</button></div></div>

  const management = profile.role === 'admin' || profile.role === 'manager'
  const displayName = profile.nickname || profile.full_name || profile.email

  return (
    <div className={styles.portal}>
      <header className={styles.header}>
        <div className={styles.brandWrap}>
          <div className={styles.brand}>Hypertide</div>
          <div className={styles.welcome}>Welcome, {displayName}</div>
        </div>
        <div className={styles.headerActions}>
          {management && <div className={styles.tabs}>
            <button type="button" className={`${styles.tab} ${view === 'my' ? styles.tabActive : ''}`} onClick={() => { setView('my'); setMessage(''); setError('') }}>My Calendar</button>
            <button type="button" className={`${styles.tab} ${view === 'team' ? styles.tabActive : ''}`} onClick={() => { setView('team'); setMessage(''); setError('') }}>Team Calendar</button>
          </div>}
          <span className={styles.role}>{prettyRole(profile.role)}</span>
          <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <div className={styles.content}>
        {message && <div className={`${styles.alert} ${styles.success}`}>{message}</div>}
        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}
      </div>

      {(!management || view === 'my') && <MyCalendarPage profile={profile} onMessage={setMessage} onError={setError} />}
      {management && view === 'team' && <TeamCalendarPage currentProfile={profile} onMessage={setMessage} onError={setError} />}
    </div>
  )
}
