/**
 * @file AwardLeaders.tsx
 * @module components
 *
 * Displays half-season award leaders for both the first half (weeks 1–16) and
 * second half (weeks 17–32) of the bowling season.
 *
 * Award categories:
 *   Team:        High Game Scratch, High Series Scratch, High Game Handicap, High Series Handicap
 *   Individual:  High Average, High Game (scratch + handicap), High Series (scratch + handicap)
 *
 * Data sources (all from Firestore via hooks):
 *   - `useBowlers`        — individual aggregate stats (highGame, highSeries, highGameHdcp, etc.)
 *   - `useMatchupDetails` — team-level per-week totals for team award computation
 *   - `useScheduleWeeks`  — week/date metadata used to determine which weeks belong to each half
 *
 * Individual awards use the top-level aggregate fields on `Bowler` documents
 * rather than re-computing from raw per-week data, which keeps this component
 * simple and consistent with other stat displays.
 */

import { useMemo } from 'react'
import { useBowlers, useMatchupDetails, useScheduleWeeks } from '../hooks'
import type { Bowler, MatchupDetail, ScheduleWeek } from '../types'
import './AwardLeaders.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Season year used to scope all Firestore queries on this page. */
const SEASON_YEAR = '2025-2026'

/**
 * Bowling-week boundary between the first and second halves.
 * Weeks 1–HALF_BOUNDARY are the first half; weeks (HALF_BOUNDARY+1)–END are the second.
 */
const HALF_BOUNDARY = 16

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** A single row in an award category table */
interface AwardRow {
  label: string
  prize: string
  winner: string
  score: string | number
  /** Optional supplementary breakdown (e.g. "580 + 42 HDCP") */
  detail?: string
}

/** Grouped award rows for a single half */
interface AwardGroups {
  team: AwardRow[]
  individual: AwardRow[]
}

// ---------------------------------------------------------------------------
// computeAwards — pure function (no hooks, easy to test)
// ---------------------------------------------------------------------------

/**
 * Computes all award rows for a given set of week numbers (one calendar half).
 *
 * Individual awards are derived from the top-level aggregate fields on each
 * `Bowler` document (`highGame`, `highSeries`, `highGameHdcp`, `highSeriesHdcp`,
 * `average`) rather than from raw per-week scores. This is intentional: the
 * Firestore `bowlers` collection stores pre-computed season highs, so we do not
 * need to stream every `BowlerScore` document just for the leaderboard.
 *
 * NOTE: Because individual award fields are season-level aggregates (not
 * half-level), the "If the half ended today" qualifier on the UI is accurate for
 * team awards but is an approximation for individual awards. A future enhancement
 * could compute half-specific individual awards using `BowlerScore` documents.
 *
 * Team awards are computed by iterating over `MatchupDetail` records for weeks
 * inside the half and tracking the best game/series for each team.
 *
 * @param bowlers   - All bowlers for the season
 * @param matchups  - All matchup details for the season
 * @param halfWeeks - Set of week numbers that belong to this half
 * @returns AwardGroups with team and individual award rows
 */
