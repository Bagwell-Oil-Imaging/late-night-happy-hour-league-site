/**
 * @file MatchupsPage.tsx
 * @component MatchupsPage
 *
 * Scoreboard page showing team-vs-team matchup results for each week of the
 * season. The user navigates weeks via the WeekSelector; clicking a row opens
 * MatchupDetailModal for the full team breakdown.
 *
 * Data is sourced entirely from Firestore:
 *  - `useMatchupDetails` — team aggregate scores (replaces weeklyMatchupDetails.json)
 *  - `useMatchups`       — lightweight matchup records used only for week-range
 *                          detection (replaces historicalMatches.json)
 *
 * Field renames from the pre-migration schema:
 *  - `gameTotals.g1/g2/g3` → `game1Total/game2Total/game3Total` (TeamSummary)
 */

import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import WeekSelector from '../components/WeekSelector'
import MatchupDetailModal from '../components/MatchupDetailModal'
import BowlerProfileModal from '../components/BowlerProfileModal'
import { useMatchups, useMatchupDetails } from '../hooks'
import type { MatchupDetail } from '../types'
import './MatchupsPage.css'

/**
 * Determines how many points a team scored in a single game/series comparison.
 *
 * @param myScore  - This team's score for the game
 * @param oppScore - Opponent's score for the same game
 * @returns 1 for a win, 0.5 for a tie, 0 for a loss
 */
function calcPoints(myScore: number, oppScore: number): number {
  if (myScore > oppScore) return 1
  if (myScore === oppScore) return 0.5
  return 0
}

/**
 * Calculates the 4-point breakdown (3 games + series) for both teams in a
 * matchup. Uses handicap-adjusted per-game totals.
 *
 * @param detail - Full MatchupDetail with team1/team2 aggregates
 * @returns Object containing team1 and team2 point totals (sum is always 4)
 */
function getMatchPoints(detail: MatchupDetail): { team1: number; team2: number } {
  const t1hcp = detail.team1.handicapPerGame
  const t2hcp = detail.team2.handicapPerGame

  // game1Total/game2Total/game3Total replace the old gameTotals.g1/g2/g3 fields
  const t1g1 = detail.team1.game1Total + t1hcp
  const t2g1 = detail.team2.game1Total + t2hcp
  const t1g2 = detail.team1.game2Total + t1hcp
  const t2g2 = detail.team2.game2Total + t2hcp
  const t1g3 = detail.team1.game3Total + t1hcp
  const t2g3 = detail.team2.game3Total + t2hcp

  const t1 =
    calcPoints(t1g1, t2g1) +
    calcPoints(t1g2, t2g2) +
    calcPoints(t1g3, t2g3) +
    calcPoints(detail.team1.totalSeries, detail.team2.totalSeries)

  return { team1: t1, team2: 4 - t1 }
}

/**
 * MatchupsPage component.
 *
 * @returns Full matchups page JSX with week selector, scoreboard table, and
 *   detail/bowler modals. Returns a loading placeholder while Firestore data
 *   is in flight.
 */
function MatchupsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)

  // Fetch lightweight matchup records to determine the latest completed week
  const { data: matchups, loading: matchupsLoading } = useMatchups('2025-2026')

  // Fetch full team-aggregate detail records for scoreboard display
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails('2025-2026')

  const loading = matchupsLoading || detailsLoading

  // Determine the highest week that has been completed to default the selector
  // These useMemo calls must stay above any early return to satisfy Rules of Hooks
  const completedMatches = useMemo(() => matchups.filter(m => m.completed), [matchups])
  const latestWeek = useMemo(() =>
    completedMatches.length ? Math.max(...completedMatches.map(m => m.week)) : 1,
    [completedMatches]
  )

  const currentWeek = parseInt(searchParams.get('week') ?? String(latestWeek), 10)
  const setWeek = (week: number) => setSearchParams({ week: String(week) })

  // Filter matchup details to only the selected week
  const weekMatchups = useMemo(() =>
    matchupDetails.filter(m => m.week === currentWeek),
    [matchupDetails, currentWeek]
  )

  const weekDate = weekMatchups[0]?.date

  // Build the week list for the jump selector from available detail records
  const weekList = useMemo(() => {
    const seen = new Map<number, string>()
    for (const m of matchupDetails) {
      if (!seen.has(m.week)) seen.set(m.week, m.date)
    }
    return Array.from(seen.entries())
      .map(([week, date]) => ({ week, date }))
      .sort((a, b) => a.week - b.week)
  }, [matchupDetails])

  if (loading) return <div className="loading">Loading matchups…</div>

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
                    // Firestore document ID is now a string — matches MatchupDetailModal's prop type
                    onClick={() => setSelectedMatchupId(match.id ?? null)}
                    title="Click for full bowler breakdown"
                  >
                    <td className={`col-team-left team-cell ${t1Won ? 'winner' : ''}`}>
                      {match.team1.teamName}
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
                      {match.team2.teamName}
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
