'use client'

import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DAYS, previewPacific, type ScheduleDraft } from '@/lib/schedule-utils'

const supabase = createClient()

type Person = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  timezone: string
  status: string
}

type ScheduleRow = ScheduleDraft & { timezone: string; effective_from: string; effective_to: string | null }
type Rotation = { id: string; pacific_weekend_day: string; alternating: boolean; anchor_week_start: string | null; anchor_working: boolean | null; active: boolean }

function name(person: Person) { return person.nickname || person.full_name || person.email }

export default function ManagerScheduleEditor({ people, onMessage, onError }: { people: Person[]; onMessage: (value: string) => void; onError: (value: string) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [draft, setDraft] = useState<ScheduleDraft[]>(DAYS.map((d) => ({ weekday: d.weekday, is_working: false, start_time: '09:00', end_time: '17:00' })))
  const [effectiveDate, setEffectiveDate] = useState('')
  const [reason, setReason] = useState('')
  const [rotations, setRotations] = useState<Rotation[]>([])
  const [weekendDay, setWeekendDay] = useState<'Saturday' | 'Sunday'>('Saturday')
  const [alternating, setAlternating] = useState(false)
  const [workingThisWeek, setWorkingThisWeek] = useState(true)
  const [rotationReason, setRotationReason] = useState('')
  const [busy, setBusy] = useState('')
  const selected = people.find((p) => p.id === employeeId)

  useEffect(() => {
    if (!employeeId && people.length) setEmployeeId(people[0].id)
  }, [people, employeeId])

  async function loadEmployee() {
    if (!employeeId) return
    const [{ data, error }, { data: rotationRows, error: rotationError }] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', employeeId).is('effective_to', null),
      supabase.from('weekend_rotations').select('*').eq('employee_id', employeeId).eq('active', true),
    ])
    if (error || rotationError) onError((error || rotationError)?.message || 'Unable to load schedule.')
    const rows = (data || []) as ScheduleRow[]
    const map = new Map(rows.map((row) => [row.weekday, row]))
    setDraft(DAYS.map((day) => {
      const row = map.get(day.weekday)
      return { weekday: day.weekday, is_working: Boolean(row?.is_working), start_time: row?.start_time?.slice(0, 5) || '09:00', end_time: row?.end_time?.slice(0, 5) || '17:00' }
    }))
    setRotations((rotationRows || []) as Rotation[])
  }

  useEffect(() => { loadEmployee() }, [employeeId])

  function update(index: number, patch: Partial<ScheduleDraft>) {
    setDraft((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row))
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault()
    if (!employeeId) return
    setBusy('schedule')
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('manager_update_schedule', {
      p_employee_id: employeeId,
      p_schedule: draft,
      p_effective_date: effectiveDate,
      p_reason: reason,
    })
    if (error) onError(error.message)
    else {
      onMessage(`${selected ? name(selected) : 'Employee'} schedule updated.`)
      setEffectiveDate('')
      setReason('')
      await loadEmployee()
    }
    setBusy('')
  }

  async function saveRotation(event: FormEvent) {
    event.preventDefault()
    if (!employeeId) return
    setBusy('rotation')
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('manager_set_weekend_rotation', {
      p_employee_id: employeeId,
      p_pacific_weekend_day: weekendDay,
      p_alternating: alternating,
      p_working_this_week: workingThisWeek,
      p_reason: rotationReason,
    })
    if (error) onError(error.message)
    else {
      onMessage(`${weekendDay} rotation updated.`)
      setRotationReason('')
      await loadEmployee()
    }
    setBusy('')
  }

  return <div className="stack">
    <div className="card">
      <div className="section-head"><div><h2>Manager schedule editor</h2><p className="muted">Creates a new effective-dated schedule version and preserves history.</p></div><span className="status-badge approved">Audited</span></div>
      <label className="field" style={{ marginTop: 16 }}><span>Employee</span><select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{name(person)} · {person.timezone} · {person.status}</option>)}</select></label>
      {selected && <form className="stack" style={{ marginTop: 16 }} onSubmit={saveSchedule}>
        <div className="compact-schedule-editor">
          {DAYS.map((day, index) => {
            const preview = previewPacific(draft[index], index, selected.timezone)
            return <div className="manager-schedule-row" key={day.name}>
              <strong>{day.name}</strong>
              <select value={draft[index].is_working ? 'working' : 'off'} onChange={(e) => update(index, { is_working: e.target.value === 'working' })}><option value="working">Working</option><option value="off">Off</option></select>
              <input type="time" disabled={!draft[index].is_working} value={draft[index].start_time} onChange={(e) => update(index, { start_time: e.target.value })} />
              <input type="time" disabled={!draft[index].is_working} value={draft[index].end_time} onChange={(e) => update(index, { end_time: e.target.value })} />
              <span className="pacific-preview">{draft[index].is_working ? preview?.label || '—' : 'Off'}</span>
            </div>
          })}
        </div>
        <div className="form-grid"><label className="field"><span>Effective date</span><input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required /></label><label className="field"><span>Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="Required for audit history" /></label></div>
        <button className="btn btn-primary" disabled={busy === 'schedule'}>{busy === 'schedule' ? 'Saving…' : 'Save Effective-Dated Schedule'}</button>
      </form>}
    </div>

    <div className="card">
      <div className="section-head"><div><h2>Alternating weekend rotation</h2><p className="muted">The anchor is automatically based on the current Pacific Sunday–Saturday week.</p></div><div className="actions">{rotations.map((r) => <span className="pill" key={r.id}>{r.pacific_weekend_day}: {r.alternating ? `Alternating · ${r.anchor_working ? 'working' : 'off'} anchor` : 'Every week'}</span>)}</div></div>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={saveRotation}>
        <div className="form-grid"><label className="field"><span>Pacific weekend day</span><select value={weekendDay} onChange={(e) => setWeekendDay(e.target.value as 'Saturday' | 'Sunday')}><option>Saturday</option><option>Sunday</option></select></label><label className="field"><span>Rotation</span><select value={alternating ? 'alternating' : 'weekly'} onChange={(e) => setAlternating(e.target.value === 'alternating')}><option value="weekly">Works every scheduled weekend</option><option value="alternating">Alternating weekends</option></select></label></div>
        {alternating && <label className="field"><span>Current Pacific week</span><select value={workingThisWeek ? 'working' : 'off'} onChange={(e) => setWorkingThisWeek(e.target.value === 'working')}><option value="working">Working this weekend</option><option value="off">Off this weekend</option></select></label>}
        <label className="field"><span>Reason</span><input value={rotationReason} onChange={(e) => setRotationReason(e.target.value)} required placeholder="Required for audit history" /></label>
        <button className="btn btn-primary" disabled={busy === 'rotation'}>{busy === 'rotation' ? 'Saving…' : 'Save Weekend Rotation'}</button>
      </form>
    </div>
  </div>
}
