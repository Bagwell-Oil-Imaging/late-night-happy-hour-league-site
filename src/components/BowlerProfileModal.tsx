/**
 * @file BowlerProfileModal.tsx
 * @module components
 *
 * A modal overlay that displays the full profile for a single bowler:
 *   - Aggregate stats (average, entering average, high game, high series)
 *   - Week-by-week score table with null-game handling and pre-bowl indicators
 *
 * Receives a `bowlerId` (Firestore document ID / leaguePalsId) from the parent
 * component. The bowler's aggregate data is fetched via `useBowler` and per-week
 * scores are fetched via `useBowlerScores`, both subscribing to Firestore
 * real-time updates.
 *
 * The modal is open when `bowlerId` is non-null and renders nothing otherwise.
 *
 * Accessibility:
 *   - Closes on Escape key press
 *   - Prevents background scroll while open
 *   - Close button has an aria-label
 *   - Overlay click closes the modal (click on content stops propagation)
 */

import { useEffect } from 'react'
import { useBowler, useBowlerScores } from '../hooks'
import { useSeasonYear } from '../context/SeasonContext'
import type { Bowler, BowlerScore } from '../types'
import './BowlerProfileModal.css'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BowlerProfileModalProps {
  /**
   * Firestore document ID (leaguePalsId) of the bowler to display.
   * Pass `null` when no bowler is selected — the modal renders nothing.
   */
  bowlerId: string | null
  /** Callback invoked when the user dismisses the modal */
  onClose: () => void
}

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
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Renders a formatted lane-pair indicator showing both lanes in the pair,
 * with the bowler's specific lane displayed in bold.
 *
 * @param lane - The bowler's assigned lane number, or null/undefined if unknown
 * @returns JSX representing the lane pair with the active lane bolded
 */
function formatLanePair(lane: number | null | undefined): JSX.Element {
  if (lane == null) return <span>—</span>
  const odd = lane % 2 === 1 ? lane : lane - 1
  const even = odd + 1
  return lane === odd
    ? <><strong>{odd}</strong> | {even}</>
    : <>{odd} | <strong>{even}</strong></>
}

/**
 * Returns the display value for a single game score.
 * Null scores indicate blinded weeks and are shown as "-" rather than "0".
 *
 * @param score - Game score, or null when the bowler was blinded/absent
 * @returns String representation of the score, or "-"
 */
function renderGameScore(score: number | null): string {
  return score === null ? '-' : String(score)
}

// ---------------------------------------------------------------------------
// ScoresTable sub-component
// ---------------------------------------------------------------------------

interface ScoresTableProps {
  scores: BowlerScore[]
  bowler: Bowler
}

/**
 * Renders the week-by-week score table inside the bowler profile modal.
 *
 * Features:
 *  - Highlights cells that match the bowler's season high game (`high-game` CSS class)
 *  - Highlights the series cell when it matches the season high series
 *  - Shows "-" for null game values (blinded weeks)
 *  - Displays a "PB" badge with tooltip for pre-bowled weeks
 *  - Shows the actual bowl date in parentheses when different from scheduled date
 *
 * @param scores - Per-week `BowlerScore` documents, ordered by week ascending
 * @param bowler - Parent `Bowler` document providing season-high values for highlighting
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
            // Highlight this row's series cell if it matches the season high series
            const isHighSeries = score.series === bowler.highSeries

            // True when a non-null game value equals the season high game
            const isHighGame = (g: number | null) =>
              g !== null && g === bowler.highGame

            return (
              <tr key={score.id ?? score.week} className="week-row">
                {/* Week number + optional Pre-bowl badge */}
                <td className="col-week">
                  {score.week}
                  {score.preBowled && (
                    <span
                      className="prebowl-badge"
                      title={
                        score.actualBowlDate
                          ? `Bowled on ${formatDate(score.actualBowlDate)}`
                          : 'Pre-bowled'
                      }
                    >
                      {' '}PB
                    </span>
                  )}
                </td>

                {/* Scheduled date; show actual bowl date for pre-bowls */}
                <td className="col-date">
                  {formatDate(score.date)}
                  {score.preBowled && score.actualBowlDate && (
                    <span className="prebowl-actual-date">
                      {' '}({formatDate(score.actualBowlDate)})
                    </span>
                  )}
                </td>

                <td className="col-lane">{formatLanePair(score.lanePair)}</td>
                <td className="col-opp">{score.opponentTeamName || '—'}</td>

                {/* Game cells — null renders as "-" (blinded week) */}
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
// BowlerProfileModal — main export
// ---------------------------------------------------------------------------

/**
 * Modal overlay displaying a bowler's full season profile.
 *
 * The modal is "open" whenever `bowlerId` is non-null. It renders nothing when
 * `bowlerId` is null, so the caller controls visibility by passing `null` to
 * dismiss the modal.
 *
 * Aggregate stats (`average`, `highGame`, `highSeries`, etc.) are loaded via
 * `useBowler` and are taken directly from the `Bowler` document's top-level
 * fields (not computed from per-week data). Per-week scores are loaded
 * separately via `useBowlerScores` so they stream in as Firestore data arrives.
 *
 * @param bowlerId - Firestore document ID of the bowler to display, or null to close
 * @param onClose  - Callback to dismiss the modal (Escape key, overlay click, or close button)
 */
function BowlerProfileModal({ bowlerId, onClose }: BowlerProfileModalProps) {
  const SEASON_YEAR = useSeasonYear()
  const isOpen = bowlerId !== null

  // Fetch the bowler aggregate document — hook is a no-op when bowlerId is null
  const { data: bowler, loading: bowlerLoading } = useBowler(bowlerId)

  // Fetch per-week scores — scoped to the current season.
  // Pass an empty string when bowlerId is null; the where clause will simply
  // return no documents. The modal is not rendered when bowlerId is null anyway.
  const effectiveBowlerId = bowlerId ?? ''
  const { data: scores, loading: scoresLoading } = useBowlerScores(
    effectiveBowlerId,
    SEASON_YEAR
  )

  // Prevent background page from scrolling while the modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  // Close the modal when the user presses Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Render nothing when there is no bowler selected
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* Stop click propagation so clicks inside the card don't close the modal */}
      <div className="bowler-modal-content" onClick={e => e.stopPropagation()}>

        {/* Loading state while bowler document is being fetched */}
        {bowlerLoading && (
          <p className="loading-state">Loading bowler…</p>
        )}

        {/* Bowler not found in Firestore */}
        {!bowlerLoading && !bowler && (
          <p className="no-data">Bowler not found.</p>
        )}

        {/* Main modal content — rendered once the bowler document is available */}
        {bowler && (
          <>
            {/* Modal header: bowler name + team + close button */}
            <div className="modal-header">
              <div className="bowler-header-info">
                <h2>{bowler.name}</h2>
                <span className="bowler-team-name">{bowler.teamName}</span>
              </div>
              <button
                className="modal-close-button"
                onClick={onClose}
                aria-label="Close bowler profile"
              >
                ✕
              </button>
            </div>

            {/* Aggregate stats bar — values come from top-level Bowler fields */}
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

            {/* Score table body */}
            <div className="modal-body">
              {scoresLoading ? (
                <p className="loading-state">Loading scores…</p>
              ) : scores.length === 0 ? (
                <p className="no-data">No scores recorded yet.</p>
              ) : (
                <ScoresTable scores={scores} bowler={bowler} />
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

export default BowlerProfileModal
