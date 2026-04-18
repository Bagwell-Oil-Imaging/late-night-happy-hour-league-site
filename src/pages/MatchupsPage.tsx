import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import WeekSelector from '../components/WeekSelector'
import MatchupDetailModal from '../components/MatchupDetailModal'
import BowlerProfileModal from '../components/BowlerProfileModal'
import historicalData from '../data/historicalMatches.json'
import matchupDetailsData from '../data/weeklyMatchupDetails.json'
import type { Matchup, MatchupDetail } from '../types'
import './MatchupsPage.css'

function calcPoints(myScore: number, oppScore: number): number {
  if (myScore > oppScore) return 1
  if (myScore === oppScore) return 0.5
  return 0
}

function getMatchPoints(detail: MatchupDetail): { team1: number; team2: number } {
  const t1hcp = detail.team1.handicapPerGame
  const t2hcp = detail.team2.handicapPerGame
  const t1g1 = detail.team1.gameTotals.g1 + t1hcp
  const t2g1 = detail.team2.gameTotals.g1 + t2hcp
  const t1g2 = detail.team1.gameTotals.g2 + t1hcp
  const t2g2 = detail.team2.gameTotals.g2 + t2hcp
  const t1g3 = detail.team1.gameTotals.g3 + t1hcp
  const t2g3 = detail.team2.gameTotals.g3 + t2hcp

  const t1 =
    calcPoints(t1g1, t2g1) +
    calcPoints(t1g2, t2g2) +
    calcPoints(t1g3, t2g3) +
    calcPoints(detail.team1.totalSeries, detail.team2.totalSeries)

  return { team1: t1, team2: 4 - t1 }
}

function MatchupsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedMatchupId, setSelectedMatchupId] = useState<number | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)

  const matches = historicalData as Matchup[]
  const matchupDetails = matchupDetailsData as MatchupDetail[]

  const completedMatches = useMemo(() => matches.filter(m => m.completed), [matches])
  const latestWeek = useMemo(() =>
    completedMatches.length ? Math.max(...completedMatches.map(m => m.week)) : 1,
    [completedMatches]
  )

  const currentWeek = parseInt(searchParams.get('week') ?? String(latestWeek), 10)
  const setWeek = (week: number) => setSearchParams({ week: String(week) })

  const weekMatchups = useMemo(() =>
    matchupDetails.filter(m => m.week === currentWeek),
    [matchupDetails, currentWeek]
  )

  const weekDate = weekMatchups[0]?.date

  const weekList = useMemo(() => {
    const seen = new Map<number, string>()
    for (const m of matchupDetails) {
      if (!seen.has(m.week)) seen.set(m.week, m.date)
    }
    return Array.from(seen.entries())
      .map(([week, date]) => ({ week, date }))
      .sort((a, b) => a.week - b.week)
  }, [matchupDetails])

  const closeDetail = () => setSelectedMatchupId(null)
  const closeBowler = () => setSelectedBowlerId(null)

  const handleSelectBowler = (id: string) => {
    setSelectedMatchupId(null)
    navigate(`/bowlers?id=${id}`)
  }

  return (
    <div className="matchups-page">
      <h2 className="section-title">Matchups</h2>

      <WeekSelector
        week={currentWeek}
        minWeek={1}
        maxWeek={latestWeek}
        date={weekDate}
        weeks={weekList}
        onPrev={() => setWeek(currentWeek - 1)}
        onNext={() => setWeek(currentWeek + 1)}
        onJump={setWeek}
      />

      {weekMatchups.length === 0 ? (
        <p className="no-data">No matchup data for this week.</p>
      ) : (
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
              {weekMatchups.map(match => {
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
                    <td className={`col-team-left team-cell ${t1Won ? 'winner' : ''}`}>
                      {match.team1.name}
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
                      {match.team2.name}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <MatchupDetailModal
        matchupId={selectedMatchupId}
        onClose={closeDetail}
        onSelectBowler={handleSelectBowler}
      />
      <BowlerProfileModal
        bowlerId={selectedBowlerId}
        onClose={closeBowler}
      />
    </div>
  )
}

export default MatchupsPage
