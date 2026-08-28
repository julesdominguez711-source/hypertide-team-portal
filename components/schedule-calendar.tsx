'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './schedule-calendar.module.css'

const supabase = createClient()

type ScheduleRow = {
  id: string
  weekday: number
  is_working: boolean
  start_time: string | null
  end_time: string | null
  timezone: string
  effective_from: string
  effective_to: string | null
}

type ScheduleOverride = {
  id: string
  work_date: string
  is_working: boolean
  start_time: string | null
  end_time: string | null
  timezone: string
  reason: string | null
}

type LeaveRequest = {
  id: string
  leave_type: string
  status: string
}

type LeaveDay = {
  leave_request_id: string
  leave_date: string
  requested_credits: number
  leave_period: 'full_shift' | 'first_half' | 'second_half'
}

type WeekendRotation = {
  id: string
  pacific_weekend_day: 'Saturday' | 'Sunday'
  alternating: boolean
  anchor_week_start: string | null
  anchor_working: boolean | null
  active: boolean
}

type CalendarStatus = 'working' | 'off' | 'leave'

type CalendarDay = {
  date: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  status: CalendarStatus
  label: string
  detail: string
}

type Month = { year: number; month: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function parseYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month: month - 1, day }
}

function dateOnly(value: string) {
  const p = parseYmd(value)
  return new Date(Date.UTC(p.year, p.month, p.day))
}

function addDays(value: string, days: number) {
  const date = dateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function currentDateInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  return `${map.year}-${map.month}-${map.day}`
}

function currentMonthInZone(timeZone: string): Month {
  const { year, month } = parseYmd(currentDateInZone(timeZone))
  return { year, month }
}

function shiftMonth(current: Month, amount: number): Month {
  const date = new Date(Date.UTC(current.year, current.month + amount, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}

function monthTitle(month: Month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(month.year, month.month, 1)))
}

