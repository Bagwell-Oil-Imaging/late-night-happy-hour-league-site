/**
 * @file SeasonScores.tsx
 * @module components
 *
 * Displays completed matchup results grouped by week for the current season.
 * Reads matchup data from Firestore via `useMatchups`. Scores that are null
 * (bowler was blinded or absent) render as "-" rather than "0".
 *
 * Props:
 *  onSelectMatch – optional callback; when provided each row becomes clickable
 *                  and fires with the Firestore document ID of the matchup
 */

import { useMatchups, useTeams } from '../hooks'
import type { Matchup } from '../types'
import './SeasonScores.css'

/** Season year constant — update when the season rolls over */
const SEASON_YEAR = '2025-2026'

interface SeasonScoresProps {
  /** Optional click handler; called with the Firestore matchup document ID */
  onSelectMatch?: (matchId: string) => void
}

/**
 * SeasonScores — weekly scorecard table for all completed matchups.
 *
 * @param onSelectMatch - Optional row-click callback receiving the matchup ID
 */
function SeasonScores({ onSelectMatch }: SeasonScoresProps) {
  // Firestore subscriptions — both scoped to the current season
  const { data: matchups, loading: matchupsLoading } = useMatchups(SEASON_YEAR)
  const { data: teams, loading: teamsLoading } = useTeams(SEASON_YEAR)

  const loading = matchupsLoading || teamsLoading

  // Show loading skeleton while Firestore data arrives
  if (loading) {
    return (
      <div className="season-scores-container" id="scores">
        <h2 className="section-title">Season Scores</h2>
        <p className="loading-message">Loading scores…</p>
      </div>
    )
  }

  /** Only show matchups that have been played */
  const seasonMatches = [...matchups]
    .filter(m => m.completed)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  /**
   * Look up a team by its Firestore document ID (stored as `id` on the Team
   * document after the generic hook attaches it).
   */
  const getTeamById = (teamId: string) => teams.find(t => t.id === teamId)

  /** Format ISO date string to "Mon DD, YYYY" */
  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

  /**
   * Determine which team won based on scratch scores.
   * Returns null when either score is unavailable (e.g. in-progress week).
   */
  const getWinnerId = (matchup: Matchup): string | null => {
    if (
      matchup.team1ScratchScore === null ||
      matchup.team2ScratchScore === null
    )
      return null
    if (matchup.team1ScratchScore > matchup.team2ScratchScore)
      return matchup.team1Id
    if (matchup.team2ScratchScore > matchup.team1ScratchScore)
      return matchup.team2Id
    return null // tie
  }

  /**
   * Render a score value: null scores display as "-" (blinded bowler) instead
   * of "0" which would mislead the reader about actual performance.
   */
  const renderScore = (score: number | null): string =>
    score === null ? '-' : String(score)

  // Group completed matches by week number for section headers
  const groupedMatches = seasonMatches.reduce(
    (acc, match) => {
      if (!acc[match.week]) acc[match.week] = []
      acc[match.week].push(match)
      return acc
    },
    {} as Record<number, Matchup[]>
  )

  return (
    <div className="season-scores-container" id="scores">
      <h2 className="section-title">Season Scores</h2>

      {Object.entries(groupedMatches)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([week, weekMatches]) => (
          <div key={week} className="week-section">
            <h3 className="week-title">
              Week {week} — {formatDate(weekMatches[0].date)}
            </h3>

            <div className="scores-table-wrapper">
              <table className="scores-table">
                <thead>
                  <tr>
                    <th>Team 1</th>
                    <th className="center">Score</th>
                    <th className="center"></th>
                    <th className="center">Score</th>
                    <th>Team 2</th>
                  </tr>
                </thead>
                <tbody>
                  {weekMatches.map(match => {
                    const team1 = getTeamById(match.team1Id)
                    const team2 = getTeamById(match.team2Id)
                    const winnerId = getWinnerId(match)
                    const clickable = !!onSelectMatch

                    return (
                      <tr
                        key={match.id}
                        className={clickable ? 'clickable-row' : ''}
                        onClick={
                          clickable && match.id
                            ? () => onSelectMatch(match.id!)
                            : undefined
                        }
                        title={clickable ? 'View match details' : undefined}
                      >
                        <td
                          className={`team-name ${winnerId === match.team1Id ? 'winner' : ''}`}
                        >
                          {team1?.name ?? match.team1Id}
                        </td>
                        <td
                          className={`center score ${winnerId === match.team1Id ? 'winner' : ''}`}
                        >
                          {renderScore(match.team1ScratchScore)}
                        </td>
                        <td className="center divider">-</td>
                        <td
                          className={`center score ${winnerId === match.team2Id ? 'winner' : ''}`}
                        >
                          {renderScore(match.team2ScratchScore)}
                        </td>
                        <td
                          className={`team-name ${winnerId === match.team2Id ? 'winner' : ''}`}
                        >
                          {team2?.name ?? match.team2Id}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {/* Empty state when no completed matches exist yet */}
      {Object.keys(groupedMatches).length === 0 && (
        <p className="empty-message">No completed matches yet this season.</p>
      )}
    </div>
  )
}

export default SeasonScores
