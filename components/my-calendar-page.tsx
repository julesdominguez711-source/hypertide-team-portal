'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  WEEKDAYS,
  currentDateInZone,
  currentMonthInZone,
  formatDateLong,
  formatTime,
  getShiftForLocalDate,
  monthRange,
  monthTitle,
  shiftMonth,
  ymd,
  type Month,
  type ScheduleOverride,
  type ScheduleRow,
  type WeekendRotation,
} from '@/lib/calendar-helpers'
import styles from './calendar-portal.module.css'

const supabase = createClient()

type Profile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  timezone: string
  role: 'admin' | 'manager' | 'teammate' | 'dev'
}

type LeaveRequest = {
  id: string
  leave_type: 'vacation' | 'sick'
  status: 'approved' | 'pending' | 'rejected' | 'cancelled'
}

type LeaveDay = {
  leave_request_id: string
  leave_date: string
  requested_credits: number
  leave_period: 'full_shift' | 'first_half' | 'second_half'
}

type LeaveSummary = {
  balance: number
  hours_equivalent: number
  pending_credits: number
}

type PreviewDay = {
  date: string
  scheduled_minutes: number
  max_credits: number
  requested_credits: number
}

type LeavePreview = {
  day_details: PreviewDay[]
  has_enough_balance: boolean
  available_balance: number
  auto_eligible: boolean
}

type CalendarDay = {
  date: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  status: 'working' | 'off' | 'leave' | 'pending'
  label: string
  detail: string
}

function preventEnterSubmit(event: ReactKeyboardEvent<HTMLFormElement>) {
  if (event.key === 'Enter') {
    const target = event.target as HTMLElement
    if (target.tagName !== 'TEXTAREA') event.preventDefault()
  }
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

function currentDateLabel(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)
}

function zoneLabel(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')?.value || timeZone
}

function leaveDescription(day: LeaveDay, request: LeaveRequest) {
  const type = request.leave_type === 'sick' ? 'Sick Leave' : 'Vacation Leave'
  if (day.requested_credits < 1) {
    return `${type} · ${day.leave_period === 'second_half' ? 'Second Half' : 'First Half'}`
  }
  return type
}

