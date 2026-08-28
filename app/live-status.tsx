'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type OpenEntry = {
  id: string
  clock_in: string
  clock_out: string | null
}

type OpenBreak = {
  id: string
  started_at: string
  ended_at: string | null
}

const supabase = createClient()

function formatClock(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

function formatDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':')
}

export default function LiveStatus() {
  const [now, setNow] = useState(() => new Date())
  const [visible, setVisible] = useState(false)
  const [entry, setEntry] = useState<OpenEntry | null>(null)
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null)

  async function loadStatus() {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user

    if (!user) {
      setVisible(false)
      setEntry(null)
      setOpenBreak(null)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status,onboarding_complete')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.status !== 'active' || !profile.onboarding_complete) {
      setVisible(false)
      setEntry(null)
      setOpenBreak(null)
      return
    }

    setVisible(true)

    const { data: entries } = await supabase
      .from('time_entries')
      .select('id,clock_in,clock_out')
      .eq('employee_id', user.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)

    const currentEntry = (entries?.[0] || null) as OpenEntry | null
    setEntry(currentEntry)

    if (!currentEntry) {
      setOpenBreak(null)
      return
    }

    const { data: breaks } = await supabase
      .from('breaks')
      .select('id,started_at,ended_at')
      .eq('employee_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)

    setOpenBreak((breaks?.[0] || null) as OpenBreak | null)
  }

  useEffect(() => {
    loadStatus()

    const clockTimer = window.setInterval(() => setNow(new Date()), 1000)
    const statusTimer = window.setInterval(loadStatus, 3000)

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(loadStatus, 0)
    })

    return () => {
      window.clearInterval(clockTimer)
      window.clearInterval(statusTimer)
      authListener.subscription.unsubscribe()
    }
  }, [])

  const shiftSeconds = useMemo(() => {
    if (!entry) return 0
    return (now.getTime() - new Date(entry.clock_in).getTime()) / 1000
  }, [entry, now])

  const breakSeconds = useMemo(() => {
    if (!openBreak) return 0
    return (now.getTime() - new Date(openBreak.started_at).getTime()) / 1000
  }, [openBreak, now])

  if (!visible) return null

  const clocks = [
    { label: 'PH', zone: 'Asia/Manila' },
    { label: 'IST', zone: 'Asia/Kolkata' },
    { label: 'PST/PDT', zone: 'America/Los_Angeles' },
  ]

  return (
    <aside className="live-status-panel" aria-label="Live time and attendance status">
      <div className="live-status-head">
        <div>
          <div className="live-eyebrow">Live status</div>
          <strong>{openBreak ? 'On Break' : entry ? 'Working' : 'Not clocked in'}</strong>
        </div>
        <span className={`live-dot ${entry ? 'is-live' : ''}`} aria-hidden="true" />
      </div>

      <div className="timezone-grid">
        {clocks.map((clock) => (
          <div className="timezone-card" key={clock.zone}>
            <span>{clock.label}</span>
            <strong>{formatClock(now, clock.zone)}</strong>
            <small>{formatDate(now, clock.zone)}</small>
          </div>
        ))}
      </div>

      <div className="timer-grid">
        <div className={`timer-card ${entry ? 'timer-active' : ''}`}>
          <span>Shift elapsed</span>
          <strong>{entry ? formatDuration(shiftSeconds) : '00:00:00'}</strong>
          <small>{entry ? `Started ${new Date(entry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Clock in to start'}</small>
        </div>

        <div className={`timer-card ${openBreak ? 'timer-break' : ''}`}>
          <span>Current break</span>
          <strong>{openBreak ? formatDuration(breakSeconds) : '00:00:00'}</strong>
          <small>{openBreak ? 'Break timer is running' : entry ? 'No active break' : '—'}</small>
        </div>
      </div>
    </aside>
  )
}
