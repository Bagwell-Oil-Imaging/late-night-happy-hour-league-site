/**
 * @file LeagueFormatInfo.tsx
 * @module components/LeagueFormatInfo
 *
 * Shared "Team Format / League Obligations / Dues & Fees" info cards.
 * Single source of truth for this content — originally lived only in
 * ContactPage's sidebar; also rendered on OffSeasonLanding so prospective
 * bowlers see how the league works before they even reach the interest form.
 */

import './LeagueFormatInfo.css'

function LeagueFormatInfo() {
  return (
    <div className="league-format-info">
      <div className="info-card">
        <h3 className="info-card-title">Team Format</h3>
        <ul className="info-list">
          <li><span className="info-bullet">▸</span> 4 bowlers per team</li>
          <li><span className="info-bullet">▸</span> Thursday nights, weekly</li>
          <li><span className="info-bullet">▸</span> Season runs September – May</li>
          <li><span className="info-bullet">▸</span> 3-game series each week</li>
          <li><span className="info-bullet">▸</span> Handicap scoring based on entering average</li>
          <li><span className="info-bullet">▸</span> Up to 4 points per match (1 per game + series)</li>
          <li><span className="info-bullet">▸</span> Substitute bowlers allowed with advance notice</li>
        </ul>
      </div>

      <div className="info-card">
        <h3 className="info-card-title">League Obligations</h3>
        <ul className="info-list">
          <li><span className="info-bullet">▸</span> Attend weekly or arrange a qualified substitute</li>
          <li><span className="info-bullet">▸</span> Maintain a minimum number of games bowled to establish an average</li>
          <li><span className="info-bullet">▸</span> Absent bowlers are scored at 2/3 of their entering average</li>
          <li><span className="info-bullet">▸</span> Team captains are responsible for lineup submission</li>
          <li><span className="info-bullet">▸</span> All bowlers must conduct themselves in a respectful, sportsmanlike manner</li>
          <li><span className="info-bullet">▸</span> Disputes are resolved by league officers; their decision is final</li>
        </ul>
      </div>

      <div className="info-card info-card-dues">
        <h3 className="info-card-title">Dues &amp; Fees</h3>
        <ul className="info-list">
          <li><span className="info-bullet">▸</span> Weekly lineage fee collected each session</li>
          <li><span className="info-bullet">▸</span> Prize fund contribution included in weekly fee</li>
          <li><span className="info-bullet">▸</span> End-of-season banquet fee assessed separately</li>
        </ul>
        <p className="dues-disclaimer">
          ⚠ League dues, lineage, and all associated fees are subject to change
          for the upcoming season. Final amounts will be communicated before the
          season kick-off meeting.
        </p>
      </div>
    </div>
  )
}

export default LeagueFormatInfo
