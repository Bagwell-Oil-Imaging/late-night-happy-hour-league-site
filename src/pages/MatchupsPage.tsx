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
import StandingsPdfModal from '../components/StandingsPdfModal'
import PlayoffBracket, { FIRST_HALF, SECOND_HALF } from '../components/PlayoffBracket'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import { useLeagueConfig, useMatchups, useMatchupDetails, useScheduleWeeks } from '../hooks'
import { useSeasonStatus } from '../context/SeasonContext'
import { getStandingsPdfId } from '../utils/weeklyStandingsPdf'
import { visibleWeekNumbers } from '../utils/weekVisibility'
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
  // game1Total/game2Total/game3Total replace the old gameTotals.g1/g2/g3 fields
  const t1g1 = detail.team1.game1Total + detail.team1.handicapGame1
  const t2g1 = detail.team2.game1Total + detail.team2.handicapGame1
  const t1g2 = detail.team1.game2Total + detail.team1.handicapGame2
  const t2g2 = detail.team2.game2Total + detail.team2.handicapGame2
  const t1g3 = detail.team1.game3Total + detail.team1.handicapGame3
  const t2g3 = detail.team2.game3Total + detail.team2.handicapGame3

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
  const [pdfWeek, setPdfWeek] = useState<number | null>(null)
  const { seasonActive, loading: seasonStatusLoading } = useSeasonStatus()

  const seasonYear = '2025-2026'

  // Fetch lightweight matchup records to determine the latest completed week
  const { data: matchups, loading: matchupsLoading } = useMatchups(seasonYear)

  // Fetch full team-aggregate detail records for scoreboard display
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails(seasonYear)
  const { data: scheduleWeeks, loading: scheduleLoading } = useScheduleWeeks(seasonYear)
  const { data: leagueConfig, loading: configLoading } = useLeagueConfig(seasonYear)
  const visibleWeeks = useMemo(() => visibleWeekNumbers(scheduleWeeks), [scheduleWeeks])

  const loading = matchupsLoading || detailsLoading || scheduleLoading || configLoading

  // Determine the highest week that has been completed to default the selector
  // These useMemo calls must stay above any early return to satisfy Rules of Hooks
  const completedMatches = useMemo(() => matchups.filter(m => m.completed && visibleWeeks.has(m.week)), [matchups, visibleWeeks])
  const latestWeek = useMemo(() =>
    completedMatches.length ? Math.max(...completedMatches.map(m => m.week)) : 1,
    [completedMatches]
  )

  const currentWeek = parseInt(searchParams.get('week') ?? String(latestWeek), 10)
  const setWeek = (week: number) => setSearchParams({ week: String(week) })

  // Earliest week the public schedule actually exposes. When an entire half has
  // been hidden (e.g. corrupted first-half data), this jumps past it — but its
  // playoff bracket is still worth reaching, so the navigable floor is extended
  // back to that half's first playoff week rather than all the way to week 1.
  const earliestVisibleWeek = useMemo(() => visibleWeeks.size ? Math.min(...visibleWeeks) : 1, [visibleWeeks])
  const minWeek = useMemo(() => {
    if (earliestVisibleWeek <= 1) return 1
    const priorHalf = earliestVisibleWeek - 1 <= 16 ? FIRST_HALF : SECOND_HALF
    const bracketFloor = priorHalf.playoffWeeks[0]
    return bracketFloor < earliestVisibleWeek ? bracketFloor : earliestVisibleWeek
  }, [earliestVisibleWeek])

  // True once the user has paged back into that extended, hidden-but-bracket-only zone.
  const bracketOnly = currentWeek < earliestVisibleWeek && currentWeek >= minWeek
  const bracketOnlyHalf = currentWeek <= 16 ? FIRST_HALF : SECOND_HALF

  // Filter matchup details to only the selected week
  const weekMatchups = useMemo(() =>
    matchupDetails
      .filter(m => m.week === currentWeek && visibleWeeks.has(m.week))
      .sort((a, b) => a.team1.lane - b.team1.lane),
    [matchupDetails, currentWeek, visibleWeeks]
  )

  const weekDate = weekMatchups[0]?.date

  // Build the week list for the jump selector from available detail records, plus
  // the extended bracket-only weeks (still hidden from the public schedule, but
  // deliberately reachable — see minWeek above). Without those extra entries the
  // <select> silently falls back to a different option when the current week
  // isn't one of its choices.
  const weekList = useMemo(() => {
    const seen = new Map<number, string>()
    for (const m of matchupDetails) {
      if (visibleWeeks.has(m.week) && !seen.has(m.week)) seen.set(m.week, m.date)
    }
    for (let w = minWeek; w < earliestVisibleWeek; w++) {
      if (seen.has(w)) continue
      const date = matchupDetails.find(m => m.week === w)?.date ?? scheduleWeeks.find(sw => sw.week === w)?.date ?? ''
      seen.set(w, date)
    }
    return Array.from(seen.entries())
      .map(([week, date]) => ({ week, date }))
      .sort((a, b) => a.week - b.week)
  }, [matchupDetails, visibleWeeks, minWeek, earliestVisibleWeek, scheduleWeeks])

  if (!seasonStatusLoading && !seasonActive) {
    return (
      <SeasonPlaceholder
        pageTitle="Matchups"
        whatYoullSee="you'll see each week's team-vs-team scoreboard with full per-bowler score breakdowns."
      />
    )
  }

  if (loading) return <div className="loading">Loading matchups…</div>

  const closeDetail = () => setSelectedMatchupId(null)
  const closeBowler = () => setSelectedBowlerId(null)
  const closePdf = () => setPdfWeek(null)

  const handleSelectBowler = (id: string) => {
    setSelectedMatchupId(null)
    navigate(`/bowlers?id=${id}`)
  }

  return (
    <div className="matchups-page">
      <h2 className="section-title">Matchups</h2>

      <div className="matchups-toolbar">
        <div />
        <WeekSelector
          week={currentWeek}
          minWeek={minWeek}
          maxWeek={latestWeek}
          date={weekDate}
          weeks={weekList}
          onPrev={() => setWeek(currentWeek - 1)}
          onNext={() => setWeek(currentWeek + 1)}
          onJump={setWeek}
        />
        {/* Standings PDF shortcut — only rendered when a PDF exists for this week */}
        {!bracketOnly && weekMatchups.length > 0 && getStandingsPdfId(currentWeek) && (
          <button
            className="standings-pdf-btn matchups-toolbar__pdf"
            onClick={() => setPdfWeek(currentWeek)}
            aria-label={`View standings PDF for Week ${currentWeek}`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
            </svg>
            Standings PDF
          </button>
        )}
      </div>

      {bracketOnly && (
        <p className="week-hidden-note">
          Week {currentWeek} isn't part of the public schedule — showing the {bracketOnlyHalf.label} bracket only.
        </p>
      )}

      <PlayoffBracket
        matchupDetails={matchupDetails}
        week={currentWeek}
        playoffTeamCount={leagueConfig?.playoffTeamCount}
        onSelectMatchup={setSelectedMatchupId}
      />

      {bracketOnly ? null : weekMatchups.length === 0 ? (
        <p className="no-data">No matchup data for this week.</p>
      ) : (
        <div className="matchup-scoreboard">
          <table className="matchup-table">
            <thead>
              <tr>
                <th className="col-team-left">Team</th>
                <th className="col-pts center">Pts</th>
                <th className="col-score center">Total</th>
                <th className="col-sep center">Lanes</th>
                <th className="col-score center">Total</th>
                <th className="col-pts center">Pts</th>
                <th className="col-team-right">Team</th>
              </tr>
            </thead>
            <tbody>
              {weekMatchups.map(match => {
                const hasVacantTeam = !!(match.team1.isVacantTeam || match.team2.isVacantTeam)
                const pts = hasVacantTeam ? null : getMatchPoints(match)
                const t1Won = !hasVacantTeam && match.team1.totalSeries > match.team2.totalSeries
                const t2Won = !hasVacantTeam && match.team2.totalSeries > match.team1.totalSeries

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
                      {pts ? (pts.team1 % 1 === 0 ? pts.team1 : pts.team1.toFixed(1)) : '-'}
                    </td>
                    <td className={`col-score center score-cell ${t1Won ? 'winner' : ''}`}>
                      <span title={`Scratch: ${match.team1.scratchSeries} + HDCP: ${match.team1.handicapSeries}`}>
                        {match.team1.isVacantTeam ? '-' : match.team1.totalSeries}
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
                    <td className="col-sep center sep-cell">
                      {match.team1.lane}-{match.team1.lane + 1}
                    </td>
                    <td className={`col-score center score-cell ${t2Won ? 'winner' : ''}`}>
                      <span title={`Scratch: ${match.team2.scratchSeries} + HDCP: ${match.team2.handicapSeries}`}>
                        {match.team2.isVacantTeam ? '-' : match.team2.totalSeries}
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
                      {pts ? (pts.team2 % 1 === 0 ? pts.team2 : pts.team2.toFixed(1)) : '-'}
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
      <StandingsPdfModal weekNum={pdfWeek} onClose={closePdf} />
    </div>
  )
}

export default MatchupsPage
