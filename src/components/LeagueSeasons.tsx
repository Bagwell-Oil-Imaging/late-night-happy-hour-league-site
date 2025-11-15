import { useState } from 'react'
import seasonsData from '../data/seasons.json'
import type { Season } from '../types'
import './LeagueSeasons.css'

function LeagueSeasons() {
  const seasons = seasonsData as Season[]
  const [selectedYear, setSelectedYear] = useState(seasons[0].year)

  const currentSeason = seasons.find(s => s.year === selectedYear)

  return (
    <div className="league-seasons-container" id="seasons">
      <h2 className="section-title">League Seasons</h2>

      <div className="season-selector">
        {seasons.map((season) => (
          <button
            key={season.year}
            className={`season-button ${selectedYear === season.year ? 'active' : ''}`}
            onClick={() => setSelectedYear(season.year)}
          >
            {season.year}
          </button>
        ))}
      </div>

      {currentSeason && (
        <div className="season-details">
          <div className="season-header">
            <h3 className="season-year">{currentSeason.year} Season</h3>
            <div className="season-info">
              <span className="season-dates">
                {new Date(currentSeason.startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} - {new Date(currentSeason.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
              <span className="champion-badge">
                🏆 Champion: {currentSeason.champion}
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
                  <tr key={team.id} className={index < 3 ? 'top-three' : ''}>
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
