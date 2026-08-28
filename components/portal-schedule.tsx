'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DAYS, previewPacific, type ScheduleDraft } from '@/lib/schedule-utils'

const supabase = createClient()

type ScheduleRecord = ScheduleDraft & {
  id: string
  timezone: string
  effective_from: string
  effective_to: string | null
}

type Profile = { timezone: string }

export default function PortalSchedule({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<ScheduleRecord[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('schedules').select('*').is('effective_to', null)
    setRows((data || []) as ScheduleRecord[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const byWeekday = new Map<number, ScheduleRecord>(rows.map((row) => [row.weekday, row] as [number, ScheduleRecord]))

  return (
    <div className="card">
      <div className="section-head">
        <div><h2>Current weekly schedule</h2><p className="muted">Your local schedule is shown beside its Pacific Time equivalent.</p></div>
        <div className="actions"><span className="pill">{profile.timezone}</span><button type="button" className="btn btn-secondary" onClick={load}>Refresh</button></div>
      </div>

      {loading ? <div className="empty-state" style={{ marginTop: 16 }}>Loading schedule…</div> : (
        <div className="schedule-table" style={{ marginTop: 16 }}>
          <div className="schedule-row schedule-head"><strong>Day</strong><strong>Status</strong><strong>Start</strong><strong>End</strong><strong>Pacific Time</strong></div>
          {DAYS.map((day, index) => {
            const row = byWeekday.get(day.weekday)
            if (!row || !row.is_working) return <div className="schedule-row" key={day.name}><strong>{day.name}</strong><span>Off</span><span>—</span><span>—</span><span className="muted">Off</span></div>
            const preview = previewPacific(row, index, row.timezone)
            return <div className="schedule-row" key={day.name}><strong>{day.name}</strong><span>Working</span><span>{row.start_time.slice(0, 5)}</span><span>{row.end_time.slice(0, 5)}</span><span className="pacific-preview">{preview?.label || '—'}</span></div>
          })}
        </div>
      )}

      <p className="muted" style={{ marginTop: 16 }}>Schedule-change requests and shift swaps are the next schedule module.</p>
    </div>
  )
}
