/**
 * @file BowlersPage.tsx
 * @module pages
 *
 * Displays a list of all bowlers for the current season (2025-2026), grouped
 * by team, with a detail panel showing aggregate stats and per-week scores for
 * the selected bowler.
 *
 * Data is loaded via the `useBowlers` and `useBowlerScores` Firestore hooks so
 * the page always reflects the live Firestore state rather than a static JSON
 * snapshot. The selected bowler is tracked via the `?id=` URL search parameter,
 * allowing deep-links and browser back/forward navigation to work correctly.
 */

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBowlers, useBowlerScores } from '../hooks'
import { useSeasonYear, useSeasonStatus } from '../context/SeasonContext'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import type { Bowler, BowlerScore } from '../types'
import '../components/BowlerProfileModal.css'
import './BowlersPage.css'

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) as a short month+day string.
 * Uses noon local time to avoid date-boundary issues with UTC conversion.
 *
 * @param dateString - ISO date string, e.g. "2025-09-04"
 * @returns Formatted date, e.g. "Sep 4"
 */
function formatDate(dateString: string): string {
  const d = new Date(dateString + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Renders a formatted lane-pair cell showing both lanes in the pair,
 * with the bowler's specific lane displayed in bold.
 *
 * @param lane - The bowler's assigned lane number, or null/undefined if not set
 * @returns JSX element showing the lane pair, or an em-dash for unknown lanes
 */
function formatLanePair(lane: number | null | undefined): JSX.Element {
  if (lane == null) return <span>—</span>
  // Odd lane is always left; even lane is always right in a standard pair
  const odd = lane % 2 === 1 ? lane : lane - 1
  const even = odd + 1
  return lane === odd
    ? <><strong>{odd}</strong> | {even}</>
    : <>{odd} | <strong>{even}</strong></>
}

/**
 * Renders a single game score cell.
 * Displays "-" for null values; after the pipeline fix blinded weeks store
 * the computed blind score (not null), so this mostly handles missing data.
 *
 * @param score - Game score, or null when data is missing
 * @returns The score as a string, or "-" for null
 */
function renderGameScore(score: number | null): string {
  return score === null ? '-' : String(score)
}

// ---------------------------------------------------------------------------
// BowlerDetailPanel sub-component
// ---------------------------------------------------------------------------

interface BowlerDetailPanelProps {
  /** The currently selected bowler whose stats and scores are displayed */
  bowler: Bowler
}

/**
 * Displays aggregate stats and a week-by-week score table for a single bowler.
 * Scores are fetched live from Firestore via `useBowlerScores`.
 *
 * @param bowler - The `Bowler` document to display
 */
function BowlerDetailPanel({ bowler }: BowlerDetailPanelProps) {
  const SEASON_YEAR = useSeasonYear()
  // Load per-week scores for this bowler — hook skips if id is missing
  const bowlerId = bowler.leaguePalsId || bowler.id || ''
  const { data: scores, loading: scoresLoading } = useBowlerScores(bowlerId, SEASON_YEAR)

  return (
    <>
      {/* Bowler header */}
      <div className="bowler-detail-title">
        <h3 className="bowler-detail-name">{bowler.name}</h3>
        <span className="bowler-team-name">{bowler.teamName}</span>
      </div>

      {/* Aggregate stats bar — pulled from top-level Bowler fields */}
      <div className="bowler-stats-bar">
        <div className="stat-item">
          <span className="stat-label">Current Avg</span>
          <span className="stat-value">{bowler.average}</span>
        </div>
        {bowler.enteringAvg > 0 && (
          <div className="stat-item">
            <span className="stat-label">Entering Avg</span>
            <span className="stat-value">{bowler.enteringAvg}</span>
          </div>
        )}
        <div className="stat-item">
          <span className="stat-label">High Game</span>
          <span className="stat-value highlight">{bowler.highGame}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">High Series</span>
          <span className="stat-value highlight">{bowler.highSeries}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Games Played</span>
          <span className="stat-value">{bowler.gamesPlayed}</span>
        </div>
      </div>

      {/* Per-week score table */}
      {scoresLoading ? (
        <p className="loading-state">Loading scores…</p>
      ) : scores.length === 0 ? (
        <p className="no-data">No scores recorded yet.</p>
      ) : (
        <ScoresTable scores={scores} bowler={bowler} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// ScoresTable sub-component
// ---------------------------------------------------------------------------

interface ScoresTableProps {
  scores: BowlerScore[]
  bowler: Bowler
}

/**
 * Renders a table of per-week bowling scores for a bowler.
 * Highlights the bowler's high game and high series cells.
 * Shows a "B" badge for blinded weeks (score is the computed blind value, not null)
 * and a "PB" badge when `score.preBowled === true`.
 *
 * @param scores - Array of `BowlerScore` documents ordered by week asc
 * @param bowler - Parent `Bowler` document, used to identify high-game/series cells
 */
function ScoresTable({ scores, bowler }: ScoresTableProps) {
  return (
    <div className="scores-table-wrapper">
      <table className="bowler-week-table">
        <thead>
          <tr>
            <th className="col-week">Wk</th>
            <th className="col-date">Date</th>
            <th className="col-lane">Lanes</th>
            <th className="col-opp">Opponent</th>
            <th className="col-game">G1</th>
            <th className="col-game">G2</th>
            <th className="col-game">G3</th>
            <th className="col-series">Series</th>
            <th className="col-avg">Avg</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => {
            // Highlight the series cell when it matches the bowler's season high series
            const isHighSeries = score.series === bowler.highSeries

            // Highlight individual game cells that equal the bowler's season high game
            const isHighGame = (g: number | null) =>
              g !== null && g === bowler.highGame

            return (
              <tr key={score.id ?? score.week} className={`week-row${score.blinded ? ' blinded-row' : ''}`}>
                <td className="col-week">
                  {score.week}
                  {/* B badge for blinded weeks — score is computed blind value, not actual */}
                  {score.blinded && (
                    <span className="blind-badge" title="Blind score — bowler was absent; score is computed from their average">B</span>
                  )}
                  {/* PB badge only when the bowl date differs from the scheduled date */}
                  {score.preBowled && score.actualBowlDate && score.actualBowlDate !== score.date && (
                    <span className="prebowl-badge" title={`Bowled on ${formatDate(score.actualBowlDate)}`}>
                      {' '}PB
                    </span>
                  )}
                </td>
                <td className="col-date">
                  {formatDate(score.date)}
                  {/* Parenthetical actual date only when it differs from the scheduled date */}
                  {score.preBowled && score.actualBowlDate && score.actualBowlDate !== score.date && (
                    <span className="prebowl-actual-date">
                      {' '}({formatDate(score.actualBowlDate)})
                    </span>
                  )}
                </td>
                <td className="col-lane">{formatLanePair(score.lanePair)}</td>
                <td className="col-opp">{score.opponentTeamName || '—'}</td>
                <td className={`col-game ${isHighGame(score.game1) ? 'high-game' : ''}`}>
                  {renderGameScore(score.game1)}
                </td>
                <td className={`col-game ${isHighGame(score.game2) ? 'high-game' : ''}`}>
                  {renderGameScore(score.game2)}
                </td>
                <td className={`col-game ${isHighGame(score.game3) ? 'high-game' : ''}`}>
                  {renderGameScore(score.game3)}
                </td>
                <td className={`col-series ${isHighSeries ? 'high-series' : ''}`}>
                  {score.series === null ? '-' : score.series}
                </td>
                <td className="col-avg">
                  {score.rollingAvg ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BowlersPage — main export
// ---------------------------------------------------------------------------

/**
 * Top-level page component for the Bowler Stats section.
 *
 * Renders a sidebar listing all bowlers (grouped by team, sorted alphabetically)
 * and a main detail panel for the currently selected bowler. The selected bowler
 * is stored in the `?id=` URL query parameter so the selection survives page
 * refreshes and can be shared via URL.
 *
 * Data is fetched via the `useBowlers` Firestore hook; individual scores are
 * fetched by the `BowlerDetailPanel` child component.
 */
function BowlersPage() {
  const SEASON_YEAR = useSeasonYear()
  const { seasonActive, loading: seasonStatusLoading } = useSeasonStatus()
  const [searchParams, setSearchParams] = useSearchParams()

  // Fetch all bowlers for the current season from Firestore
  const { data: bowlers, loading } = useBowlers(SEASON_YEAR)

  // Sort bowlers alphabetically by name for consistent sidebar display
  const sortedBowlers = useMemo(
    () => [...bowlers].sort((a, b) => a.name.localeCompare(b.name)),
    [bowlers]
  )

  // Derive the selected bowler from the URL param, defaulting to the first bowler
  const bowlerIdParam = searchParams.get('id')
  const selectedBowlerId = bowlerIdParam ?? sortedBowlers[0]?.leaguePalsId
  const bowler = useMemo(
    () => sortedBowlers.find(b => (b.leaguePalsId || b.id) === selectedBowlerId),
    [sortedBowlers, selectedBowlerId]
  )

  /**
   * Updates the URL search param to select a different bowler.
   * @param id - The `leaguePalsId` of the bowler to select
   */
  const selectBowler = (id: string) => setSearchParams({ id })

  // Group sorted bowlers by team for the sidebar — teamId is now a string
  const bowlersByTeam = useMemo(() => {
    const groups: Record<string, { teamName: string; bowlers: Bowler[] }> = {}
    for (const b of sortedBowlers) {
      // teamId is a string ObjectId in Firestore; use it as the group key directly
      const key = b.teamId
      if (!groups[key]) groups[key] = { teamName: b.teamName, bowlers: [] }
      groups[key].bowlers.push(b)
    }
    return Object.entries(groups).sort(([, a], [, b]) =>
      a.teamName.localeCompare(b.teamName)
    )
  }, [sortedBowlers])

  if (!seasonStatusLoading && !seasonActive) {
    return (
      <SeasonPlaceholder
        pageTitle="Bowler Stats"
        whatYoullSee="you'll see every bowler's stats, averages, and week-by-week scores."
      />
    )
  }

  return (
    <div className="bowlers-page">
      <h2 className="section-title">Bowler Stats</h2>

      {loading ? (
        <p className="loading-state">Loading bowlers…</p>
      ) : (
        <div className="bowlers-layout">
          {/* Sidebar: team-grouped list of bowlers */}
          <aside className="bowlers-sidebar">
            {bowlersByTeam.map(([teamId, { teamName, bowlers: teamBowlers }]) => (
              <div key={teamId} className="sidebar-team-group">
                <div className="sidebar-team-label">{teamName}</div>
                {teamBowlers.map(b => {
                  // Prefer leaguePalsId as the stable identifier; fall back to id
                  const bid = b.leaguePalsId || b.id || ''
                  return (
                    <button
                      key={bid}
                      className={`bowler-list-btn ${bid === selectedBowlerId ? 'active' : ''}`}
                      onClick={() => selectBowler(bid)}
                    >
                      <span className="bowler-list-name">{b.name}</span>
                      <span className="bowler-list-avg">{b.average}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </aside>

          {/* Detail panel: stats + week-by-week scores for selected bowler */}
          <div className="bowler-detail-panel">
            {bowler ? (
              <BowlerDetailPanel bowler={bowler} />
            ) : (
              <p className="no-data">Select a bowler to view their stats.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BowlersPage
