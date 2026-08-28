'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') event.preventDefault()
}

export default function PortalAuth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signupCompleted, setSignupCompleted] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        setBusy(false)
        return
      }

      const { error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) setError(authError.message)
      else {
        await supabase.auth.signOut()
        setSignupCompleted(true)
        setPassword('')
        setConfirmPassword('')
      }
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) setError(authError.message)
    }

    setBusy(false)
  }

  if (signupCompleted) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h1 className="title">Account created successfully</h1>
          <p className="subtitle">Your account is ready. Sign in to complete your Hypertide profile and schedule.</p>
          <div className="success" style={{ marginBottom: 16 }}>Registration successful.</div>
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setSignupCompleted(false); setMode('login'); setError('') }}>Go to Login</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="title">Hypertide Team Portal</h1>
        <p className="subtitle">Schedules, leave, and team coverage.</p>

        <form className="stack" onSubmit={submit} onKeyDown={preventEnterSubmit}>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
          {mode === 'signup' && <label className="field"><span>Confirm Password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>}
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>

        <button type="button" className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setConfirmPassword(''); setError('') }}>
          {mode === 'login' ? 'Create a new account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
