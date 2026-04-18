/**
 * @file TeamsPage.tsx
 * @component TeamsPage
 *
 * Displays a per-team record and weekly results summary. The user selects a
 * team via the pill selector; the view then shows each completed matchup with
 * game totals and handicap breakdown.
 *
 * Data is sourced exclusively from Firestore via `useTeams` and
 * `useMatchupDetails`. The legacy per-bowler breakdown has been removed
 * because individual bowler scores are now stored in the separate
 * `BowlerScore` collection rather than embedded in `MatchupDetail`.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTeams, useMatchupDetails } from '../hooks'
import '../components/MatchupDetailModal.css'
import './TeamsPage.css'

/**
 * TeamsPage component.
 *
 * @returns Full teams page JSX including team selector, record bar, and
 *   per-week results cards. Returns a loading placeholder while Firestore
 *   data is in flight.
 */
function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Fetch all teams and all matchup details for the current season
  const { data: teams, loading: teamsLoading } = useTeams('2025-2026')
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails('2025-2026')

  // Show loading state while either dataset is still fetching
  if (teamsLoading || detailsLoading) {
    return <div className="loading">Loading teams…</div>
  }

  // Sort teams by points descending for the pill selector order
  const sortedTeams = useMemo(() =>
    [...teams].sort((a, b) => b.points - a.points),
    [teams]
  )

  // Resolve the selected team from the URL query param, defaulting to first
  const teamIdParam = searchParams.get('team')
  const selectedTeamId = teamIdParam ?? sortedTeams[0]?.leaguePalsId
  const selectedTeam = teams.find(t => t.leaguePalsId === selectedTeamId)

  // Filter matchup details where the selected team participated, sorted by week
  const teamMatchups = useMemo(() =>
    matchupDetails
      .filter(m =>
        m.team1.teamId === selectedTeamId ||
        m.team2.teamId === selectedTeamId
      )
      .sort((a, b) => a.week - b.week),
    [matchupDetails, selectedTeamId]
  )

  /** Updates the URL query param to switch the active team selection. */
  const selectTeam = (id: string) => setSearchParams({ team: id })

  /**
   * Formats a date string for display (e.g. "Jan 5").
   *
   * @param dateString - ISO date string, e.g. "2025-01-05"
   * @returns Short month+day string
   */
  const formatDate = (dateString: string): string => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="teams-page">
      <h2 className="section-title">Teams</h2>

      {/* Team pill selector — ordered by standings */}
      <div className="team-selector-scroll">
        <div className="team-pills">
          {sortedTeams.map(team => (
            <button
              key={team.leaguePalsId}
              className={`team-pill ${team.leaguePalsId === selectedTeamId ? 'active' : ''}`}
              onClick={() => selectTeam(team.leaguePalsId)}
            >
              {team.name}
            </button>
          ))}
        </div>
      </div>

      {selectedTeam && (
        <div className="team-content">
          {/* W–L–T record bar with points badge */}
          <div className="team-record-bar">
            <div className="team-record-name">{selectedTeam.name}</div>
            <div className="team-record-stats">
              <div className="record-item">
                <span className="record-value wins">{selectedTeam.wins}</span>
                <span className="record-label">W</span>
              </div>
              <span className="record-sep">–</span>
              <div className="record-item">
                <span className="record-value losses">{selectedTeam.losses}</span>
                <span className="record-label">L</span>
              </div>
              <span className="record-sep">–</span>
              <div className="record-item">
                <span className="record-value">{selectedTeam.ties}</span>
                <span className="record-label">T</span>
              </div>
              <div className="record-points-badge">
                <span className="record-pts-value">{selectedTeam.points}</span>
                <span className="record-pts-label">pts</span>
              </div>
            </div>
          </div>

          {/* Per-week matchup cards */}
          <div className="team-weeks-list">
            {teamMatchups.length === 0 ? (
              <p className="no-data">No match data available yet.</p>
            ) : (
              teamMatchups.map(match => {
                // Determine which side of the matchup this team is on
                const isTeam1 = match.team1.teamId === selectedTeamId
                const myTeam = isTeam1 ? match.team1 : match.team2
                const oppTeam = isTeam1 ? match.team2 : match.team1
                const won = myTeam.totalSeries > oppTeam.totalSeries
                const lost = myTeam.totalSeries < oppTeam.totalSeries

                return (
                  <div key={match.id} className={`team-week-card ${won ? 'won' : lost ? 'lost' : 'tied'}`}>
                    <div className="team-week-header">
                      <div className="week-meta">
                        <span className="week-badge">Wk {match.week}</span>
                        <span className="week-date-label">{formatDate(match.date)}</span>
                        <span className="week-lane-label">Lane {myTeam.lane}</span>
                      </div>
                      <div className="week-result">
                        <span className="opp-name">vs {oppTeam.teamName}</span>
                        <span className={`result-chip ${won ? 'win' : lost ? 'loss' : 'tie'}`}>
                          {won ? 'WIN' : lost ? 'LOSS' : 'TIE'}
                        </span>
                        <span className="score-line">
                          {myTeam.totalSeries} – {oppTeam.totalSeries}
                        </span>
                      </div>
                    </div>

                    {/* Game-by-game team totals — individual bowler rows are in the
                        BowlerScore collection and displayed on the Bowlers page */}
                    <div className="scores-table-wrapper">
                      <table className="matchup-scores-table">
                        <thead>
                          <tr>
                            <th className="col-name"></th>
                            <th className="col-game">G1</th>
                            <th className="col-game">G2</th>
                            <th className="col-game">G3</th>
                            <th className="col-series">Series</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Scratch team totals — game1Total/game2Total/game3Total (new schema) */}
                          <tr className="totals-row scratch-row">
                            <td className="col-name">Scratch</td>
                            <td className="col-game">{myTeam.game1Total}</td>
                            <td className="col-game">{myTeam.game2Total}</td>
                            <td className="col-game">{myTeam.game3Total}</td>
                            <td className="col-series">{myTeam.scratchSeries}</td>
                          </tr>
                          <tr className="totals-row handicap-row">
                            <td className="col-name">Handicap</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-game">+{myTeam.handicapPerGame}</td>
                            <td className="col-series">+{myTeam.handicapSeries}</td>
                          </tr>
                          <tr className={`totals-row grand-total-row ${won ? 'winner' : ''}`}>
                            <td className="col-name">Total</td>
                            <td className="col-game">{myTeam.game1Total + myTeam.handicapPerGame}</td>
                            <td className="col-game">{myTeam.game2Total + myTeam.handicapPerGame}</td>
                            <td className="col-game">{myTeam.game3Total + myTeam.handicapPerGame}</td>
                            <td className="col-series">{myTeam.totalSeries}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamsPage
