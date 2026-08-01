/**
 * @file HistoryPage.tsx
 * @module pages
 *
 * League history page — shows all past seasons as collapsible cards, each
 * containing the final standings table for that season.
 *
 * Data source: Firestore `seasons` collection via `useSeasons`.
 * Schema notes:
 *  - `season.championTeamName` replaces the removed `season.champion` field
 *  - `team.teamId` replaces `team.id` on the SeasonTeam sub-object
 */

import { useState } from 'react'
import { useSeasons } from '../hooks'
import './HistoryPage.css'

/**
 * HistoryPage — accordion list of every season on record.
 *
 * The most recent season card is expanded by default (once Firestore data
 * loads). `useSeasons` returns seasons sorted year desc, so index 0 is the
 * latest season.
 */
function HistoryPage() {
  // Firestore subscription — seasons sorted year desc.
  // A season staged in advance via the admin "Create Season" control has no
  // teams/standings yet — exclude it so "history" never shows an unplayed season.
  const { data: allSeasons, loading } = useSeasons()
  const seasons = allSeasons.filter((season) => season.teams.length > 0)

  // Track which season card is expanded; null = all collapsed
  const [expandedSeason, setExpandedSeason] = useState<string | null>(null)

  /** Format ISO date string to "Month YYYY" for season header display */
  const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  /** Toggle a season card open/closed */
  const toggleSeason = (year: string) => {
    setExpandedSeason(prev => (prev === year ? null : year))
  }

  // Show loading state while Firestore data arrives
  if (loading) {
    return (
      <div className="history-page">
        <h2 className="section-title">League History</h2>
        <p className="loading-message">Loading history…</p>
      </div>
    )
  }

  // Auto-expand the most recent season on first render if none is selected yet
  // We resolve this inline so no effect / extra state is needed
  const defaultExpanded = seasons.length > 0 ? seasons[0].year : null
  const activeExpanded = expandedSeason ?? defaultExpanded

  return (
    <div className="history-page">
      <h2 className="section-title">League History</h2>
      <p className="history-subtitle">
        {seasons.length} season{seasons.length !== 1 ? 's' : ''} on record
      </p>

      <div className="seasons-list">
        {seasons.map(season => {
          const isExpanded = activeExpanded === season.year
          // Sort teams by points desc for standings display
          const sortedTeams = [...season.teams].sort(
            (a, b) => b.points - a.points
          )

          return (
            <div
              key={season.year}
              className={`season-card ${isExpanded ? 'expanded' : ''}`}
            >
              <button
                className="season-card-header"
                onClick={() => toggleSeason(season.year)}
                aria-expanded={isExpanded}
              >
                <div className="season-identity">
                  <span className="season-year">{season.year}</span>
                  <span className="season-dates">
                    {formatDate(season.startDate)} –{' '}
                    {formatDate(season.endDate)}
                  </span>
                </div>

                {/* championTeamName replaces old free-text champion field */}
                <div className="season-champion-preview">
                  {season.championTeamName && (
                    <>
                      <span className="champion-label">Champion</span>
                      <span className="champion-name">
                        {season.championTeamName}
                      </span>
                    </>
                  )}
                </div>

                <span className={`season-chevron ${isExpanded ? 'open' : ''}`}>
                  ▾
                </span>
              </button>

              {isExpanded && (
                <div className="season-card-body">
                  <div className="season-standings-wrapper">
                    <table className="season-table">
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
                        {sortedTeams.map((team, idx) => (
                          // SeasonTeam uses teamId (not id) as the stable key
                          <tr
                            key={team.teamId}
                            className={idx === 0 ? 'champion-row' : ''}
                          >
                            <td className="rank">
                              {idx === 0 ? '🏆' : idx + 1}
                            </td>
                            <td
                              className={`team-name ${idx === 0 ? 'champion-name-cell' : ''}`}
                            >
                              {team.name}
                            </td>
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
        })}
      </div>
    </div>
  )
}

export default HistoryPage
