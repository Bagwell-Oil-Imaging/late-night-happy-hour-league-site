/**
 * @file OffSeasonLanding.tsx
 * @module components/OffSeasonLanding
 *
 * Replaces the normal homepage dashboard when the league is between seasons
 * (`settings/global.seasonActive === false`). Promotes the league interest
 * form, links out to season history, and — once the upcoming season's
 * schedule has a Week 1 date — shows a live countdown to it.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import SeasonCountdown from './SeasonCountdown'
import LeagueFormatInfo from './LeagueFormatInfo'
import QRCodeModal from './QRCodeModal'
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
  const [showQrCode, setShowQrCode] = useState(false)

  return (
    <div className="off-season-landing">
      <div className="off-season-hero">
        <span className="off-season-eyebrow">Between Seasons</span>
        <h1 className="off-season-title">Late Night Happy Hour</h1>
        <p className="off-season-subtitle">
          {upcomingSeasonYear
            ? `We're gearing up for the ${upcomingSeasonYear} season.`
            : "We're gearing up for the next season."}
          <br />
          Interested in bowling with us? Let us know below.
        </p>
      </div>

      <div className="off-season-countdown-card">
        <div className="off-season-countdown-header">
          <h2 className="off-season-countdown-title">
            {week1Date ? `Countdown to Week 1: ${formatWeek1Date(week1Date)}` : 'Countdown to Week 1'}
          </h2>
          <button
            type="button"
            className="off-season-qr-trigger"
            onClick={() => setShowQrCode(true)}
            aria-label="Show QR code for this website"
            title="Show QR code"
          >
            {/* QR code glyph */}
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M1 1h5v5H1V1zm1 1v3h3V2H2zm.75.75h1.5v1.5h-1.5v-1.5zM1 10h5v5H1v-5zm1 1v3h3v-3H2zm.75.75h1.5v1.5h-1.5v-1.5zM10 1h5v5h-5V1zm1 1v3h3V2h-3zm.75.75h1.5v1.5h-1.5v-1.5zM10 10h1.5v1.5H10V10zm2 0h1.5v1.5H12V10zM10 12h1.5v1.5H10V12zm2 0h1.5v1.5H12V12zm-1 2h1.5v1.5H11V14zM7 1h1.5v1.5H7V1zM7 3h1.5v1.5H7V3zm0 3h1.5v1.5H7V6zM7 8.5h1.5V10H7V8.5zM7 11h1.5v1.5H7V11zm0 3h1.5v1.5H7V14z"/>
            </svg>
          </button>
        </div>
        {week1Date ? (
          <SeasonCountdown targetDate={week1Date} />
        ) : (
          <p className="off-season-countdown-pending">Schedule coming soon — check back for a kickoff date.</p>
        )}
      </div>

      <QRCodeModal isOpen={showQrCode} onClose={() => setShowQrCode(false)} />

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
