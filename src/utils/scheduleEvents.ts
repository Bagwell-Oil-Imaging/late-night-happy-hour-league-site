import type { ScheduleWeekEvent } from '../types'

interface ScheduleEventConfig {
  /** Which glyph to draw */
  icon: 'trophy' | 'crown'
  /** Icon fill color — the metal tier is what distinguishes playoffs week 1/2/championship, not text */
  color: string
  /** Full label shown in the admin dropdown and as the badge's hover/aria title */
  label: string
}

const BRONZE = '#cd7f32'
const SILVER = '#b8c0c8'
const GOLD = '#f0b429'

/** Single source of truth for every playoff/championship tag — admin dropdown options and the public badge both read from this. */
export const SCHEDULE_EVENT_CONFIG: Record<ScheduleWeekEvent, ScheduleEventConfig> = {
  'first-half-playoffs-1': { icon: 'trophy', color: BRONZE, label: 'First Half Playoffs — Week 1' },
  'first-half-playoffs-2': { icon: 'trophy', color: SILVER, label: 'First Half Playoffs — Week 2' },
  'first-half-championship': { icon: 'trophy', color: GOLD, label: 'First Half Championship' },
  'second-half-playoffs-1': { icon: 'trophy', color: BRONZE, label: 'Second Half Playoffs — Week 1' },
  'second-half-playoffs-2': { icon: 'trophy', color: SILVER, label: 'Second Half Playoffs — Week 2' },
  'second-half-championship': { icon: 'trophy', color: GOLD, label: 'Second Half Championship' },
  'league-championship': { icon: 'crown', color: GOLD, label: 'League Championship' },
}

/** Ordered for the admin dropdown — chronological within a season (first half, then second half, then the league final). */
export const SCHEDULE_EVENT_OPTIONS: ScheduleWeekEvent[] = [
  'first-half-playoffs-1',
  'first-half-playoffs-2',
  'first-half-championship',
  'second-half-playoffs-1',
  'second-half-playoffs-2',
  'second-half-championship',
  'league-championship',
]
