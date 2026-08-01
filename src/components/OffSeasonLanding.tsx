/**
 * @file OffSeasonLanding.tsx
 * @module components/OffSeasonLanding
 *
 * Replaces the normal homepage dashboard when the league is between seasons
 * (`settings/global.seasonActive === false`). Promotes the league interest
 * form, links out to season history, and — once the upcoming season's
 * schedule has a Week 1 date — shows a live countdown to it.
 */

import { Link } from 'react-router-dom'
import SeasonCountdown from './SeasonCountdown'
import LeagueFormatInfo from './LeagueFormatInfo'
import './OffSeasonLanding.css'

interface OffSeasonLandingProps {
  /** Season year the site is prepping for, or null if not yet set by the admin. */
  upcomingSeasonYear: string | null
  /** Week 1 date (`YYYY-MM-DD`) from the upcoming season's schedule, or null if not built yet. */
  week1Date: string | null
}

/**
 * Formats a `YYYY-MM-DD` date string as `MM/DD/YYYY` using local-time parsing
 * (avoids the UTC-midnight-shift bug that displays the prior day in
 * UTC-negative timezones when parsing a bare ISO string directly).
 */
function formatWeek1Date(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year}`
}

function OffSeasonLanding({ upcomingSeasonYear, week1Date }: OffSeasonLandingProps) {
  return (
    <div className="off-season-landing">
      <div className="off-season-hero">
        <span className="off-season-eyebrow">Between Seasons</span>
        <h1 className="off-season-title">Late Night Happy Hour</h1>
        <p className="off-season-subtitle">
          {upcomingSeasonYear
            ? `We're gearing up for the ${upcomingSeasonYear} season.`
            : "We're gearing up for the next season."}
          {' '}Interested in bowling with us? Let us know below.
        </p>
      </div>

      <div className="off-season-countdown-card">
        <h2 className="off-season-countdown-title">
          {week1Date ? `Countdown to Week 1: ${formatWeek1Date(week1Date)}` : 'Countdown to Week 1'}
        </h2>
        {week1Date ? (
          <SeasonCountdown targetDate={week1Date} />
        ) : (
          <p className="off-season-countdown-pending">Schedule coming soon — check back for a kickoff date.</p>
        )}
      </div>

      <div className="off-season-actions">
        <Link to="/contact" className="off-season-cta off-season-cta-primary">
          Join the League!
        </Link>
        {/* Browse Season History hidden for now — re-add when there's a season worth browsing. */}
      </div>

      <div className="off-season-format">
        <h2 className="off-season-format-title">How the League Works</h2>
        <LeagueFormatInfo />
      </div>
    </div>
  )
}

export default OffSeasonLanding
