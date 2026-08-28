export type ScheduleDraft = {
  weekday: number
  is_working: boolean
  start_time: string
  end_time: string
}

export type PacificPreview = {
  label: string
  weekendDays: string[]
}

export const DAYS = [
  { name: 'Monday', weekday: 1 },
  { name: 'Tuesday', weekday: 2 },
  { name: 'Wednesday', weekday: 3 },
  { name: 'Thursday', weekday: 4 },
  { name: 'Friday', weekday: 5 },
  { name: 'Saturday', weekday: 6 },
  { name: 'Sunday', weekday: 0 },
]

export const TIMEZONES = [
  'Asia/Manila',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'UTC',
]

export function initialSchedule(): ScheduleDraft[] {
  return DAYS.map((day) => ({
    weekday: day.weekday,
    is_working: false,
    start_time: '09:00',
    end_time: '17:00',
  }))
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

function localDateTimeToDate(
  ymd: { year: number; month: number; day: number },
  time: string,
  timeZone: string,
) {
  const [hour, minute] = time.split(':').map(Number)
  const target = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, 0)
  let guess = new Date(target)
  for (let i = 0; i < 4; i += 1) guess = new Date(target - offsetMs(guess, timeZone))
  return guess
}

function addDateDays(ymd: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function currentMonday(timeZone: string) {
  const p = zoneParts(new Date(), timeZone)
  const localDate = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const day = localDate.getUTCDay()
  return addDateDays({ year: p.year, month: p.month, day: p.day }, -((day + 6) % 7))
}

export function previewPacific(row: ScheduleDraft, index: number, timeZone: string): PacificPreview | null {
  if (!row.is_working || !row.start_time || !row.end_time) return null

  try {
    const monday = currentMonday(timeZone)
    const startDate = addDateDays(monday, index)
    const [sh, sm] = row.start_time.split(':').map(Number)
    const [eh, em] = row.end_time.split(':').map(Number)
    const endDate = addDateDays(startDate, eh * 60 + em <= sh * 60 + sm ? 1 : 0)
    const start = localDateTimeToDate(startDate, row.start_time, timeZone)
    const end = localDateTimeToDate(endDate, row.end_time, timeZone)

    const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' })
    const shortFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })

    const startDay = weekdayFmt.format(start)
    const endDay = weekdayFmt.format(end)
    const weekendDays = Array.from(new Set([startDay, endDay].filter((day) => day === 'Saturday' || day === 'Sunday')))

    return { label: `${shortFmt.format(start)} – ${shortFmt.format(end)} PT`, weekendDays }
  } catch {
    return null
  }
}
