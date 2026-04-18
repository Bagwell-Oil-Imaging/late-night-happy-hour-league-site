/**
 * @file LeagueStandings.tsx
 * @component LeagueStandings
 *
 * Renders the league standings table for the current season. Data is fetched
 * live from Firestore via the `useTeams` hook — no static JSON import.
 *
 * Teams arrive from Firestore already ordered by `points DESC` (enforced by
 * the hook's query constraint), but a client-side fallback sort on wins is
 * applied as a tiebreaker.
 *
 * @returns JSX standings table, a loading placeholder while data is in flight,
 *   or nothing when the teams array is empty.
 */

import { useTeams } from '../hooks'
import './LeagueStandings.css'

function LeagueStandings() {
  // Fetch all teams for the 2025-2026 season from Firestore, sorted by points desc
  const { data: teams, loading } = useTeams('2025-2026')

  // Show a simple placeholder while the Firestore subscription initialises
  if (loading) return <div className="loading">Loading standings…</div>

  // Client-side tiebreaker: when two teams share the same points total, rank
  // the team with more wins higher. Firestore ordering only handles the primary sort.
  const sorted = [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return b.wins - a.wins
  })

  /**
   * Calculates win percentage as a formatted string (one decimal place).
   *
   * @param wins   - Number of wins
   * @param losses - Number of losses
   * @returns Percentage string, e.g. "75.0", or "0" when no games played
   */
  const getWinPercentage = (wins: number, losses: number): string => {
    const total = wins + losses
    if (total === 0) return '0'
    return ((wins / total) * 100).toFixed(1)
  }

  return (
    <div className="standings-container" id="standings">
      <h2 className="section-title">League Standings</h2>
      <div className="standings-table-wrapper">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Captain</th>
              <th className="center">W</th>
              <th className="center">L</th>
              <th className="center">Win %</th>
              <th className="center">Points</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, index) => (
              <tr key={team.leaguePalsId} className={index < 3 ? 'top-three' : ''}>
                <td className="rank">
                  {index + 1}
                  {index === 0 && <span className="trophy">🏆</span>}
                </td>
                <td className="team-name">{team.name}</td>
                {/* captainName replaces the old `captain` field in the new schema */}
                <td>{team.captainName}</td>
                <td className="center wins">{team.wins}</td>
                <td className="center losses">{team.losses}</td>
                <td className="center">{getWinPercentage(team.wins, team.losses)}%</td>
                <td className="center points">{team.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default LeagueStandings