export default function MyCalendarPage({
  profile,
  onMessage,
  onError,
}: {
  profile: Profile
  onMessage: (value: string) => void
  onError: (value: string) => void
}) {
  const [month, setMonth] = useState<Month>(() => currentMonthInZone(profile.timezone))
  const [now, setNow] = useState(new Date())
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const [rotations, setRotations] = useState<WeekendRotation[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([])
  const [summary, setSummary] = useState<LeaveSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null)
  const [preview, setPreview] = useState<LeavePreview | null>(null)
  const [leaveType, setLeaveType] = useState<'vacation' | 'sick'>('vacation')
  const [leavePeriod, setLeavePeriod] = useState<'full_shift' | 'first_half' | 'second_half'>('full_shift')
  const [reason, setReason] = useState('')
  const { firstDate, lastDate, lastDay } = monthRange(month)

  async function loadCalendar() {
    setLoading(true)
    const [scheduleResult, overrideResult, rotationResult, requestResult, dayResult] = await Promise.all([
      supabase.from('schedules').select('*').eq('employee_id', profile.id).lte('effective_from', lastDate).order('effective_from', { ascending: false }),
      supabase.from('schedule_overrides').select('*').eq('employee_id', profile.id).gte('work_date', firstDate).lte('work_date', lastDate),
      supabase.from('weekend_rotations').select('*').eq('employee_id', profile.id).eq('active', true),
      supabase.from('leave_requests').select('id,leave_type,status').eq('employee_id', profile.id).in('status', ['approved', 'pending']).lte('start_date', lastDate).gte('end_date', firstDate),
      supabase.from('leave_request_days').select('leave_request_id,leave_date,requested_credits,leave_period').eq('employee_id', profile.id).gte('leave_date', firstDate).lte('leave_date', lastDate),
    ])

    const firstError = scheduleResult.error || overrideResult.error || rotationResult.error || requestResult.error || dayResult.error
    if (firstError) onError(firstError.message)
    setSchedules((scheduleResult.data || []) as ScheduleRow[])
    setOverrides((overrideResult.data || []) as ScheduleOverride[])
    setRotations((rotationResult.data || []) as WeekendRotation[])
    setLeaveRequests((requestResult.data || []) as LeaveRequest[])
    setLeaveDays((dayResult.data || []) as LeaveDay[])
    setLoading(false)
  }

  async function loadBalance() {
    const { data, error } = await supabase.rpc('get_my_leave_summary')
    if (error) onError(error.message)
    else setSummary(data as LeaveSummary)
  }

  useEffect(() => {
    loadCalendar()
  }, [profile.id, firstDate, lastDate])

  useEffect(() => {
    loadBalance()
    const tick = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(tick)
  }, [profile.id])

  const requestMap = useMemo(() => new Map(leaveRequests.map((request) => [request.id, request])), [leaveRequests])

  const days = useMemo<CalendarDay[]>(() => {
    const leaveByDate = new Map<string, { day: LeaveDay; request: LeaveRequest }>()
    for (const day of leaveDays) {
      const request = requestMap.get(day.leave_request_id)
      if (!request) continue
      const existing = leaveByDate.get(day.leave_date)
      if (!existing || request.status === 'approved') leaveByDate.set(day.leave_date, { day, request })
    }

    const today = currentDateInZone(profile.timezone)
    const startOffset = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay()
    const cellCount = Math.ceil((startOffset + lastDay) / 7) * 7
    const firstCell = new Date(Date.UTC(month.year, month.month, 1 - startOffset))
    const result: CalendarDay[] = []

    for (let i = 0; i < cellCount; i += 1) {
      const date = new Date(firstCell)
      date.setUTCDate(firstCell.getUTCDate() + i)
      const dateValue = ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      const leave = leaveByDate.get(dateValue)
      const shift = getShiftForLocalDate(profile.id, profile.timezone, dateValue, schedules, overrides, rotations)
      let status: CalendarDay['status'] = shift ? 'working' : 'off'
      let label = shift ? 'Working' : 'Off'
      let detail = shift ? `${formatTime(shift.startTime)} – ${formatTime(shift.endTime)}` : ''

      if (leave?.request.status === 'approved') {
        status = 'leave'
        label = leave.day.requested_credits < 1 ? 'Half-day Leave' : 'Leave'
        detail = leaveDescription(leave.day, leave.request)
      } else if (leave?.request.status === 'pending') {
        status = 'pending'
        label = 'Pending Leave'
        detail = leaveDescription(leave.day, leave.request)
      }

      result.push({
        date: dateValue,
        dayNumber: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month.month,
        isToday: dateValue === today,
        status,
        label,
        detail,
      })
    }

    return result
  }, [leaveDays, requestMap, profile.id, profile.timezone, schedules, overrides, rotations, month, lastDay])

  const selectedPreviewDay = preview?.day_details?.[0] || null
  const maxCredits = selectedPreviewDay?.max_credits || 0
  const selectedCredits = maxCredits <= 0.5 ? maxCredits : leavePeriod === 'full_shift' ? maxCredits : 0.5

  async function openLeave(day: CalendarDay) {
    if (!day.inMonth || day.status !== 'working') return
    setSelectedDay(day)
    setPreview(null)
    setLeaveType('vacation')
    setLeavePeriod('full_shift')
    setReason('')
    setBusy('preview')
    onError('')

    const { data, error } = await supabase.rpc('preview_my_leave_request_v2', {
      p_start_date: day.date,
      p_end_date: day.date,
      p_day_adjustments: [],
    })
    if (error) {
      onError(error.message)
      setSelectedDay(null)
    } else {
      setPreview(data as LeavePreview)
    }
    setBusy('')
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault()
    if (!selectedDay || !selectedPreviewDay || selectedCredits <= 0) return
    setBusy('leave')
    onError('')
    onMessage('')

    const period = maxCredits <= 0.5 ? 'full_shift' : leavePeriod
    const { data, error } = await supabase.rpc('submit_leave_request_v2', {
      p_leave_type: leaveType,
      p_start_date: selectedDay.date,
      p_end_date: selectedDay.date,
      p_reason: reason.trim() || null,
      p_day_adjustments: [{ date: selectedDay.date, credits: selectedCredits, period }],
    })

    if (error) {
      onError(error.message)
    } else {
      const result = data as { status?: string; credits?: number }
      onMessage(result.status === 'approved' ? 'Leave approved.' : 'Leave request submitted for Manager approval.')
      setSelectedDay(null)
      setPreview(null)
      await Promise.all([loadCalendar(), loadBalance()])
    }
    setBusy('')
  }

  return (
    <div className={styles.content}>
      <div className={styles.topGrid}>
        <div className={styles.panel}>
          <div className={styles.clockLabel}>{zoneLabel(now, profile.timezone)}</div>
          <div className={styles.clockTime}>{clock(now, profile.timezone)}</div>
          <div className={styles.small}>{currentDateLabel(now, profile.timezone)}</div>
          <div className={styles.small}>{profile.timezone}</div>
        </div>
        <div className={styles.panel}>
          <div className={styles.clockLabel}>{zoneLabel(now, 'America/Los_Angeles')}</div>
          <div className={styles.clockTime}>{clock(now, 'America/Los_Angeles')}</div>
          <div className={styles.small}>{currentDateLabel(now, 'America/Los_Angeles')}</div>
          <div className={styles.small}>Pacific Time</div>
        </div>
        <div className={`${styles.panel} ${styles.balance}`}>
          <div className={styles.balanceText}>
            <span>Leave balance</span>
            <strong>{summary?.balance ?? '—'} credits</strong>
            <span>{summary?.hours_equivalent ?? 0} hours equivalent · {summary?.pending_credits || 0} pending</span>
          </div>
        </div>
      </div>

      <div className={styles.calendarCard}>
        <div className={styles.calendarHeader}>
          <div>
            <h2>My Calendar</h2>
            <p>Click one working date to file leave. Leave reason is optional.</p>
          </div>
          <div className={styles.monthControls}>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth((value) => shiftMonth(value, -1))}>‹</button>
            <strong className={styles.monthTitle}>{monthTitle(month)}</strong>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth((value) => shiftMonth(value, 1))}>›</button>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth(currentMonthInZone(profile.timezone))}>Today</button>
          </div>
        </div>

        <div className={styles.calendarScroll} aria-busy={loading}>
          <div className={styles.weekHeader}>{WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}</div>
          <div className={styles.calendarGrid}>
            {days.map((day) => (
              <button
                type="button"
                key={day.date}
                onClick={() => openLeave(day)}
                disabled={!day.inMonth || day.status !== 'working'}
                className={`${styles.day} ${!day.inMonth ? styles.dayMuted : ''} ${day.isToday ? styles.dayToday : ''} ${day.inMonth && day.status === 'working' ? styles.dayClickable : ''}`}
              >
                <span className={styles.dayNumber}>{day.dayNumber}</span>
                {day.isToday && <span className={styles.todayTag}>Today</span>}
                {day.inMonth && <><span className={`${styles.status} ${styles[day.status]}`}>{day.label}</span>{day.detail && <span className={styles.detail}>{day.detail}</span>}</>}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.legend}>
          <span><i className={styles.green} />Working</span><span><i className={styles.gray} />Off</span><span><i className={styles.orange} />Leave</span><span><i className={styles.amber} />Pending</span>
          {summary && <span>{summary.balance} credits available · {summary.pending_credits || 0} pending</span>}
        </div>
      </div>

      {selectedDay && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target && busy !== 'leave') setSelectedDay(null) }}>
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <div><h2>File Leave</h2><p>{formatDateLong(selectedDay.date)} · {selectedDay.detail}</p></div>
            <button type="button" className={styles.close} onClick={() => setSelectedDay(null)}>×</button>
          </div>
          {busy === 'preview' || !preview ? <div className={styles.small}>Checking schedule and leave balance…</div> : (
            <form className={styles.form} onSubmit={submitLeave} onKeyDown={preventEnterSubmit}>
              <label className={styles.field}><span>Leave type</span><select value={leaveType} onChange={(event) => setLeaveType(event.target.value as 'vacation' | 'sick')}><option value="vacation">Vacation Leave</option><option value="sick">Sick Leave</option></select></label>

              <div className={styles.field}>
                <span>Leave duration</span>
                {maxCredits <= 0.5 ? (
                  <div className={styles.creditBox}><span>Full scheduled shift</span><strong>{maxCredits} credit</strong></div>
                ) : (
                  <div className={styles.choiceGrid}>
                    <button type="button" className={`${styles.choice} ${leavePeriod === 'full_shift' ? styles.choiceActive : ''}`} onClick={() => setLeavePeriod('full_shift')}><strong>Full Day</strong><span>{maxCredits} credit</span></button>
                    <button type="button" className={`${styles.choice} ${leavePeriod === 'first_half' ? styles.choiceActive : ''}`} onClick={() => setLeavePeriod('first_half')}><strong>First Half</strong><span>0.5 credit</span></button>
                    <button type="button" className={`${styles.choice} ${leavePeriod === 'second_half' ? styles.choiceActive : ''}`} onClick={() => setLeavePeriod('second_half')}><strong>Second Half</strong><span>0.5 credit</span></button>
                  </div>
                )}
              </div>

              <label className={styles.field}><span>Reason (optional)</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional note for your Manager" /></label>
              <div className={styles.creditBox}><span>{preview.auto_eligible ? 'Eligible for automatic approval' : 'Manager approval required'}</span><strong>{selectedCredits} credit{selectedCredits === 1 ? '' : 's'}</strong></div>
              {!preview.has_enough_balance && <div className={`${styles.alert} ${styles.error}`}>Not enough leave credits available.</div>}
              <div className={styles.modalFooter}><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setSelectedDay(null)}>Cancel</button><button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy === 'leave' || !preview.has_enough_balance}>{busy === 'leave' ? 'Submitting…' : 'Submit Leave'}</button></div>
            </form>
          )}
        </div>
      </div>}
    </div>
  )
}
