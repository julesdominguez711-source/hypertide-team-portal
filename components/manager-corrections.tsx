'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

type Profile = { id: string; email: string; full_name: string | null; nickname: string | null; status: string }
type TimeEntry = { id: string; employee_id: string; work_date: string; clock_in: string; clock_out: string | null; status: string; ot_eligible: boolean; is_unscheduled: boolean }

function name(profile: Profile) { return profile.nickname || profile.full_name || profile.email }
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }
function ptLabel(value: string | null) { if (!value) return '—'; return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)) + ' PT' }

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') {
    const target = event.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') event.preventDefault()
  }
}

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

export default function ManagerCorrections({ onMessage, onError }: { onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [people, setPeople] = useState<Profile[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [target, setTarget] = useState<TimeEntry | null>(null)
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadPeople() {
    const { data, error } = await supabase.from('profiles').select('id,email,full_name,nickname,status').neq('status', 'pending').order('created_at')
    if (error) onError(error.message)
    const rows = (data || []) as Profile[]
    setPeople(rows)
    setEmployeeId((current) => current || rows[0]?.id || '')
  }

  async function loadEntries(id = employeeId) {
    if (!id) return
    const { data, error } = await supabase.from('time_entries').select('*').eq('employee_id', id).order('clock_in', { ascending: false }).limit(20)
    if (error) onError(error.message)
    else setEntries((data || []) as TimeEntry[])
  }

  useEffect(() => { loadPeople() }, [])
  useEffect(() => { loadEntries(employeeId) }, [employeeId])

  function edit(entry: TimeEntry) {
    setTarget(entry)
    setClockIn(pacificInput(entry.clock_in))
    setClockOut(pacificInput(entry.clock_out))
    setReason('')
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!target) return
    setBusy(true)
    const { error } = await supabase.rpc('correct_time_entry', {
      p_time_entry_id: target.id,
      p_clock_in: pacificToIso(clockIn),
      p_clock_out: clockOut ? pacificToIso(clockOut) : null,
      p_reason: reason,
    })
    if (error) onError(error.message)
    else {
      onMessage('Time entry corrected and audit history recorded.')
      setTarget(null)
      await loadEntries()
    }
    setBusy(false)
  }

  return <div className="card">
    <div className="section-head"><div><h2>Attendance corrections</h2><p className="muted">Times are displayed and edited in Pacific Time. A correction reason is mandatory.</p></div><span className="status-badge approved">Audit logged</span></div>
    <label className="field" style={{ marginTop: 16 }}><span>Employee</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{name(person)} · {person.status}</option>)}</select></label>
    <div className="list" style={{ marginTop: 16 }}>
      {entries.length === 0 && <div className="empty-state">No time entries for this employee.</div>}
      {entries.map((entry) => <div className="row" key={entry.id}><div><strong>{entry.work_date}</strong><div className="muted">{ptLabel(entry.clock_in)} → {ptLabel(entry.clock_out)} · {pretty(entry.status)}</div><div className="entry-meta">{entry.is_unscheduled ? 'Unscheduled' : 'Scheduled'} · {entry.ot_eligible ? 'OT eligible' : 'No OT'}</div></div><button className="btn btn-secondary" onClick={() => edit(entry)}>Edit</button></div>)}
    </div>

    {target && <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setTarget(null) }}><div className="modal-card"><div className="section-head"><div><h2>Correct time entry</h2><p className="muted">Pacific Time · {target.work_date}</p></div><button type="button" className="icon-button" onClick={() => setTarget(null)}>×</button></div><form className="stack" style={{ marginTop: 16 }} onSubmit={save} onKeyDown={preventEnterSubmit}><label className="field"><span>Clock in (Pacific)</span><input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} required /></label><label className="field"><span>Clock out (Pacific)</span><input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></label><label className="field"><span>Correction reason</span><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required /></label><div className="actions"><button type="button" className="btn btn-secondary" onClick={() => setTarget(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !reason.trim()}>{busy ? 'Saving…' : 'Save Correction'}</button></div></form></div></div>}
  </div>
}
