import { useState } from 'react'
import seasonsData from '../data/seasons.json'
import type { Season } from '../types'
import './HistoryPage.css'

function HistoryPage() {
  const seasons = seasonsData as Season[]
  const [expandedSeason, setExpandedSeason] = useState<string | null>(
    seasons.length > 0 ? seasons[seasons.length - 1].year : null
  )

  const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const toggleSeason = (year: string) => {
    setExpandedSeason(prev => prev === year ? null : year)
  }

  return (
    <div className="history-page">
      <h2 className="section-title">League History</h2>
      <p className="history-subtitle">
        {seasons.length} season{seasons.length !== 1 ? 's' : ''} on record
      </p>

      <div className="seasons-list">
        {[...seasons].reverse().map(season => {
          const isExpanded = expandedSeason === season.year
          const sortedTeams = [...season.teams].sort((a, b) => b.points - a.points)

          return (
            <div key={season.year} className={`season-card ${isExpanded ? 'expanded' : ''}`}>
              <button
                className="season-card-header"
                onClick={() => toggleSeason(season.year)}
                aria-expanded={isExpanded}
              >
                <div className="season-identity">
                  <span className="season-year">{season.year}</span>
                  <span className="season-dates">
                    {formatDate(season.startDate)} – {formatDate(season.endDate)}
                  </span>
                </div>
                <div className="season-champion-preview">
                  {season.champion && (
                    <>
                      <span className="champion-label">Champion</span>
                      <span className="champion-name">🏆 {season.champion}</span>
                    </>
                  )}
                </div>
                <span className={`season-chevron ${isExpanded ? 'open' : ''}`}>▾</span>
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
                          <tr key={team.id} className={idx === 0 ? 'champion-row' : ''}>
                            <td className="rank">
                              {idx === 0 ? '🏆' : idx + 1}
                            </td>
                            <td className={`team-name ${idx === 0 ? 'champion-name-cell' : ''}`}>
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
