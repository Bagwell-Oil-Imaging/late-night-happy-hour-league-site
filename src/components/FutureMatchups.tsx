/**
 * @file FutureMatchups.tsx
 * @module components
 *
 * Displays upcoming (not yet completed) matchups grouped by week.
 * Reads matchup and team data from Firestore via `useMatchups` / `useTeams`.
 * Only matchups where `completed === false` are shown.
 */

import { useMatchups, useTeams } from '../hooks'
import type { Matchup } from '../types'
import './FutureMatchups.css'

/** Season year constant — update when the season rolls over */
const SEASON_YEAR = '2025-2026'

/**
 * FutureMatchups — week-grouped table of all unplayed matchups.
 *
 * Shows each team's current win/loss record so members can see the
 * competitive landscape before bowling.
 */
function FutureMatchups() {
  // Firestore subscriptions — scoped to the current season
  const { data: matchups, loading: matchupsLoading } = useMatchups(SEASON_YEAR)
  const { data: teams, loading: teamsLoading } = useTeams(SEASON_YEAR)

  const loading = matchupsLoading || teamsLoading

  // Render loading state while Firestore data arrives
  if (loading) {
    return (
      <div className="future-matchups-container" id="schedule">
        <h2 className="section-title">Future Matchups</h2>
        <p className="loading-message">Loading matchups…</p>
      </div>
    )
  }

  /** Filter to only unplayed matchups */
  const futureMatchups = matchups.filter(m => !m.completed)

  /**
   * Look up a team by its Firestore document ID (the `id` field is attached
   * by the generic useCollection hook after reading from Firestore).
   */
  const getTeamById = (teamId: string) => teams.find(t => t.id === teamId)

  /** Format ISO date string to "Mon DD" (no year for compact display) */
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })

  // Group upcoming matchups by week number for section headers
  const groupedMatchups = futureMatchups.reduce(
    (acc, matchup) => {
      if (!acc[matchup.week]) acc[matchup.week] = []
      acc[matchup.week].push(matchup)
      return acc
    },
    {} as Record<number, Matchup[]>
  )

  return (
    <div className="future-matchups-container" id="schedule">
      <h2 className="section-title">Future Matchups</h2>

      {Object.entries(groupedMatchups).map(([week, weekMatchups]) => (
        <div key={week} className="week-section">
          <h3 className="week-title">
            Week {week} — {formatDate(weekMatchups[0].date)}
          </h3>

          <div className="matchups-table-wrapper">
            <table className="matchups-table">
              <thead>
                <tr>
                  <th>Team 1</th>
                  <th className="center">Record</th>
                  <th className="center">VS</th>
                  <th className="center">Record</th>
                  <th>Team 2</th>
                </tr>
              </thead>
              <tbody>
                {weekMatchups.map(matchup => {
                  const team1 = getTeamById(matchup.team1Id)
                  const team2 = getTeamById(matchup.team2Id)

                  return (
                    <tr key={matchup.id}>
                      <td className="team-name">
                        {team1?.name ?? matchup.team1Id}
                      </td>
                      <td className="center team-record">
                        {team1 ? `${team1.wins}-${team1.losses}` : '—'}
                      </td>
                      <td className="center vs-cell">vs</td>
                      <td className="center team-record">
                        {team2 ? `${team2.wins}-${team2.losses}` : '—'}
                      </td>
                      <td className="team-name">
                        {team2?.name ?? matchup.team2Id}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Empty state when all matchups are completed */}
      {Object.keys(groupedMatchups).length === 0 && (
        <p className="empty-message">No upcoming matchups scheduled.</p>
      )}
    </div>
  )
}

export default FutureMatchups
