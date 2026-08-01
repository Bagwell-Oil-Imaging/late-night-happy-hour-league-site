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
          <li><span className="info-bullet">▸</span> USBC-sanctioned league — 4 bowlers per team</li>
          <li><span className="info-bullet">▸</span> Thursday nights, weekly — practice at 7:50 PM, league play starts 8:00 PM</li>
          <li><span className="info-bullet">▸</span> Season runs September – May, split into two 16-week halves</li>
          <li><span className="info-bullet">▸</span> Top 8 teams each half make the playoffs; half winners bowl for the league championship</li>
          <li><span className="info-bullet">▸</span> 3-game series each week</li>
          <li><span className="info-bullet">▸</span> Individual handicap scoring is based on each bowler's current weekly rolling average</li>
          <li><span className="info-bullet">▸</span> Up to 4 points per match (1 per game + series)</li>
          <li><span className="info-bullet">▸</span> Substitute bowlers allowed with advance notice</li>
          <li><span className="info-bullet">▸</span> Pre-bowling is allowed, but must be scheduled with the house ahead of time</li>
        </ul>
      </div>

      <div className="info-card">
        <h3 className="info-card-title">League Obligations</h3>
        <ul className="info-list">
          <li><span className="info-bullet">▸</span> Week 1 kickoff meeting at 7:30 PM</li>
          <li><span className="info-bullet">▸</span> Attend weekly or arrange a qualified substitute</li>
          <li><span className="info-bullet">▸</span> Entering average: last season's league average, or your Week 1 average if you're new — becomes a rolling average once you've bowled 9 games</li>
          <li><span className="info-bullet">▸</span> Maintain a minimum number of games bowled to establish an average</li>
          <li><span className="info-bullet">▸</span> Absent (blind) bowlers are scored at 90% of their rolling average</li>
          <li><span className="info-bullet">▸</span> Team captains are responsible for lineup submission</li>
          <li><span className="info-bullet">▸</span> All bowlers must conduct themselves in a respectful, sportsmanlike manner</li>
          <li><span className="info-bullet">▸</span> Disputes are resolved by league officers; their decision is final</li>
        </ul>
      </div>

      <div className="info-card info-card-dues">
        <h3 className="info-card-title">Dues &amp; Fees</h3>
        <ul className="info-list">
          <li><span className="info-bullet">▸</span> $25 per week, covering lineage and prize fund contribution</li>
          <li><span className="info-bullet">▸</span> Payouts awarded per point won, plus team and individual achievement awards</li>
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
