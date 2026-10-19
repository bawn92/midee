// A Club month opens at midnight America/Los_Angeles on the first day and
// closes at midnight America/Los_Angeles as that last day ends, which is
// 00:00 on the first day of the next month.

export const CLUB_TIME_ZONE = 'America/Los_Angeles'

export function currentMonthId(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  return `${year}-${month}`
}

export function monthBounds(monthId: string): { opensAt: Date; closesAt: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthId)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!year || month < 1 || month > 12) return null
  return { opensAt: monthOpensAt(year, month), closesAt: monthClosesAt(year, month) }
}

export function isMonthClosed(monthId: string, now = new Date()): boolean {
  const bounds = monthBounds(monthId)
  if (!bounds) return false
  return now.getTime() >= bounds.closesAt.getTime()
}

export function monthOpensAt(year: number, month: number): Date {
  return zonedWallTimeToUtc(year, month, 1, 0, 0, 0)
}

/** Midnight at the start of the next month. The last day stays open until then. */
export function monthClosesAt(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  return zonedWallTimeToUtc(nextYear, nextMonth, 1, 0, 0, 0)
}

function zoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  let hour = value('hour')
  if (hour === 24) hour = 0
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    hour,
    value('minute'),
    value('second'),
  )
  return asUtc - instant.getTime()
}

function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  let utc = wall
  for (let i = 0; i < 4; i++) utc = wall - zoneOffsetMs(new Date(utc))
  return new Date(utc)
}
