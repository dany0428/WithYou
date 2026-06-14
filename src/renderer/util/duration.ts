// Human-readable duration formatting for the "online together" counter.

/** Compact form for the widget badge, e.g. "just now", "5m", "12h 34m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 1) return 'just now'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 1) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

/**
 * Whole days a couple has been together, given the anniversary as a local
 * `YYYY-MM-DD` string. Counted inclusively, so the start day itself is "Day 1"
 * (the popular couple-app convention). Returns null for an empty/invalid date or
 * one in the future (nothing to count yet).
 */
export function daysTogether(anniversary: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anniversary)) return null
  const start = new Date(`${anniversary}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const now = new Date()
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.floor((today.getTime() - startDay.getTime()) / 86_400_000) + 1
  return days >= 1 ? days : null
}

/**
 * If *today* is a relationship milestone for the given anniversary, returns a
 * celebratory label; otherwise null. Milestones are the yearly anniversary (by
 * calendar date, so leap years stay correct) and every 100th day together. The
 * yearly mark wins when both land on the same day.
 */
export function anniversaryMilestone(anniversary: string): string | null {
  const days = daysTogether(anniversary)
  if (days === null) return null
  const start = new Date(`${anniversary}T00:00:00`)
  const now = new Date()
  const sameCalendarDay =
    now.getMonth() === start.getMonth() && now.getDate() === start.getDate()
  const years = now.getFullYear() - start.getFullYear()
  if (sameCalendarDay && years >= 1) {
    return `${years} year${years > 1 ? 's' : ''} together! 🎉`
  }
  if (days % 100 === 0) {
    return `${days} days together! 🎉`
  }
  return null
}

/** Longer form for the settings stats card, e.g. "3 days, 4h 5m", "12h 34m". */
export function formatDurationLong(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes < 1) return 'less than a minute'
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`)
  return parts.join(', ')
}
