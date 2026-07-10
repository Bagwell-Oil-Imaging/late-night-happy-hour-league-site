import type { ScheduleWeek } from '../types'

export function isScheduleWeekVisible(week: Pick<ScheduleWeek, 'visible'>): boolean {
  return week.visible !== false
}

export function visibleWeekNumbers(scheduleWeeks: ScheduleWeek[]): Set<number> {
  return new Set(
    scheduleWeeks
      .filter(isScheduleWeekVisible)
      .map(week => week.week)
      .filter((week): week is number => week !== null)
  )
}