function computeAwards(
  bowlers: Bowler[],
  matchups: MatchupDetail[],
  halfWeeks: Set<number>
): AwardGroups {

  // --- Individual awards ---
  // Filter to bowlers who have played at least one game this season.
  // Awards use top-level season-aggregate fields from the Bowler document.
  const activeBowlers = bowlers.filter(b => b.gamesPlayed > 0)

  const byAvg        = [...activeBowlers].sort((a, b) => b.average - a.average)
  const byGame       = [...activeBowlers].sort((a, b) => b.highGame - a.highGame)
  const bySeries     = [...activeBowlers].sort((a, b) => b.highSeries - a.highSeries)
  const byGameHdcp   = [...activeBowlers].sort((a, b) => b.highGameHdcp - a.highGameHdcp)
  const bySeriesHdcp = [...activeBowlers].sort((a, b) => b.highSeriesHdcp - a.highSeriesHdcp)

  // --- Team awards ---
  // Aggregate per-week team data from MatchupDetail documents in this half.
  interface TeamHalf {
    name: string
    highGameScratch: number
    highSeriesScratch: number
    highGameHdcp: number
    highSeriesHdcp: number
    /** Scratch component of the best handicap game (for detail display) */
    hdcpGameScratch: number
    /** Handicap addend of the best handicap game */
    hdcpGameHdcp: number
    /** Scratch component of the best handicap series */
    hdcpSeriesScratch: number
    /** Handicap addend of the best handicap series */
    hdcpSeriesHdcp: number
  }

  // Key: teamId string (Firestore ObjectId)
  const teamHalves: Record<string, TeamHalf> = {}

  for (const m of matchups) {
    // Only include weeks that belong to this half
    if (!halfWeeks.has(m.week)) continue

    for (const team of [m.team1, m.team2]) {
      if (!teamHalves[team.teamId]) {
        teamHalves[team.teamId] = {
          name: team.teamName,
          highGameScratch:   0,
          highSeriesScratch: 0,
          highGameHdcp:      0,
          highSeriesHdcp:    0,
          hdcpGameScratch:   0,
          hdcpGameHdcp:      0,
          hdcpSeriesScratch: 0,
          hdcpSeriesHdcp:    0,
        }
      }

      const t = teamHalves[team.teamId]

      // Best single-game scratch total across the 3 games this week
      const bestScratchGame = Math.max(
        team.game1Total,
        team.game2Total,
        team.game3Total
      )

      if (bestScratchGame > t.highGameScratch) {
        t.highGameScratch = bestScratchGame
      }
      if (team.scratchSeries > t.highSeriesScratch) {
        t.highSeriesScratch = team.scratchSeries
      }

      // Handicap game = best scratch game + per-game handicap
      const bestHdcpGame = bestScratchGame + team.handicapPerGame
      if (bestHdcpGame > t.highGameHdcp) {
        t.highGameHdcp    = bestHdcpGame
        t.hdcpGameScratch = bestScratchGame
        t.hdcpGameHdcp    = team.handicapPerGame
      }

      // Handicap series = scratch series + full handicap series
      if (team.totalSeries > t.highSeriesHdcp) {
        t.highSeriesHdcp    = team.totalSeries
        t.hdcpSeriesScratch = team.scratchSeries
        t.hdcpSeriesHdcp    = team.handicapSeries
      }
    }
  }

  const teamList            = Object.values(teamHalves)
  const topTeamGameScratch  = [...teamList].sort((a, b) => b.highGameScratch   - a.highGameScratch)[0]
  const topTeamSerScratch   = [...teamList].sort((a, b) => b.highSeriesScratch - a.highSeriesScratch)[0]
  const topTeamGameHdcp     = [...teamList].sort((a, b) => b.highGameHdcp      - a.highGameHdcp)[0]
  const topTeamSerHdcp      = [...teamList].sort((a, b) => b.highSeriesHdcp    - a.highSeriesHdcp)[0]

  return {
    team: [
      {
        label:  'Team High Game Scratch',
        prize:  '$100',
        winner: topTeamGameScratch?.name           ?? '—',
        score:  topTeamGameScratch?.highGameScratch ?? '—',
      },
      {
        label:  'Team High Series Scratch',
        prize:  '$100',
        winner: topTeamSerScratch?.name             ?? '—',
        score:  topTeamSerScratch?.highSeriesScratch ?? '—',
      },
      {
        label:  'Team High Game Handicap',
        prize:  '$100',
        winner: topTeamGameHdcp?.name        ?? '—',
        score:  topTeamGameHdcp?.highGameHdcp ?? '—',
        detail: topTeamGameHdcp
          ? `${topTeamGameHdcp.hdcpGameScratch} + ${topTeamGameHdcp.hdcpGameHdcp} HDCP`
          : undefined,
      },
      {
        label:  'Team High Series Handicap',
        prize:  '$100',
        winner: topTeamSerHdcp?.name          ?? '—',
        score:  topTeamSerHdcp?.highSeriesHdcp ?? '—',
        detail: topTeamSerHdcp
          ? `${topTeamSerHdcp.hdcpSeriesScratch} + ${topTeamSerHdcp.hdcpSeriesHdcp} HDCP`
          : undefined,
      },
    ],
    individual: [
      {
        label:  'High Average',
        prize:  '$50',
        winner: byAvg[0]?.name    ?? '—',
        score:  byAvg[0]?.average ?? '—',
        detail: byAvg[0]?.teamName,
      },
      {
        label:  'High Game',
        prize:  '$50',
        winner: byGame[0]?.name     ?? '—',
        score:  byGame[0]?.highGame ?? '—',
        detail: byGame[0]?.teamName,
      },
      {
        label:  'High Series',
        prize:  '$50',
        winner: bySeries[0]?.name      ?? '—',
        score:  bySeries[0]?.highSeries ?? '—',
        detail: bySeries[0]?.teamName,
      },
      {
        label:  'High Game Handicap',
        prize:  '$50',
        winner: byGameHdcp[0]?.name         ?? '—',
        score:  byGameHdcp[0]?.highGameHdcp  ?? '—',
        detail: byGameHdcp[0]?.teamName,
      },
      {
        label:  'High Series Handicap',
        prize:  '$50',
        winner: bySeriesHdcp[0]?.name           ?? '—',
        score:  bySeriesHdcp[0]?.highSeriesHdcp  ?? '—',
        detail: bySeriesHdcp[0]?.teamName,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// buildHalfWeekSet — derives the set of week numbers for a given half
// ---------------------------------------------------------------------------

/**
 * Builds a Set of week numbers from the schedule that fall within the given
 * week range and have `status === 'completed'` weeks contributing to a half.
 * All weeks in range are included (not just completed ones) so the
 * `computeAwards` function can filter on the week number naturally.
 *
 * @param schedule   - All schedule weeks for the season
 * @param minWeek    - Inclusive lower bound of the half's week range
 * @param maxWeek    - Inclusive upper bound of the half's week range
 * @returns Set of week numbers (not null) within the range
 */
function buildHalfWeekSet(
  schedule: ScheduleWeek[],
  minWeek: number,
  maxWeek: number
): Set<number> {
  return new Set(
    schedule
      .filter(s => s.week !== null && s.week >= minWeek && s.week <= maxWeek)
      .map(s => s.week as number)
  )
}

// ---------------------------------------------------------------------------
// AwardCard sub-component
// ---------------------------------------------------------------------------

/**
 * Renders a single award category card showing the current leader.
 *
 * @param award - The award row data to display
 */
function AwardCard({ award }: { award: AwardRow }) {
  return (
    <div className="award-card">
      <div className="award-card-header">
        <span className="award-label">{award.label}</span>
        <span className="award-prize">{award.prize}</span>
      </div>
      <div className="award-card-body">
        <span className="award-winner">{award.winner}</span>
        {award.detail && <span className="award-detail">{award.detail}</span>}
        <span className="award-score">{award.score}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HalfAwards sub-component
// ---------------------------------------------------------------------------

/**
 * Renders all award cards for one half of the season (first or second).
 * Displays a "If the half ended today" qualifier when the half is in progress,
 * and a "Not yet started" label when no data exists for the half yet.
 *
 * @param title    - Display title, e.g. "First Half"
 * @param awards   - Computed award rows for this half
 * @param complete - True when all weeks in this half have been completed
 * @param hasData  - True when at least one week in this half has been completed
 */
function HalfAwards({
  title,
  awards,
  complete,
  hasData,
}: {
  title: string
  awards: AwardGroups
  complete: boolean
  hasData: boolean
}) {
  return (
    <div className="half-awards">
      <div className="half-awards-header">
        <h3 className="half-awards-title">{title}</h3>
        {!complete && hasData && (
          <span className="half-awards-qualifier">If the half ended today</span>
        )}
        {!hasData && (
          <span className="half-awards-qualifier">Not yet started</span>
        )}
      </div>

      {/* Team row: 4 cards */}
      <div className="award-row-label">Team</div>
      <div className="award-grid-4">
        {awards.team.map(a => <AwardCard key={a.label} award={a} />)}
      </div>

      {/* Individual row: 5 cards (includes handicap categories) */}
      <div className="award-row-label">Individual</div>
      <div className="award-grid-3-centered">
        {awards.individual.map(a => <AwardCard key={a.label} award={a} />)}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AwardLeaders — main export
// ---------------------------------------------------------------------------

/**
 * Top-level component for the Half Awards section.
 *
 * Fetches all bowlers, matchup details, and schedule weeks for the current
 * season from Firestore, then delegates award computation to `computeAwards`.
 *
 * Renders two `HalfAwards` panels side by side — first half (weeks 1–16)
 * and second half (weeks 17–32).
 */
function AwardLeaders() {
  // --- Data fetching via Firestore hooks ---
  const { data: bowlers,  loading: bowlersLoading  } = useBowlers(SEASON_YEAR)
  const { data: matchups, loading: matchupsLoading } = useMatchupDetails(SEASON_YEAR)
  const { data: schedule, loading: scheduleLoading } = useScheduleWeeks(SEASON_YEAR)

  const isLoading = bowlersLoading || matchupsLoading || scheduleLoading

  // --- Compute half metadata and award rows ---
  const { firstHalf, secondHalf } = useMemo(() => {
    // Build week-number sets for each half from the schedule
    const firstWeeks  = buildHalfWeekSet(schedule, 1, HALF_BOUNDARY)
    const secondWeeks = buildHalfWeekSet(schedule, HALF_BOUNDARY + 1, 32)

    // A half is "complete" when every scheduled (non-skip) week in the range is completed
    const firstComplete = schedule
      .filter(s => s.week !== null && s.week >= 1 && s.week <= HALF_BOUNDARY && s.status !== 'skip')
      .every(s => s.status === 'completed')

    const secondComplete = schedule
      .filter(s => s.week !== null && s.week > HALF_BOUNDARY && s.week <= 32 && s.status !== 'skip')
      .every(s => s.status === 'completed')

    // A half has data when at least one week in its range has been completed
    const secondHasData = schedule.some(
      s => s.week !== null && s.week > HALF_BOUNDARY && s.status === 'completed'
    )

    return {
      firstHalf: {
        weeks:    firstWeeks,
        complete: firstComplete,
        hasData:  true, // First half always has data once the season starts
        awards:   computeAwards(bowlers, matchups, firstWeeks),
      },
      secondHalf: {
        weeks:    secondWeeks,
        complete: secondComplete,
        hasData:  secondHasData,
        awards:   computeAwards(bowlers, matchups, secondWeeks),
      },
    }
  }, [bowlers, matchups, schedule])

  return (
    <div className="award-leaders">
      <h2 className="section-title">Half Awards</h2>

      {isLoading ? (
        <p className="loading-state">Loading award data…</p>
      ) : (
        <div className="award-halves">
          <HalfAwards
            title="First Half"
            awards={firstHalf.awards}
            complete={firstHalf.complete}
            hasData={firstHalf.hasData}
          />
          <HalfAwards
            title="Second Half"
            awards={secondHalf.awards}
            complete={secondHalf.complete}
            hasData={secondHalf.hasData}
          />
        </div>
      )}
    </div>
  )
}

export default AwardLeaders
