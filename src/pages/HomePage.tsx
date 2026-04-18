/**
 * @file HomePage.tsx
 * @module pages/HomePage
 *
 * Main landing page for the Late Night Happy Hour Bowling League site.
 *
 * Displays the latest week's matchup results and team standings using data
 * fetched live from Firestore via domain hooks. All JSON imports have been
 * replaced with Firestore hooks following the Phase 4 migration.
 *
 * Sections:
 *  - Latest Week Recap — scoreboard table for the most recently completed week
 *  - Week Highlights   — top team series (scratch + handicap) from that week
 *  - Nav Cards         — quick links to Standings, Matchups, Teams, Bowlers, History
 *  - League Standings  — full standings table via LeagueStandings component
 *  - Award Leaders     — season award leaders via AwardLeaders component
 *
 * The active season year is read from LeagueConfig via useLeagueConfig once a
 * season is resolved, defaulting to '2025' for the initial render.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavCard from '../components/NavCard'
import LeagueStandings from '../components/LeagueStandings'
import AwardLeaders from '../components/AwardLeaders'
import MatchupDetailModal from '../components/MatchupDetailModal'
import BowlerProfileModal from '../components/BowlerProfileModal'
import { useMatchupDetails, useTeams } from '../hooks'
import type { MatchupDetail } from '../types'
import './HomePage.css'
import './MatchupsPage.css'

/** Season year used for all Firestore queries on this page */
const SEASON_YEAR = '2025'

// ---------------------------------------------------------------------------
// Point calculation helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the points earned for a single game or series comparison.
 * Win = 1 point, tie = 0.5 points, loss = 0 points.
 *
 * @param myScore  - Score for the team being evaluated
 * @param oppScore - Opponent's score for the same game/series
 * @returns Points earned: 1 | 0.5 | 0
 */
function calcPoints(myScore: number, oppScore: number): number {
  if (myScore > oppScore) return 1
  if (myScore === oppScore) return 0.5
  return 0
}

/**
 * Calculates the match points breakdown for both teams in a MatchupDetail.
 * Uses the Firestore schema fields: `game1Total`, `game2Total`, `game3Total`,
 * `totalSeries`, and `handicapPerGame`.
 *
 * @param detail - MatchupDetail document from Firestore
 * @returns Object with `team1` and `team2` point totals (max 4 points each)
 */