function formatTime(value: string | null) {
  if (!value) return ''
  const [hourText, minuteText] = value.slice(0, 5).split(':')
  const hour = Number(hourText)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minuteText} ${suffix}`
}

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

function offsetMs(date: Date, timeZone: string) {
  const p = zoneParts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()
}

function localDateTimeToDate(dateValue: string, timeValue: string, timeZone: string) {
  const d = parseYmd(dateValue)
  const [hour, minute] = timeValue.slice(0, 5).split(':').map(Number)
  const target = Date.UTC(d.year, d.month, d.day, hour, minute, 0)
  let guess = new Date(target)
  for (let i = 0; i < 4; i += 1) guess = new Date(target - offsetMs(guess, timeZone))
  return guess
}

function pacificDateAndDay(date: Date) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of dateParts) if (part.type !== 'literal') map[part.type] = part.value
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
  }).format(date)
  return { date: `${map.year}-${map.month}-${map.day}`, dayName }
}

function sundayOf(dateValue: string) {
  const date = dateOnly(dateValue)
  date.setUTCDate(date.getUTCDate() - date.getUTCDay())
  return ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function rotationAllowsShift(
  workDate: string,
  startTime: string | null,
  endTime: string | null,
  timeZone: string,
  rotations: WeekendRotation[],
) {
  if (!startTime || !endTime || rotations.length === 0) return true

  const start = localDateTimeToDate(workDate, startTime, timeZone)
  const crossesMidnight = endTime.slice(0, 5) <= startTime.slice(0, 5)
  const endWorkDate = crossesMidnight ? addDays(workDate, 1) : workDate
  const end = localDateTimeToDate(endWorkDate, endTime, timeZone)
  const touched = [pacificDateAndDay(start), pacificDateAndDay(end)]

  for (const rotation of rotations) {
    if (!rotation.active || !rotation.alternating || !rotation.anchor_week_start || rotation.anchor_working == null) continue
    const matching = touched.find((item) => item.dayName === rotation.pacific_weekend_day)
    if (!matching) continue

    const candidateSunday = sundayOf(matching.date)
    const anchorSunday = sundayOf(rotation.anchor_week_start)
    const diffDays = Math.round((dateOnly(candidateSunday).getTime() - dateOnly(anchorSunday).getTime()) / 86400000)
    const weekOffset = Math.floor(diffDays / 7)
    const working = Math.abs(weekOffset) % 2 === 0 ? rotation.anchor_working : !rotation.anchor_working
    if (!working) return false
  }

  return true
}

function scheduleForDate(rows: ScheduleRow[], dateValue: string) {
  const weekday = dateOnly(dateValue).getUTCDay()
  return rows
    .filter((row) => row.weekday === weekday && row.effective_from <= dateValue && (!row.effective_to || row.effective_to >= dateValue))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null
}

function leaveDetail(day: LeaveDay, request: LeaveRequest) {
  const type = request.leave_type === 'sick' ? 'Sick leave' : 'Vacation leave'
  if (day.requested_credits < 1) {
    const period = day.leave_period === 'second_half' ? 'second half' : 'first half'
    return `${type} · ${period}`
  }
  return type
}

export default function ScheduleCalendar({ employeeId, timezone }: { employeeId: string; timezone: string }) {
  const [month, setMonth] = useState<Month>(() => currentMonthInZone(timezone))
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([])
  const [rotations, setRotations] = useState<WeekendRotation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const firstDate = ymd(month.year, month.month, 1)
  const lastDay = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate()
  const lastDate = ymd(month.year, month.month, lastDay)

  async function load() {
    setLoading(true)
    setError('')

    const [scheduleResult, overrideResult, requestResult, dayResult, rotationResult] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', employeeId).lte('effective_from', lastDate).order('effective_from', { ascending: false }),
      supabase.from('schedule_overrides').select('*').eq('employee_id', employeeId).gte('work_date', firstDate).lte('work_date', lastDate),
      supabase.from('leave_requests').select('id,leave_type,status').eq('employee_id', employeeId).eq('status', 'approved').lte('start_date', lastDate).gte('end_date', firstDate),
      supabase.from('leave_request_days').select('leave_request_id,leave_date,requested_credits,leave_period').eq('employee_id', employeeId).gte('leave_date', firstDate).lte('leave_date', lastDate),
      supabase.from('weekend_rotations').select('*').eq('employee_id', employeeId).eq('active', true),
    ])

    const firstError = scheduleResult.error || overrideResult.error || requestResult.error || dayResult.error || rotationResult.error
    if (firstError) setError(firstError.message)

    setSchedules((scheduleResult.data || []) as ScheduleRow[])
    setOverrides((overrideResult.data || []) as ScheduleOverride[])
    setLeaveRequests((requestResult.data || []) as LeaveRequest[])
    setLeaveDays((dayResult.data || []) as LeaveDay[])
    setRotations((rotationResult.data || []) as WeekendRotation[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [employeeId, firstDate, lastDate])

  const days = useMemo<CalendarDay[]>(() => {
    const approved = new Map(leaveRequests.map((request) => [request.id, request]))
    const leaveByDate = new Map<string, { day: LeaveDay; request: LeaveRequest }>()
    for (const day of leaveDays) {
      const request = approved.get(day.leave_request_id)
      if (request) leaveByDate.set(day.leave_date, { day, request })
    }
    const overrideByDate = new Map(overrides.map((row) => [row.work_date, row]))
    const today = currentDateInZone(timezone)
    const startOffset = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay()
    const cellCount = Math.ceil((startOffset + lastDay) / 7) * 7
    const firstCell = new Date(Date.UTC(month.year, month.month, 1 - startOffset))
    const result: CalendarDay[] = []

    for (let i = 0; i < cellCount; i += 1) {
      const date = new Date(firstCell)
      date.setUTCDate(firstCell.getUTCDate() + i)
      const dateValue = ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      const inMonth = date.getUTCMonth() === month.month
      const leave = leaveByDate.get(dateValue)
      const override = overrideByDate.get(dateValue)
      const schedule = scheduleForDate(schedules, dateValue)

      let status: CalendarStatus = 'off'
      let label = 'Off'
      let detail = ''

      if (leave) {
        status = 'leave'
        label = leave.day.requested_credits < 1 ? 'Half-day Leave' : 'Leave'
        detail = leaveDetail(leave.day, leave.request)
      } else if (override) {
        if (override.is_working) {
          status = 'working'
          label = 'Working'
          detail = `${formatTime(override.start_time)} – ${formatTime(override.end_time)}`
        } else {
          detail = override.reason || 'Schedule override'
        }
      } else if (schedule?.is_working && rotationAllowsShift(dateValue, schedule.start_time, schedule.end_time, schedule.timezone || timezone, rotations)) {
        status = 'working'
        label = 'Working'
        detail = `${formatTime(schedule.start_time)} – ${formatTime(schedule.end_time)}`
      } else if (schedule?.is_working) {
        detail = 'Alternating weekend off'
      }

      result.push({
        date: dateValue,
        dayNumber: date.getUTCDate(),
        inMonth,
        isToday: dateValue === today,
        status,
        label,
        detail,
      })
    }

    return result
  }, [leaveRequests, leaveDays, overrides, schedules, rotations, month, lastDay, timezone])

  const monthCounts = useMemo(() => {
    const current = days.filter((day) => day.inMonth)
    return {
      working: current.filter((day) => day.status === 'working').length,
      leave: current.filter((day) => day.status === 'leave').length,
      off: current.filter((day) => day.status === 'off').length,
    }
  }, [days])

  return (
    <div className="card">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>My Work Calendar</h2>
          <p className="muted">Working days, approved leave, and days off in {timezone}.</p>
        </div>
        <div className={styles.controls}>
          <button type="button" className="btn btn-secondary" onClick={() => setMonth((value) => shiftMonth(value, -1))} aria-label="Previous month">‹</button>
          <strong className={styles.monthTitle}>{monthTitle(month)}</strong>
          <button type="button" className="btn btn-secondary" onClick={() => setMonth((value) => shiftMonth(value, 1))} aria-label="Next month">›</button>
          <button type="button" className="btn btn-secondary" onClick={() => setMonth(currentMonthInZone(timezone))}>Today</button>
        </div>
      </div>

      <div className={styles.summary}>
        <span><i className={`${styles.dot} ${styles.workingDot}`} />{monthCounts.working} working</span>
        <span><i className={`${styles.dot} ${styles.leaveDot}`} />{monthCounts.leave} leave</span>
        <span><i className={`${styles.dot} ${styles.offDot}`} />{monthCounts.off} off</span>
      </div>

      {error && <div className="error" style={{ marginTop: 14 }}>{error}</div>}

      <div className={styles.calendarWrap} aria-busy={loading}>
        <div className={styles.weekHeader}>
          {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className={styles.grid}>
          {days.map((day) => (
            <div
              key={day.date}
              className={`${styles.day} ${styles[day.status]} ${!day.inMonth ? styles.outside : ''} ${day.isToday ? styles.today : ''}`}
            >
              <div className={styles.dayTop}>
                <span className={styles.dayNumber}>{day.dayNumber}</span>
                {day.isToday && <span className={styles.todayBadge}>Today</span>}
              </div>
              {day.inMonth && <div className={styles.dayBody}>
                <strong>{loading ? 'Loading…' : day.label}</strong>
                {!loading && day.detail && <span>{day.detail}</span>}
              </div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
