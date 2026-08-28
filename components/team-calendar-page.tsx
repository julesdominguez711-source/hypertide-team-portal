'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import PortalManager from '@/components/portal-manager'
import {
  WEEKDAYS,
  currentDateInZone,
  currentMonthInZone,
  formatDateLong,
  formatShiftInZone,
  monthRange,
  monthTitle,
  shiftForPacificDate,
  shiftMonth,
  ymd,
  type Month,
  type ScheduleOverride,
  type ScheduleRow,
  type Shift,
  type WeekendRotation,
} from '@/lib/calendar-helpers'
import styles from './calendar-portal.module.css'

const supabase = createClient()

type CurrentProfile = {
  id: string
  email: string
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'manager' | 'teammate' | 'dev'
  status: 'pending' | 'active' | 'inactive' | 'terminated'
  timezone: string
  onboarding_complete: boolean
}

type TeamProfile = CurrentProfile

type LeaveRequest = {
  id: string
  employee_id: string
  leave_type: 'vacation' | 'sick'
  status: string
}

type LeaveDay = {
  employee_id: string
  leave_request_id: string
  leave_date: string
  requested_credits: number
  leave_period: 'full_shift' | 'first_half' | 'second_half'
}

type ReviewDay = {
  date: string
  requested_credits: number
  leave_period: 'full_shift' | 'first_half' | 'second_half'
}

type LeaveReview = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string
  leave_type: string
  credits_requested: number
  reason: string | null
  day_breakdown: ReviewDay[]
}

type TeamStatus = {
  profile: TeamProfile
  shift: Shift | null
  kind: 'working' | 'leave' | 'off'
  leaveDay?: LeaveDay
  leaveRequest?: LeaveRequest
}

type CalendarDay = {
  date: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  leaveNames: string[]
  workingCount: number
  offCount: number
}

function displayName(profile: TeamProfile) {
  return profile.nickname || profile.full_name || profile.email
}

function leaveMeta(day: LeaveDay, request: LeaveRequest) {
  const type = request.leave_type === 'sick' ? 'Sick Leave' : 'Vacation Leave'
  if (day.requested_credits < 1) return `${type} · ${day.leave_period === 'second_half' ? 'Second Half' : 'First Half'}`
  return type
}