function getMatchPoints(detail: MatchupDetail): { team1: number; team2: number } {
  const t1hcp = detail.team1.handicapPerGame
  const t2hcp = detail.team2.handicapPerGame

  // One point per game (3 games) + one point for overall series
  const t1 =
    calcPoints(detail.team1.game1Total + t1hcp, detail.team2.game1Total + t2hcp) +
    calcPoints(detail.team1.game2Total + t1hcp, detail.team2.game2Total + t2hcp) +
    calcPoints(detail.team1.game3Total + t1hcp, detail.team2.game3Total + t2hcp) +
    calcPoints(detail.team1.totalSeries, detail.team2.totalSeries)

  return { team1: t1, team2: 4 - t1 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string into a long-form weekday + full date label.
 *
 * @param dateString - ISO date string (e.g. "2025-09-05")
 * @returns Formatted string like "Friday, September 5, 2025"
 */
function formatDate(dateString: string): string {
  const d = new Date(dateString + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * HomePage — main landing page component.
 *
 * Fetches all matchup details and teams for the current season from Firestore.
 * Derives the latest completed week from the matchup details and computes
 * week highlights (top team series) entirely in the client using `useMemo`.
 */
function HomePage() {
  const navigate = useNavigate()

  // Modal state — null means no modal is open
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)

  // Fetch all matchup details and teams for the season
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails(SEASON_YEAR)
  const { data: teams, loading: teamsLoading } = useTeams(SEASON_YEAR)

  // Derive the latest week number from available matchup details
  const latestWeek = useMemo(() => {
    if (!matchupDetails.length) return 1
    return Math.max(...matchupDetails.map((m) => m.week))
  }, [matchupDetails])

  // Filter to only the matchups from the most recently completed week
  const latestWeekDetails = useMemo(
    () => matchupDetails.filter((m) => m.week === latestWeek),
    [matchupDetails, latestWeek]
  )

  const latestDate = latestWeekDetails[0]?.date

  // ---------------------------------------------------------------------------
  // Week highlights — top 3 entries per category
  // Uses TeamSummary fields: scratchSeries, handicapSeries, totalSeries
  // ---------------------------------------------------------------------------

  /** Top 3 teams by handicap series for the latest week */
  const highTeamSeriesHcp = useMemo(
    () =>
      latestWeekDetails
        .flatMap((m) => [
          {
            name: m.team1.teamName,
            score: m.team1.totalSeries,
            scratch: m.team1.scratchSeries,
            hdcp: m.team1.handicapSeries,
          },
          {
            name: m.team2.teamName,
            score: m.team2.totalSeries,
            scratch: m.team2.scratchSeries,
            hdcp: m.team2.handicapSeries,
          },
        ])
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekDetails]
  )

  /** Top 3 teams by scratch series for the latest week */
  const highTeamSeriesScratch = useMemo(
    () =>
      latestWeekDetails
        .flatMap((m) => [
          { name: m.team1.teamName, score: m.team1.scratchSeries },
          { name: m.team2.teamName, score: m.team2.scratchSeries },
        ])
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekDetails]
  )

  // The current standings leader (highest points) for the NavCard stat
  const leader = useMemo(
    () => (teams.length ? [...teams].sort((a, b) => b.points - a.points)[0] : null),
    [teams]
  )

  const handleSelectBowler = (id: string) => {
    setSelectedMatchupId(null)
    navigate(`/bowlers?id=${id}`)
  }

  const isLoading = detailsLoading || teamsLoading

  return (
    <div className="home-page">

      {/* Latest Week Recap */}
      <section className="home-section">
        <div className="home-section-header">
          <h2 className="section-title">Week {latestWeek} Recap</h2>
          {latestDate && <span className="recap-date">{formatDate(latestDate)}</span>}
          <button
            className="recap-detail-link"
            onClick={() => navigate(`/matchups?week=${latestWeek}`)}
          >
            All Weeks →
          </button>
        </div>

        {/* Loading placeholder */}
        {isLoading && (
          <p style={{ color: '#888', textAlign: 'center' }}>Loading matchup data…</p>
        )}

        {/* Scoreboard table */}
        {!isLoading && latestWeekDetails.length > 0 && (
          <div className="matchup-scoreboard">
            <table className="matchup-table">
              <thead>
                <tr>
                  <th className="col-team-left">Team</th>
                  <th className="col-pts center">Pts</th>
                  <th className="col-score center">Total</th>
                  <th className="col-sep center"></th>
                  <th className="col-score center">Total</th>
                  <th className="col-pts center">Pts</th>
                  <th className="col-team-right">Team</th>
                </tr>
              </thead>
              <tbody>
                {latestWeekDetails.map((match) => {
                  const pts = getMatchPoints(match)
                  const t1Won = match.team1.totalSeries > match.team2.totalSeries
                  const t2Won = match.team2.totalSeries > match.team1.totalSeries
                  return (
                    <tr
                      key={match.id}
                      className="matchup-row"
                      onClick={() => setSelectedMatchupId(match.id ?? null)}
                      title="Click for full bowler breakdown"
                    >
                      <td className={`col-team-left team-cell ${t1Won ? 'winner' : ''}`}>
                        {match.team1.teamName}
                      </td>
                      <td className={`col-pts center pts-cell ${t1Won ? 'pts-winner' : ''}`}>
                        {pts.team1 % 1 === 0 ? pts.team1 : pts.team1.toFixed(1)}
                      </td>
                      <td className={`col-score center score-cell ${t1Won ? 'winner' : ''}`}>
                        <span title={`Scratch: ${match.team1.scratchSeries} + HDCP: ${match.team1.handicapSeries}`}>
                          {match.team1.totalSeries}
                        </span>
                        {match.team1.handicapSeries > 0 && (
                          <span
                            className="score-hcp"
                            title={`Scratch: ${match.team1.scratchSeries} + HDCP: ${match.team1.handicapSeries}`}
                          >
                            (+{match.team1.handicapSeries})
                          </span>
                        )}
                      </td>
                      <td className="col-sep center sep-cell">–</td>
                      <td className={`col-score center score-cell ${t2Won ? 'winner' : ''}`}>
                        <span title={`Scratch: ${match.team2.scratchSeries} + HDCP: ${match.team2.handicapSeries}`}>
                          {match.team2.totalSeries}
                        </span>
                        {match.team2.handicapSeries > 0 && (
                          <span
                            className="score-hcp"
                            title={`Scratch: ${match.team2.scratchSeries} + HDCP: ${match.team2.handicapSeries}`}
                          >
                            (+{match.team2.handicapSeries})
                          </span>
                        )}
                      </td>
                      <td className={`col-pts center pts-cell ${t2Won ? 'pts-winner' : ''}`}>
                        {pts.team2 % 1 === 0 ? pts.team2 : pts.team2.toFixed(1)}
                      </td>
                      <td className={`col-team-right team-cell ${t2Won ? 'winner' : ''}`}>
                        {match.team2.teamName}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Week Highlights — team-level aggregates only (individual bowler data is in MatchupDetailModal) */}
        {!isLoading && latestWeekDetails.length > 0 && (
          <div className="week-highlights">
            {([
              { title: 'High Team Series (Scratch)', entries: highTeamSeriesScratch },
            ] as const).map(({ title, entries }) => (
              <div key={title} className="highlight-card">
                <h4 className="highlight-title">{title}</h4>
                <ol className="highlight-list">
                  {entries.map((entry, i) => (
                    <li key={i} className="highlight-entry">
                      <span className="highlight-rank">{i + 1}</span>
                      <span className="highlight-name">{entry.name}</span>
                      <span className="highlight-score">{entry.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}

            <div className="highlight-card">
              <h4 className="highlight-title">High Team Series (Handicap)</h4>
              <ol className="highlight-list">
                {highTeamSeriesHcp.map((entry, i) => (
                  <li key={i} className="highlight-entry">
                    <span className="highlight-rank">{i + 1}</span>
                    <span className="highlight-name">{entry.name}</span>
                    <span className="highlight-score">
                      <span className="highlight-breakdown">
                        ({entry.scratch} + {entry.hdcp} HDCP)
                      </span>
                      <span className="highlight-breakdown-sep"> | </span>
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      {/* Compact Nav Cards */}
      <div className="nav-cards-grid">
        <NavCard
          to="/standings"
          icon="🏆"
          title="Standings"
          description=""
          stat={leader?.name}
          statLabel="Leading"
        />
        <NavCard
          to="/matchups"
          icon="🎳"
          title="Matchups"
          description=""
          stat={`Wk ${latestWeek}`}
          statLabel="Latest"
        />
        <NavCard to="/teams"   icon="👥" title="Teams"   description="" />
        <NavCard to="/bowlers" icon="🎯" title="Bowlers" description="" />
        <NavCard to="/history" icon="📜" title="History" description="" />
      </div>

      {/* Standings + Award Leaders */}
      <section className="home-section">
        <LeagueStandings />
        <AwardLeaders />
      </section>

      {/* Modals */}
      <MatchupDetailModal
        matchupId={selectedMatchupId}
        onClose={() => setSelectedMatchupId(null)}
        onSelectBowler={handleSelectBowler}
      />
      <BowlerProfileModal
        bowlerId={selectedBowlerId}
        onClose={() => setSelectedBowlerId(null)}
      />
    </div>
  )
}

export default HomePage
