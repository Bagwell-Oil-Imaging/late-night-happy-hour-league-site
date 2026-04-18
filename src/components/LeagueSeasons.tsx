/**
 * @file LeagueSeasons.tsx
 * @module components
 *
 * Displays a season selector and final standings table for the chosen season.
 * Reads all seasons from Firestore via `useSeasons`. Uses the new schema fields:
 *  - `season.championTeamName` (replaces the removed `season.champion` string)
 *  - `team.teamId` (replaces the removed `team.id` field on SeasonTeam)
 */

import { useState } from 'react'
import { useSeasons } from '../hooks'
import './LeagueSeasons.css'

/**
 * LeagueSeasons — tabbed season history viewer with final standings.
 *
 * Season buttons are generated from Firestore data; the most recent season
 * (index 0, because `useSeasons` sorts by year desc) is selected by default.
 */
function LeagueSeasons() {
  // Firestore subscription — sorted year desc so seasons[0] is the latest
  const { data: seasons, loading } = useSeasons()

  // Default to the first (most recent) season once data loads
  const [selectedYear, setSelectedYear] = useState<string | null>(null)

  // Show loading state while Firestore data arrives
  if (loading) {
    return (
      <div className="league-seasons-container" id="seasons">
        <h2 className="section-title">League Seasons</h2>
        <p className="loading-message">Loading seasons…</p>
      </div>
    )
  }

  // Nothing to show if Firestore has no seasons yet
  if (seasons.length === 0) {
    return (
      <div className="league-seasons-container" id="seasons">
        <h2 className="section-title">League Seasons</h2>
        <p className="empty-message">No seasons on record.</p>
      </div>
    )
  }

  // Resolve the active year: use state value or fall back to most recent season
  const activeYear = selectedYear ?? seasons[0].year
  const currentSeason = seasons.find(s => s.year === activeYear)

  return (
    <div className="league-seasons-container" id="seasons">
      <h2 className="section-title">League Seasons</h2>

      {/* Season selector tabs */}
      <div className="season-selector">
        {seasons.map(season => (
          <button
            key={season.year}
            className={`season-button ${activeYear === season.year ? 'active' : ''}`}
            onClick={() => setSelectedYear(season.year)}
          >
            {season.year}
          </button>
        ))}
      </div>

      {/* Season details panel */}
      {currentSeason && (
        <div className="season-details">
          <div className="season-header">
            <h3 className="season-year">{currentSeason.year} Season</h3>
            <div className="season-info">
              <span className="season-dates">
                {new Date(currentSeason.startDate).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                -{' '}
                {new Date(currentSeason.endDate).toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {/* championTeamName replaces the old free-text champion field;
                  falls back to "TBD" when the season is still in progress */}
              <span className="champion-badge">
                Champion:{' '}
                {currentSeason.championTeamName ?? 'TBD'}
              </span>
            </div>
          </div>

          <div className="standings-table-wrapper">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th className="center">W</th>
                  <th className="center">L</th>
                  <th className="center">Points</th>
                </tr>
              </thead>
              <tbody>
                {currentSeason.teams.map((team, index) => (
                  // SeasonTeam uses teamId (not id) as the stable identifier
                  <tr key={team.teamId} className={index < 3 ? 'top-three' : ''}>
                    <td className="rank">
                      {index + 1}
                      {index === 0 && ' 🏆'}
                      {index === 1 && ' 🥈'}
                      {index === 2 && ' 🥉'}
                    </td>
                    <td className="team-name">{team.name}</td>
                    <td className="center wins">{team.wins}</td>
                    <td className="center losses">{team.losses}</td>
                    <td className="center points">{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeagueSeasons
