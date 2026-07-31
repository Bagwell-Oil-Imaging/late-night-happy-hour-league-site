/**
 * @file AwardLeaders.tsx
 * @module components
 *
 * Displays half-season award leaders for both the first half (weeks 1–16) and
 * second half (weeks 17–32) of the bowling season.
 *
 * Award categories:
 *   Team:        High Game Scratch ($100), High Series Scratch ($100),
 *                High Game Handicap ($100), High Series Handicap ($100)
 *   Individual:  High Average ($50), High Game Scratch ($50), High Series Scratch ($50)
 *
 * Data sources (all from Firestore via hooks):
 *   - `useBowlers`        — individual aggregate stats (highGame, highSeries, average)
 *   - `useMatchupDetails` — team-level per-week totals for team award computation
 *   - `useScheduleWeeks`  — week/date metadata used to determine which weeks belong to each half
 *
 * Individual awards use the top-level aggregate fields on `Bowler` documents
 * rather than re-computing from raw per-week data, which keeps this component
 * simple and consistent with other stat displays.
 *
 * UI: Two side-by-side "Championship Board" panels — Anton score numbers with
 * gold glow, gold gradient cap stripe, status badge (Live / Final / Upcoming).
 */

import { useMemo } from 'react'
import { useBowlers, useMatchupDetails, useScheduleWeeks } from '../hooks'
import { useSeasonYear } from '../context/SeasonContext'
import { isScheduleWeekVisible } from '../utils/weekVisibility'
import type { Bowler, MatchupDetail, ScheduleWeek } from '../types'
import './AwardLeaders.css'

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
  // gamesPlayed is back-filled by the transform pipeline; fall back to
  // checking highGame/average so seed-data awards still render correctly.
  const activeBowlers = halfWeeks.size === 0
    ? []
    : bowlers.filter(b => b.gamesPlayed > 0 || b.highGame > 0 || b.average > 0)

  const byAvg    = [...activeBowlers].sort((a, b) => b.average - a.average)
  const byGame   = [...activeBowlers].sort((a, b) => b.highGame - a.highGame)
  const bySeries = [...activeBowlers].sort((a, b) => b.highSeries - a.highSeries)

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
          name:              team.teamName,
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
      const bestScratchGame = Math.max(team.game1Total, team.game2Total, team.game3Total)

      if (bestScratchGame > t.highGameScratch)      t.highGameScratch   = bestScratchGame
      if (team.scratchSeries > t.highSeriesScratch) t.highSeriesScratch = team.scratchSeries

      // Handicap game = scratch + that game's own handicap, per game (handicap can
      // differ by game), so the best handicap game isn't necessarily the same game
      // as the best scratch game.
      const hdcpGames = [
        { scratch: team.game1Total, hdcp: team.handicapGame1 },
        { scratch: team.game2Total, hdcp: team.handicapGame2 },
        { scratch: team.game3Total, hdcp: team.handicapGame3 },
      ]
      const bestHdcpGameEntry = hdcpGames.reduce((best, g) =>
        (g.scratch + g.hdcp) > (best.scratch + best.hdcp) ? g : best)
      const bestHdcpGame = bestHdcpGameEntry.scratch + bestHdcpGameEntry.hdcp
      if (bestHdcpGame > t.highGameHdcp) {
        t.highGameHdcp    = bestHdcpGame
        t.hdcpGameScratch = bestHdcpGameEntry.scratch
        t.hdcpGameHdcp    = bestHdcpGameEntry.hdcp
      }

      // Handicap series = scratch series + full handicap series
      if (team.totalSeries > t.highSeriesHdcp) {
        t.highSeriesHdcp    = team.totalSeries
        t.hdcpSeriesScratch = team.scratchSeries
        t.hdcpSeriesHdcp    = team.handicapSeries
      }
    }
  }

  const teamList           = Object.values(teamHalves)
  const topTeamGameScratch = [...teamList].sort((a, b) => b.highGameScratch   - a.highGameScratch)[0]
  const topTeamSerScratch  = [...teamList].sort((a, b) => b.highSeriesScratch - a.highSeriesScratch)[0]
  const topTeamGameHdcp    = [...teamList].sort((a, b) => b.highGameHdcp      - a.highGameHdcp)[0]
  const topTeamSerHdcp     = [...teamList].sort((a, b) => b.highSeriesHdcp    - a.highSeriesHdcp)[0]

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
          ? `${topTeamGameHdcp.hdcpGameScratch} scratch + ${topTeamGameHdcp.hdcpGameHdcp} hdcp`
          : undefined,
      },
      {
        label:  'Team High Series Handicap',
        prize:  '$100',
        winner: topTeamSerHdcp?.name          ?? '—',
        score:  topTeamSerHdcp?.highSeriesHdcp ?? '—',
        detail: topTeamSerHdcp
          ? `${topTeamSerHdcp.hdcpSeriesScratch} scratch + ${topTeamSerHdcp.hdcpSeriesHdcp} hdcp`
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
        winner: bySeries[0]?.name       ?? '—',
        score:  bySeries[0]?.highSeries ?? '—',
        detail: bySeries[0]?.teamName,
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
// AwardRow sub-component
// ---------------------------------------------------------------------------

/**
 * Single award row inside a half panel — category label + prize pill on top,
 * winner name (+ optional team) on the bottom-left, dominant score on the right.
 *
 * @param award - The award row data to display
 */
function AwardRow({ award }: { award: AwardRow }) {
  const isEmpty = award.winner === '—'
  return (
    <div className="award-row">
      <div className="award-row-meta">
        <span className="award-row-category">{award.label}</span>
        <span className="award-row-prize">{award.prize}</span>
      </div>
      <div className="award-row-result">
        <div className="award-row-winner-block">
          <span className="award-row-winner">{award.winner}</span>
          {award.detail && <span className="award-row-team">{award.detail}</span>}
        </div>
        <span className={`award-row-score${isEmpty ? ' award-row-score--empty' : ''}`}>
          {award.score}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HalfAwards sub-component
// ---------------------------------------------------------------------------

/**
 * Renders a "Championship Board" panel for one half of the season.
 * Shows a gold cap stripe, status badge (Live / Final / Upcoming), then
 * TEAM and INDIVIDUAL award rows with Anton score numbers and gold glow.
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
  const badgeClass = !hasData
    ? 'half-status-badge--pending'
    : complete
    ? 'half-status-badge--final'
    : 'half-status-badge--live'

  const badgeLabel = !hasData ? 'Upcoming' : complete ? 'Final' : 'In Progress'

  return (
    <div className="half-panel">
      <div className="half-panel-cap">
        <h3 className="half-panel-title">{title}</h3>
        <span className={`half-status-badge ${badgeClass}`}>{badgeLabel}</span>
      </div>

      <div className="half-panel-body">
        <div className="award-section-header">
          <span className="award-section-label">Team</span>
        </div>
        <div className="award-row-list">
          {awards.team.map(a => <AwardRow key={a.label} award={a} />)}
        </div>

        <div className="award-section-header">
          <span className="award-section-label">Individual</span>
        </div>
        <div className="award-row-list">
          {awards.individual.map(a => <AwardRow key={a.label} award={a} />)}
        </div>
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
  const SEASON_YEAR = useSeasonYear()
  // --- Data fetching via Firestore hooks ---
  const { data: bowlers,  loading: bowlersLoading  } = useBowlers(SEASON_YEAR)
  const { data: matchups, loading: matchupsLoading } = useMatchupDetails(SEASON_YEAR)
  const { data: schedule, loading: scheduleLoading } = useScheduleWeeks(SEASON_YEAR)

  const isLoading = bowlersLoading || matchupsLoading || scheduleLoading

  // --- Compute half metadata and award rows ---
  const { firstHalf, secondHalf } = useMemo(() => {
    // Build week-number sets for each half from the visible schedule
    const visibleSchedule = schedule.filter(isScheduleWeekVisible)
    const firstWeeks  = buildHalfWeekSet(visibleSchedule, 1, HALF_BOUNDARY)
    const secondWeeks = buildHalfWeekSet(visibleSchedule, HALF_BOUNDARY + 1, 32)

    // A half is "complete" when every scheduled (non-skip) week in the range is completed
    const firstComplete = visibleSchedule
      .filter(s => s.week !== null && s.week >= 1 && s.week <= HALF_BOUNDARY && s.status !== 'skip')
      .every(s => s.status === 'completed')

    const secondComplete = visibleSchedule
      .filter(s => s.week !== null && s.week > HALF_BOUNDARY && s.week <= 32 && s.status !== 'skip')
      .every(s => s.status === 'completed')

    // A half has data when at least one week in its range has been completed
    const firstHasData = visibleSchedule.some(
      s => s.week !== null && s.week >= 1 && s.week <= HALF_BOUNDARY && s.status === 'completed'
    )

    const secondHasData = visibleSchedule.some(
      s => s.week !== null && s.week > HALF_BOUNDARY && s.status === 'completed'
    )

    return {
      firstHalf: {
        weeks:    firstWeeks,
        complete: firstComplete,
        hasData:  firstHasData,
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
