import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavCard from '../components/NavCard'
import LeagueStandings from '../components/LeagueStandings'
import AwardLeaders from '../components/AwardLeaders'
import MatchupDetailModal from '../components/MatchupDetailModal'
import BowlerProfileModal from '../components/BowlerProfileModal'
import historicalData from '../data/historicalMatches.json'
import matchupDetailsData from '../data/weeklyMatchupDetails.json'
import teamsData from '../data/teams.json'
import type { Matchup, MatchupDetail, Team } from '../types'
import './HomePage.css'
import './MatchupsPage.css'

function calcPoints(myScore: number, oppScore: number): number {
  if (myScore > oppScore) return 1
  if (myScore === oppScore) return 0.5
  return 0
}

function getMatchPoints(detail: MatchupDetail): { team1: number; team2: number } {
  const t1hcp = detail.team1.handicapPerGame
  const t2hcp = detail.team2.handicapPerGame
  const t1 =
    calcPoints(detail.team1.gameTotals.g1 + t1hcp, detail.team2.gameTotals.g1 + t2hcp) +
    calcPoints(detail.team1.gameTotals.g2 + t1hcp, detail.team2.gameTotals.g2 + t2hcp) +
    calcPoints(detail.team1.gameTotals.g3 + t1hcp, detail.team2.gameTotals.g3 + t2hcp) +
    calcPoints(detail.team1.totalSeries, detail.team2.totalSeries)
  return { team1: t1, team2: 4 - t1 }
}

function HomePage() {
  const matches = historicalData as Matchup[]
  const matchupDetails = matchupDetailsData as MatchupDetail[]
  const teams = teamsData as Team[]
  const navigate = useNavigate()

  // matchupId is a string (Firestore document ID) after the Firestore migration
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)

  const completedMatches = useMemo(() => matches.filter(m => m.completed), [matches])

  const latestWeek = useMemo(() => {
    if (!completedMatches.length) return 1
    return Math.max(...completedMatches.map(m => m.week))
  }, [completedMatches])

  const latestWeekDetails = useMemo(() =>
    matchupDetails.filter(m => m.week === latestWeek),
    [matchupDetails, latestWeek]
  )

  const latestDate = latestWeekDetails[0]?.date

  /* ── Week highlights — top 3 in each category ───────────────────────── */
  const highTeamSeriesHcp = useMemo(() =>
    latestWeekDetails
      .flatMap(m => [
        { name: m.team1.name, score: m.team1.totalSeries, scratch: m.team1.scratchSeries, hdcp: m.team1.handicapSeries },
        { name: m.team2.name, score: m.team2.totalSeries, scratch: m.team2.scratchSeries, hdcp: m.team2.handicapSeries },
      ])
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    [latestWeekDetails]
  )

  const highTeamSeriesScratch = useMemo(() =>
    latestWeekDetails
      .flatMap(m => [
        { name: m.team1.name, score: m.team1.scratchSeries },
        { name: m.team2.name, score: m.team2.scratchSeries },
      ])
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    [latestWeekDetails]
  )

  const highGameScratch = useMemo(() =>
    latestWeekDetails
      .flatMap(m => [
        ...m.team1.bowlers.flatMap(b => [
          { name: b.name, score: b.g1 },
          { name: b.name, score: b.g2 },
          { name: b.name, score: b.g3 },
        ]),
        ...m.team2.bowlers.flatMap(b => [
          { name: b.name, score: b.g1 },
          { name: b.name, score: b.g2 },
          { name: b.name, score: b.g3 },
        ]),
      ])
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    [latestWeekDetails]
  )

  const highSeriesScratch = useMemo(() =>
    latestWeekDetails
      .flatMap(m => [
        ...m.team1.bowlers.map(b => ({ name: b.name, score: b.series })),
        ...m.team2.bowlers.map(b => ({ name: b.name, score: b.series })),
      ])
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    [latestWeekDetails]
  )

  const leader = useMemo(() =>
    [...teams].sort((a, b) => b.points - a.points)[0],
    [teams]
  )

  const formatDate = (dateString: string) => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const handleSelectBowler = (id: string) => {
    setSelectedMatchupId(null)
    navigate(`/bowlers?id=${id}`)
  }

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
        {latestWeekDetails.length > 0 && (
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
                {latestWeekDetails.map(match => {
                  const pts = getMatchPoints(match)
                  const t1Won = match.team1.totalSeries > match.team2.totalSeries
                  const t2Won = match.team2.totalSeries > match.team1.totalSeries
                  return (
                    <tr
                      key={match.id}
                      className="matchup-row"
                      onClick={() => setSelectedMatchupId(match.id)}
                      title="Click for full bowler breakdown"
                    >
                      <td className={`col-team-left team-cell ${t1Won ? 'winner' : ''}`}>{match.team1.name}</td>
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
                      <td className={`col-team-right team-cell ${t2Won ? 'winner' : ''}`}>{match.team2.name}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Week Highlights */}
        {latestWeekDetails.length > 0 && (
          <div className="week-highlights">
            {([
              { title: 'High Team Series (Scratch)', entries: highTeamSeriesScratch },
              { title: 'High Game (Scratch)',        entries: highGameScratch },
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
                      <span className="highlight-breakdown">({entry.scratch} + {entry.hdcp} HDCP)</span>
                      <span className="highlight-breakdown-sep"> | </span>
                      {entry.score}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="highlight-card">
              <h4 className="highlight-title">High Series (Scratch)</h4>
              <ol className="highlight-list">
                {highSeriesScratch.map((entry, i) => (
                  <li key={i} className="highlight-entry">
                    <span className="highlight-rank">{i + 1}</span>
                    <span className="highlight-name">{entry.name}</span>
                    <span className="highlight-score">{entry.score}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </section>

      {/* Compact Nav Cards */}
      <div className="nav-cards-grid">
        <NavCard to="/standings" icon="🏆" title="Standings" description="" stat={leader?.name} statLabel="Leading" />
        <NavCard to="/matchups" icon="🎳" title="Matchups" description="" stat={`Wk ${latestWeek}`} statLabel="Latest" />
        <NavCard to="/teams"    icon="👥" title="Teams"    description="" />
        <NavCard to="/bowlers"  icon="🎯" title="Bowlers"  description="" />
        <NavCard to="/history"  icon="📜" title="History"  description="" />
      </div>

      {/* Standings */}
      <section className="home-section">
        <LeagueStandings />
        <AwardLeaders />
      </section>

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