export default function TeamCalendarPage({
  currentProfile,
  onMessage,
  onError,
}: {
  currentProfile: CurrentProfile
  onMessage: (value: string) => void
  onError: (value: string) => void
}) {
  const [month, setMonth] = useState<Month>(() => currentMonthInZone('America/Los_Angeles'))
  const [people, setPeople] = useState<TeamProfile[]>([])
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [overrides, setOverrides] = useState<ScheduleOverride[]>([])
  const [rotations, setRotations] = useState<WeekendRotation[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [leaveDays, setLeaveDays] = useState<LeaveDay[]>([])
  const [reviews, setReviews] = useState<LeaveReview[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [busyReview, setBusyReview] = useState('')
  const [loading, setLoading] = useState(true)
  const { firstDate, lastDate, lastDay } = monthRange(month)

  async function load() {
    setLoading(true)
    const [peopleResult, scheduleResult, overrideResult, rotationResult, requestResult, dayResult, reviewResult] = await Promise.all([
      supabase.from('profiles').select('id,email,full_name,nickname,role,status,timezone,onboarding_complete').eq('status', 'active').eq('onboarding_complete', true).order('created_at'),
      supabase.from('schedules').select('*').lte('effective_from', lastDate).order('effective_from', { ascending: false }),
      supabase.from('schedule_overrides').select('*').gte('work_date', firstDate).lte('work_date', lastDate),
      supabase.from('weekend_rotations').select('*').eq('active', true),
      supabase.from('leave_requests').select('id,employee_id,leave_type,status').eq('status', 'approved').lte('start_date', lastDate).gte('end_date', firstDate),
      supabase.from('leave_request_days').select('employee_id,leave_request_id,leave_date,requested_credits,leave_period').gte('leave_date', firstDate).lte('leave_date', lastDate),
      supabase.rpc('list_leave_requests_for_review_v2'),
    ])

    const firstError = peopleResult.error || scheduleResult.error || overrideResult.error || rotationResult.error || requestResult.error || dayResult.error || reviewResult.error
    if (firstError) onError(firstError.message)
    setPeople((peopleResult.data || []) as TeamProfile[])
    setSchedules((scheduleResult.data || []) as ScheduleRow[])
    setOverrides((overrideResult.data || []) as ScheduleOverride[])
    setRotations((rotationResult.data || []) as WeekendRotation[])
    setLeaveRequests((requestResult.data || []) as LeaveRequest[])
    setLeaveDays((dayResult.data || []) as LeaveDay[])
    setReviews((reviewResult.data || []) as LeaveReview[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [firstDate, lastDate])

  const approvedRequestMap = useMemo(() => new Map(leaveRequests.map((request) => [request.id, request])), [leaveRequests])
  const leaveMap = useMemo(() => {
    const map = new Map<string, { day: LeaveDay; request: LeaveRequest }>()
    for (const day of leaveDays) {
      const request = approvedRequestMap.get(day.leave_request_id)
      if (request) map.set(`${day.employee_id}|${day.leave_date}`, { day, request })
    }
    return map
  }, [leaveDays, approvedRequestMap])

  function statusesForDate(pacificDate: string): TeamStatus[] {
    return people.map((profile) => {
      const shift = shiftForPacificDate(profile.id, profile.timezone, pacificDate, schedules, overrides, rotations)
      if (!shift) return { profile, shift: null, kind: 'off' as const }
      const leave = leaveMap.get(`${profile.id}|${shift.localDate}`)
      if (leave) return { profile, shift, kind: 'leave' as const, leaveDay: leave.day, leaveRequest: leave.request }
      return { profile, shift, kind: 'working' as const }
    })
  }

  const days = useMemo<CalendarDay[]>(() => {
    const today = currentDateInZone('America/Los_Angeles')
    const startOffset = new Date(Date.UTC(month.year, month.month, 1)).getUTCDay()
    const cellCount = Math.ceil((startOffset + lastDay) / 7) * 7
    const firstCell = new Date(Date.UTC(month.year, month.month, 1 - startOffset))
    const result: CalendarDay[] = []

    for (let i = 0; i < cellCount; i += 1) {
      const date = new Date(firstCell)
      date.setUTCDate(firstCell.getUTCDate() + i)
      const dateValue = ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      const inMonth = date.getUTCMonth() === month.month
      const statuses = inMonth ? statusesForDate(dateValue) : []
      result.push({
        date: dateValue,
        dayNumber: date.getUTCDate(),
        inMonth,
        isToday: dateValue === today,
        leaveNames: statuses.filter((row) => row.kind === 'leave').map((row) => displayName(row.profile)),
        workingCount: statuses.filter((row) => row.kind === 'working').length,
        offCount: statuses.filter((row) => row.kind === 'off').length,
      })
    }
    return result
  }, [people, schedules, overrides, rotations, leaveMap, month, lastDay])

  const selectedStatuses = useMemo(() => selectedDate ? statusesForDate(selectedDate) : [], [selectedDate, people, schedules, overrides, rotations, leaveMap])
  const selectedShiftByEmployee = useMemo(() => new Map(selectedStatuses.filter((row) => row.shift).map((row) => [row.profile.id, row.shift as Shift])), [selectedStatuses])
  const selectedReviews = useMemo(() => {
    if (!selectedDate) return []
    return reviews.filter((review) => {
      const shift = selectedShiftByEmployee.get(review.employee_id)
      return Boolean(shift && review.day_breakdown?.some((day) => day.date === shift.localDate))
    })
  }, [selectedDate, reviews, selectedShiftByEmployee])

  async function reviewLeave(requestId: string, decision: 'approve' | 'reject') {
    setBusyReview(requestId)
    onError('')
    onMessage('')
    const { error } = await supabase.rpc('review_leave_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_review_note: null,
    })
    if (error) onError(error.message)
    else {
      onMessage(decision === 'approve' ? 'Leave approved.' : 'Leave rejected.')
      await load()
    }
    setBusyReview('')
  }

  return (
    <div className={styles.content}>
      <div className={styles.calendarCard}>
        <div className={styles.calendarHeader}>
          <div>
            <h2>Team Calendar</h2>
            <p>Pacific Time · calendar shows approved leave at a glance. Click any date for full coverage.</p>
          </div>
          <div className={styles.monthControls}>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth((value) => shiftMonth(value, -1))}>‹</button>
            <strong className={styles.monthTitle}>{monthTitle(month)}</strong>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth((value) => shiftMonth(value, 1))}>›</button>
            <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setMonth(currentMonthInZone('America/Los_Angeles'))}>Today</button>
            <button type="button" className={`${styles.button} ${styles.primary} ${styles.toolsButton}`} onClick={() => setToolsOpen(true)}>Team Settings</button>
          </div>
        </div>

        <div className={styles.calendarScroll} aria-busy={loading}>
          <div className={styles.weekHeader}>{WEEKDAYS.map((weekday) => <div key={weekday}>{weekday}</div>)}</div>
          <div className={styles.calendarGrid}>
            {days.map((day) => (
              <button
                type="button"
                key={day.date}
                disabled={!day.inMonth}
                onClick={() => day.inMonth && setSelectedDate(day.date)}
                className={`${styles.day} ${!day.inMonth ? styles.dayMuted : styles.dayClickable} ${day.isToday ? styles.dayToday : ''}`}
              >
                <span className={styles.dayNumber}>{day.dayNumber}</span>
                {day.isToday && <span className={styles.todayTag}>Today</span>}
                {day.inMonth && <div className={styles.leaveNames}>
                  {day.leaveNames.length ? <>{day.leaveNames.slice(0, 3).map((name) => <span className={styles.leaveName} key={name}>{name} · Leave</span>)}{day.leaveNames.length > 3 && <span className={styles.leaveName}>+{day.leaveNames.length - 3} more</span>}</> : <span className={styles.noLeave}>No leave</span>}
                  <span className={styles.detail}>{day.workingCount} working · {day.offCount} off</span>
                </div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedDate && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedDate(null) }}>
        <div className={`${styles.modal} ${styles.modalWide}`}>
          <div className={styles.modalHeader}>
            <div><h2>{formatDateLong(selectedDate)}</h2><p>Team coverage in Pacific Time</p></div>
            <button type="button" className={styles.close} onClick={() => setSelectedDate(null)}>×</button>
          </div>
          <div className={styles.teamSummary}>
            <div className={styles.teamStat}><span>Working</span><strong>{selectedStatuses.filter((row) => row.kind === 'working').length}</strong></div>
            <div className={styles.teamStat}><span>On Leave</span><strong>{selectedStatuses.filter((row) => row.kind === 'leave').length}</strong></div>
            <div className={styles.teamStat}><span>Off</span><strong>{selectedStatuses.filter((row) => row.kind === 'off').length}</strong></div>
          </div>

          {selectedReviews.length > 0 && <div className={styles.section}>
            <div className={styles.sectionTitle}>Pending Leave Approval</div>
            <div className={styles.personList}>{selectedReviews.map((review) => <div className={styles.pendingRow} key={review.id}><div><strong>{review.employee_name || review.employee_email}</strong><div className={styles.personMeta}>{review.leave_type === 'sick' ? 'Sick Leave' : 'Vacation Leave'} · {review.credits_requested} credit(s){review.reason ? ` · ${review.reason}` : ''}</div></div><div className={styles.actions}><button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busyReview === review.id} onClick={() => reviewLeave(review.id, 'reject')}>Reject</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busyReview === review.id} onClick={() => reviewLeave(review.id, 'approve')}>Approve</button></div></div>)}</div>
          </div>}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Working</div>
            <div className={styles.personList}>{selectedStatuses.filter((row) => row.kind === 'working').map((row) => <div className={styles.person} key={row.profile.id}><div><strong>{displayName(row.profile)}</strong><div className={styles.personMeta}>{row.shift ? `${formatShiftInZone(row.shift, 'America/Los_Angeles')} PT` : ''}</div></div><span className={styles.working}>Working</span></div>)}{selectedStatuses.every((row) => row.kind !== 'working') && <div className={styles.small}>Nobody scheduled.</div>}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>On Leave</div>
            <div className={styles.personList}>{selectedStatuses.filter((row) => row.kind === 'leave').map((row) => <div className={styles.person} key={row.profile.id}><div><strong>{displayName(row.profile)}</strong><div className={styles.personMeta}>{row.leaveDay && row.leaveRequest ? leaveMeta(row.leaveDay, row.leaveRequest) : 'Leave'}{row.shift ? ` · scheduled ${formatShiftInZone(row.shift, 'America/Los_Angeles')} PT` : ''}</div></div><span className={styles.leave}>Leave</span></div>)}{selectedStatuses.every((row) => row.kind !== 'leave') && <div className={styles.small}>Nobody on approved leave.</div>}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Off</div>
            <div className={styles.personList}>{selectedStatuses.filter((row) => row.kind === 'off').map((row) => <div className={styles.person} key={row.profile.id}><strong>{displayName(row.profile)}</strong><span className={styles.off}>Off</span></div>)}</div>
          </div>
        </div>
      </div>}

      {toolsOpen && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) setToolsOpen(false) }}>
        <div className={`${styles.modal} ${styles.modalWide}`}>
          <div className={styles.modalHeader}><div><h2>Team Settings</h2><p>Approvals, people, schedules, corrections, and audit history stay here instead of separate portal pages.</p></div><button type="button" className={styles.close} onClick={() => setToolsOpen(false)}>×</button></div>
          <div className={styles.toolsWrap}>
            <div className={styles.toolsIntro}>These are management tools only. Your normal Manager/Admin portal still has just My Calendar and Team Calendar.</div>
            <PortalManager currentProfile={currentProfile} onMessage={onMessage} onError={onError} />
          </div>
        </div>
      </div>}
    </div>
  )
}
