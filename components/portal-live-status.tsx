'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type OpenEntry = { id: string; clock_in: string }
type OpenBreak = { id: string; started_at: string }

function duration(from: string | null, now: Date) {
  if (!from) return '00:00:00'
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':')
}

function clock(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now)
}

function pacificLabel(now: Date) {
  const value = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'short',
  }).formatToParts(now).find((part) => part.type === 'timeZoneName')?.value
  return value || 'PT'
}

export default function PortalLiveStatus({ refreshKey = 0 }: { refreshKey?: number }) {
  const [now, setNow] = useState(new Date())
  const [entry, setEntry] = useState<OpenEntry | null>(null)
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null)

  async function loadAttendance() {
    const [{ data: entries }, { data: breaks }] = await Promise.all([
      supabase.from('time_entries').select('id,clock_in').is('clock_out', null).order('clock_in', { ascending: false }).limit(1),
      supabase.from('breaks').select('id,started_at').is('ended_at', null).order('started_at', { ascending: false }).limit(1),
    ])
    setEntry((entries?.[0] as OpenEntry | undefined) || null)
    setOpenBreak((breaks?.[0] as OpenBreak | undefined) || null)
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    loadAttendance()
    const poll = window.setInterval(loadAttendance, 15000)
    return () => window.clearInterval(poll)
  }, [refreshKey])

  const status = openBreak ? 'On Break' : entry ? 'Working' : 'Not Clocked In'

  return (
    <div className="stack live-status-stack">
      <div className="live-clock-grid">
        <div className="card live-clock-card"><div className="live-clock-label">PH</div><div className="live-clock-time">{clock(now, 'Asia/Manila')}</div><div className="muted">Philippines</div></div>
        <div className="card live-clock-card"><div className="live-clock-label">IST</div><div className="live-clock-time">{clock(now, 'Asia/Kolkata')}</div><div className="muted">India</div></div>
        <div className="card live-clock-card"><div className="live-clock-label">{pacificLabel(now)}</div><div className="live-clock-time">{clock(now, 'America/Los_Angeles')}</div><div className="muted">Pacific</div></div>
      </div>

      <div className="card live-attendance-card">
        <div className="live-attendance-head">
          <div><div className="muted">Current attendance</div><div className="live-attendance-status"><span className={`live-dot ${entry ? 'active' : ''}`} />{status}</div></div>
          {entry && <div className="live-timer-block"><span>Shift elapsed</span><strong>{duration(entry.clock_in, now)}</strong></div>}
          {openBreak && <div className="live-timer-block break"><span>Current break</span><strong>{duration(openBreak.started_at, now)}</strong></div>}
        </div>
      </div>
    </div>
  )
}
