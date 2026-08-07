import type { ScheduleWeekEvent } from '../types'
import { SCHEDULE_EVENT_CONFIG } from '../utils/scheduleEvents'

/**
 * Simplified trophy glyph — cup, two handles, stem, base. No text overlay;
 * the fill color alone (bronze/silver/gold) distinguishes playoffs week 1,
 * week 2, and the half championship.
 */
function TrophyIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 01-5 5 5 5 0 01-5-5V4z" fill={color} />
      <path d="M7 5H4a1 1 0 00-1 1v1a4 4 0 004 4" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M17 5h3a1 1 0 011 1v1a4 4 0 01-4 4" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="11" y="13" width="2" height="4" fill={color} />
      <rect x="9.5" y="16.5" width="5" height="2" rx="1" fill={color} />
      <rect x="7.5" y="18.5" width="9" height="2" rx="1" fill={color} />
    </svg>
  )
}

/** Simple three-point crown glyph, always gold — reserved for the League Championship. */
function CrownIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
      <path d="M4 10l4 3.5L12 6l4 7.5 4-3.5-1.6 8H5.6L4 10z" fill={color} />
      <rect x="5.6" y="18" width="12.8" height="2" rx="1" fill={color} />
    </svg>
  )
}

interface ScheduleEventBadgeProps {
  event: ScheduleWeekEvent
  /** Pixel width/height of the icon; the wrapper is square. */
  size?: number
  className?: string
}

/**
 * Playoff/championship badge — a bronze/silver/gold trophy or gold crown,
 * per `SCHEDULE_EVENT_CONFIG`. Purely decorative besides the title/aria-label,
 * which carries the full "First Half Playoffs — Week 1" style text for
 * hover tooltips and screen readers.
 */
function ScheduleEventBadge({ event, size = 16, className }: ScheduleEventBadgeProps) {
  const config = SCHEDULE_EVENT_CONFIG[event]
  return (
    <span
      className={className}
      title={config.label}
      role="img"
      aria-label={config.label}
      style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0 }}
    >
      {config.icon === 'trophy' ? <TrophyIcon color={config.color} /> : <CrownIcon color={config.color} />}
    </span>
  )
}

export default ScheduleEventBadge
