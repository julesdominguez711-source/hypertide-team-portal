export type Month = { year: number; month: number }

export type ScheduleRow = {
  id: string
  employee_id: string
  weekday: number
  is_working: boolean
  start_time: string | null
  end_time: string | null
  timezone: string
  effective_from: string
  effective_to: string | null
}

export type ScheduleOverride = {
  id: string
  employee_id: string
  work_date: string
  is_working: boolean
  start_time: string | null
  end_time: string | null
  timezone: string
  reason: string | null
}

export type WeekendRotation = {
  id: string
  employee_id: string
  pacific_weekend_day: 'Saturday' | 'Sunday'
  alternating: boolean
  anchor_week_start: string | null
  anchor_working: boolean | null
  active: boolean
}

export type Shift = {
  employeeId: string
  localDate: string
  startTime: string
  endTime: string
  timezone: string
  start: Date
  end: Date
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function ymd(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

export function parseYmd(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month: month - 1, day }
}

export function dateOnly(value: string) {
  const p = parseYmd(value)
  return new Date(Date.UTC(p.year, p.month, p.day))
}

export function addDays(value: string, days: number) {
  const date = dateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return ymd(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function currentDateInZone(timeZone: string) {
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

export function currentMonthInZone(timeZone: string): Month {
  const { year, month } = parseYmd(currentDateInZone(timeZone))
  return { year, month }
}

export function shiftMonth(current: Month, amount: number): Month {
  const date = new Date(Date.UTC(current.year, current.month + amount, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}

export function monthTitle(month: Month) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(month.year, month.month, 1)))
}

export function formatTime(value: string | null) {
  if (!value) return ''
  const [hourText, minuteText] = value.slice(0, 5).split(':')
  const hour = Number(hourText)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minuteText} ${suffix}`
}

export function formatDateLong(value: string) {
  const p = parseYmd(value)
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(p.year, p.month, p.day)))
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

export function localDateTimeToDate(dateValue: string, timeValue: string, timeZone: string) {
  const d = parseYmd(dateValue)
  const [hour, minute] = timeValue.slice(0, 5).split(':').map(Number)
  const target = Date.UTC(d.year, d.month, d.day, hour, minute, 0)
  let guess = new Date(target)
  for (let i = 0; i < 4; i += 1) guess = new Date(target - offsetMs(guess, timeZone))
  return guess
}

function pacificDateAndDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map: Record<string, string> = {}
  for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value
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

export function scheduleForDate(rows: ScheduleRow[], employeeId: string, dateValue: string) {
  const weekday = dateOnly(dateValue).getUTCDay()
  return rows
    .filter((row) => row.employee_id === employeeId && row.weekday === weekday && row.effective_from <= dateValue && (!row.effective_to || row.effective_to >= dateValue))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null
}

export function rotationAllowsShift(
  employeeId: string,
  workDate: string,
  startTime: string,
  endTime: string,
  timeZone: string,
  rotations: WeekendRotation[],
) {
  const employeeRotations = rotations.filter((row) => row.employee_id === employeeId)
  if (employeeRotations.length === 0) return true

  const start = localDateTimeToDate(workDate, startTime, timeZone)
  const crossesMidnight = endTime.slice(0, 5) <= startTime.slice(0, 5)
  const endWorkDate = crossesMidnight ? addDays(workDate, 1) : workDate
  const end = localDateTimeToDate(endWorkDate, endTime, timeZone)
  const touched = [pacificDateAndDay(start), pacificDateAndDay(end)]

  for (const rotation of employeeRotations) {
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

export function getShiftForLocalDate(
  employeeId: string,
  fallbackTimezone: string,
  localDate: string,
  schedules: ScheduleRow[],
  overrides: ScheduleOverride[],
  rotations: WeekendRotation[],
): Shift | null {
  const override = overrides.find((row) => row.employee_id === employeeId && row.work_date === localDate)
  const schedule = scheduleForDate(schedules, employeeId, localDate)

  const isWorking = override ? override.is_working : Boolean(schedule?.is_working)
  const startTime = override ? override.start_time : schedule?.start_time
  const endTime = override ? override.end_time : schedule?.end_time
  const timezone = override?.timezone || schedule?.timezone || fallbackTimezone

  if (!isWorking || !startTime || !endTime) return null
  if (!override && !rotationAllowsShift(employeeId, localDate, startTime, endTime, timezone, rotations)) return null

  const start = localDateTimeToDate(localDate, startTime, timezone)
  const crossesMidnight = endTime.slice(0, 5) <= startTime.slice(0, 5)
  const endDate = crossesMidnight ? addDays(localDate, 1) : localDate
  const end = localDateTimeToDate(endDate, endTime, timezone)

  return { employeeId, localDate, startTime, endTime, timezone, start, end }
}

export function shiftForPacificDate(
  employeeId: string,
  fallbackTimezone: string,
  pacificDate: string,
  schedules: ScheduleRow[],
  overrides: ScheduleOverride[],
  rotations: WeekendRotation[],
) {
  const dayStart = localDateTimeToDate(pacificDate, '00:00', 'America/Los_Angeles')
  const dayEnd = localDateTimeToDate(addDays(pacificDate, 1), '00:00', 'America/Los_Angeles')
  const candidates = [addDays(pacificDate, -1), pacificDate, addDays(pacificDate, 1)]

  return candidates
    .map((localDate) => getShiftForLocalDate(employeeId, fallbackTimezone, localDate, schedules, overrides, rotations))
    .filter((shift): shift is Shift => Boolean(shift && shift.start < dayEnd && shift.end > dayStart))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0] || null
}

export function formatShiftInZone(shift: Shift, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${formatter.format(shift.start)} – ${formatter.format(shift.end)}`
}

export function monthRange(month: Month) {
  const firstDate = ymd(month.year, month.month, 1)
  const lastDay = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate()
  const lastDate = ymd(month.year, month.month, lastDay)
  return { firstDate, lastDate, lastDay }
}
