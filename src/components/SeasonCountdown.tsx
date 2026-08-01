/**
 * @file SeasonCountdown.tsx
 * @module components/SeasonCountdown
 *
 * Live countdown timer to a target date (Week 1 of the upcoming season).
 * Ticks once per second; renders days/hours/minutes/seconds as separate
 * digit blocks. Used by OffSeasonLanding on the homepage between seasons.
 */

import { useEffect, useState } from 'react'
import './SeasonCountdown.css'

interface SeasonCountdownProps {
  /** Target date in `YYYY-MM-DD` form, parsed as local midnight. */
  targetDate: string
}

interface TimeRemaining {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Computes the remaining time until `targetDate` (local midnight), floored
 * at zero so the display never goes negative once the date has passed.
 */
function getTimeRemaining(targetDate: string): TimeRemaining {
  const [year, month, day] = targetDate.split('-').map(Number)
  const target = new Date(year, month - 1, day).getTime()
  const diffMs = Math.max(0, target - Date.now())

  const totalSeconds = Math.floor(diffMs / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function SeasonCountdown({ targetDate }: SeasonCountdownProps) {
  const [remaining, setRemaining] = useState(() => getTimeRemaining(targetDate))

  useEffect(() => {
    setRemaining(getTimeRemaining(targetDate))
    const interval = setInterval(() => setRemaining(getTimeRemaining(targetDate)), 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  const hasArrived = remaining.days === 0 && remaining.hours === 0 && remaining.minutes === 0 && remaining.seconds === 0

  if (hasArrived) {
    return <p className="countdown-arrived">Week 1 is here — see you on the lanes!</p>
  }

  const units: { value: number; label: string }[] = [
    { value: remaining.days, label: 'Days' },
    { value: remaining.hours, label: 'Hours' },
    { value: remaining.minutes, label: 'Min' },
    { value: remaining.seconds, label: 'Sec' },
  ]

  return (
    <div className="season-countdown" role="timer" aria-live="off">
      {units.map((unit) => (
        <div key={unit.label} className="countdown-unit">
          <span className="countdown-value">{String(unit.value).padStart(2, '0')}</span>
          <span className="countdown-label">{unit.label}</span>
        </div>
      ))}
    </div>
  )
}

export default SeasonCountdown
