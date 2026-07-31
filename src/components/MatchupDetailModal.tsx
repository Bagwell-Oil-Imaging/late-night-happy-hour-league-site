/**
 * @file MatchupDetailModal.tsx
 * @component MatchupDetailModal
 *
 * Overlay modal showing the full team-aggregate breakdown for a single
 * completed matchup. Displays game-by-game scratch totals, handicap per
 * game, and the final handicap series for each team.
 *
 * Data is fetched from Firestore via `useMatchupDetail` — no static JSON
 * import.
 *
 * Blind score handling:
 *   The roster for each team is always loaded alongside BowlerScore records.
 *   Pipeline-recorded blinds (blinded: true in Firestore) show a B badge.
 *   If the pipeline stored blinded: true but null game scores (pre-fix data),
 *   blind scores are computed client-side from the bowler's entering average
 *   so the display is never blank for known absent bowlers.
 *   Roster members with no score record at all are shown as absent (dashes,
 *   no badge) — we do not assume absence equals a counted blind.
 */

import { useEffect } from 'react'
import { useMatchupDetail, useBowlerScoresByTeamWeek, useBowlers } from '../hooks'
import { useSeasonYear } from '../context/SeasonContext'
import type { Bowler, BowlerScore } from '../types'
import './MatchupDetailModal.css'

// Matches the formula in transform-data.js — blind score = avg − floor(avg × penalty)
const BLIND_PENALTY_PCT = 0.10

// ── Display row type ──────────────────────────────────────────────────────────

interface MatchupBowlerRow {
  bowlerId: string
  bowlerName: string
  game1: number | null
  game2: number | null
  game3: number | null
  series: number | null
  blinded: boolean
  /** Cumulative non-blind games bowled through this week; null for absent bowlers with no record. */
  rollingGames: number | null
  /** Bowler's average entering this week — used for handicap and blind score calculation. */
  avgBeforeThisWeek: number | null
}

/**
 * Computes a blind score from a bowler's entering average.
 * Used as a display-side fallback when the pipeline stored `blinded: true`
 * but null game scores (pre-fix pipeline data still in Firestore).
 */
function computeBlindScore(enteringAvg: number): number | null {
  if (enteringAvg <= 0) return null
  const penalty = Math.floor(enteringAvg * BLIND_PENALTY_PCT)
  return enteringAvg - penalty
}

/**
 * Sums the entering averages of bowlers who contributed to the team score this week
 * (bowled or counted as a blind). Absent roster members are excluded.
 * This sum is the team average used for handicap calculation.
 */
function computeTeamAvgFromRows(rows: MatchupBowlerRow[]): number {
  return rows
    .filter(r => r.game1 !== null || r.game2 !== null || r.game3 !== null || r.blinded)
    .reduce((sum, r) => sum + (r.avgBeforeThisWeek ?? 0), 0)
}

/**
 * Merges a team's roster against its BowlerScore records for the week.
 *
 * - Bowlers WITH a score record: returned as-is. If the record is `blinded: true`
 *   but has null game scores (old pipeline data), blind scores are computed
 *   client-side from the bowler's `enteringAvg` so the display is never blank.
 * - Bowlers WITHOUT a score record: shown as absent (dashes, no blind badge).
 *   We don't assume absence = blind — that distinction belongs to the pipeline.
 *
 * Falls back to score-records-only order when the roster hasn't loaded yet.
 *
 * @param roster - Full bowler roster for the team (may be empty while loading)
 * @param scores - BowlerScore records for this team+week from Firestore
 * @returns Display rows in roster order (or score order if roster is empty)
 */
function buildBowlerRows(roster: Bowler[], scores: BowlerScore[]): MatchupBowlerRow[] {
  const rosterById = new Map(roster.map(b => [b.id!, b]))

  /**
   * Computes the bowler's average ENTERING this week (before this week's games
   * are counted). Used for handicap and blind score display.
   *
   * New score documents persist this exact point-in-time value during ingestion.
   * Older documents fall back to reversing this week's numeric games out of the
   * cumulative rolling average. That legacy calculation can be off by a pin
   * because rollingAvg was already floored.
   */
  const computeAvgBeforeThisWeek = (s: BowlerScore): number | null => {
    if (typeof s.avgBeforeThisWeek === 'number') return s.avgBeforeThisWeek

    const enteringAvg = rosterById.get(s.bowlerId)?.enteringAvg ?? 0
    if (s.blinded) {
      // Blind weeks don't accumulate — rollingAvg is already the pre-week average
      return s.rollingAvg ?? (enteringAvg > 0 ? enteringAvg : null)
    }
    const gamesThisWeek = [s.game1, s.game2, s.game3]
      .filter((game): game is number => typeof game === 'number')
      .length
    const gamesBeforeWeek = (s.rollingGames ?? 0) - gamesThisWeek
    if (gamesBeforeWeek <= 0) {
      return enteringAvg > 0 ? enteringAvg : null
    }
    const approxPinsBefore = (s.rollingAvg ?? 0) * (s.rollingGames ?? 0) - (s.series ?? 0)
    return Math.floor(approxPinsBefore / gamesBeforeWeek)
  }

  const resolveScore = (s: BowlerScore): MatchupBowlerRow => {
    // If the pipeline recorded blinded: true but stored null scores (pre-fix data),
    // compute the blind score client-side from the bowler's entering average.
    const needsClientBlind = s.blinded && s.game1 === null
    if (needsClientBlind) {
      const avg = rosterById.get(s.bowlerId)?.enteringAvg ?? 0
      const blindScore = computeBlindScore(avg)
      return {
        bowlerId: s.bowlerId,
        bowlerName: s.bowlerName,
        game1: blindScore,
        game2: blindScore,
        game3: blindScore,
        series: blindScore !== null ? blindScore * 3 : null,
        blinded: true,
        rollingGames: s.rollingGames ?? null,
        avgBeforeThisWeek: computeAvgBeforeThisWeek(s),
      }
    }
    return {
      bowlerId: s.bowlerId,
      bowlerName: s.bowlerName,
      game1: s.game1,
      game2: s.game2,
      game3: s.game3,
      series: s.series,
      blinded: s.blinded,
      rollingGames: s.rollingGames ?? null,
      avgBeforeThisWeek: computeAvgBeforeThisWeek(s),
    }
  }

  if (roster.length === 0) {
    return scores.map(resolveScore)
  }

  const scoreMap = new Map(scores.map(s => [s.bowlerId, s]))

  const rows: MatchupBowlerRow[] = roster.map(b => {
    const score = scoreMap.get(b.id!)
    if (score) return resolveScore(score)

    // Bowler is on the roster but has no score record — show as absent (dashes).
    // No blind badge: absence without a recorded blind means the score did not
    // count toward the team total this week.
    const enteringAvg = b.enteringAvg ?? 0
    return {
      bowlerId: b.id!,
      bowlerName: b.name,
      game1: null,
      game2: null,
      game3: null,
      series: null,
      blinded: false,
      rollingGames: null,
      avgBeforeThisWeek: enteringAvg > 0 ? enteringAvg : null,
    }
  })

  // Apply blind selection rule: of all rows marked blinded, only the top N
  // (by games-before-this-week desc, then avg desc) actually count.
  // Excess blind rows are demoted to absent so they show dashes and no B badge.
  const actualBowlerCount = rows.filter(r =>
    !r.blinded && (r.game1 !== null || r.game2 !== null || r.game3 !== null)
  ).length
  const allowedBlinds = Math.min(3, Math.max(0, 4 - actualBowlerCount))
  const blindRows = rows.filter(r => r.blinded)

  if (blindRows.length > allowedBlinds) {
    blindRows.sort((a, b) => {
      const gA = a.rollingGames ?? 0
      const gB = b.rollingGames ?? 0
      if (gB !== gA) return gB - gA
      return (b.avgBeforeThisWeek ?? 0) - (a.avgBeforeThisWeek ?? 0)
    })
    const selectedIds = new Set(blindRows.slice(0, allowedBlinds).map(r => r.bowlerId))
    return rows.map(r =>
      r.blinded && !selectedIds.has(r.bowlerId)
        ? { ...r, blinded: false, game1: null, game2: null, game3: null, series: null }
        : r
    )
  }

  return rows
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface MatchupDetailModalProps {
  /** Firestore document ID of the matchup detail to display, or null when closed. */
  matchupId: string | null
  onClose: () => void
  onSelectBowler: (bowlerId: string) => void
}

/**
 * MatchupDetailModal component.
 *
 * @param matchupId       - Firestore document ID to look up, or null to hide the modal.
 * @param onClose         - Callback invoked when the modal requests dismissal.
 * @param onSelectBowler  - Callback for bowler profile drill-through.
 * @returns Modal JSX when open and data is available, null otherwise.
 */
function MatchupDetailModal({ matchupId, onClose, onSelectBowler }: MatchupDetailModalProps) {
  const SEASON_YEAR = useSeasonYear()
  const { data: match, loading } = useMatchupDetail(matchupId)
  const isOpen = matchupId !== null

  // Individual bowler scores for each team — hooks skip when match hasn't loaded
  const { data: team1ScoresRaw } = useBowlerScoresByTeamWeek(match?.team1?.teamId, match?.week, SEASON_YEAR)
  const { data: team2ScoresRaw } = useBowlerScoresByTeamWeek(match?.team2?.teamId, match?.week, SEASON_YEAR)

  // Client-side filter guards against stale data from a prior unconstrained subscription
  const team1Scores = team1ScoresRaw.filter(s => s.teamId === match?.team1?.teamId)
  const team2Scores = team2ScoresRaw.filter(s => s.teamId === match?.team2?.teamId)

  // Always load the full roster for both teams so we can detect absent bowlers
  // and synthesize blind rows for any who have no score record this week.
  const { data: team1Roster } = useBowlers(SEASON_YEAR, match?.team1?.teamId ?? '__never__')
  const { data: team2Roster } = useBowlers(SEASON_YEAR, match?.team2?.teamId ?? '__never__')

  /* ── Lock body scroll while open ────────────────────────────────────────── */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  /* ── Escape key handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="matchup-modal-content" onClick={e => e.stopPropagation()}>
          <div className="loading">Loading matchup details…</div>
        </div>
      </div>
    )
  }

  if (!match) return null

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString + 'T12:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    })
  }

  // Build display rows first — required to compute corrected scratch totals
  const team1Rows = buildBowlerRows(team1Roster, team1Scores)
  const team2Rows = buildBowlerRows(team2Roster, team2Scores)

  // Compute corrected scratch totals from display rows so blind contributions are
  // included even when stored Firestore totals predate the blind-score pipeline fix.
  // Falls back to stored values when individualScoresUnavailable (manual entry).
  const getScratches = (team: typeof match.team1, rows: MatchupBowlerRow[]): [number, number, number] =>
    team.individualScoresUnavailable
      ? [team.game1Total, team.game2Total, team.game3Total]
      : [
          rows.reduce((s, r) => s + (r.game1 ?? 0), 0),
          rows.reduce((s, r) => s + (r.game2 ?? 0), 0),
          rows.reduce((s, r) => s + (r.game3 ?? 0), 0),
        ]

  const t1Scratches = getScratches(match.team1, team1Rows)
  const t2Scratches = getScratches(match.team2, team2Rows)

  // Handicap-adjusted per-game totals — used for per-game winner colouring.
  // Older Firestore documents only have handicapPerGame, so retain a read-time
  // fallback until those historical records are reingested with per-game fields.
  const getHandicapGames = (team: typeof match.team1): [number, number, number] => {
    const legacyPerGame = (team as typeof team & { handicapPerGame?: number }).handicapPerGame
    const seriesPerGame = Number.isFinite(team.handicapSeries) ? Math.round(team.handicapSeries / 3) : 0
    const fallback = Number.isFinite(legacyPerGame) ? legacyPerGame! : seriesPerGame
    return [team.handicapGame1, team.handicapGame2, team.handicapGame3]
      .map(value => Number.isFinite(value) ? value : fallback) as [number, number, number]
  }

  const t1HandicapGames = getHandicapGames(match.team1)
  const t2HandicapGames = getHandicapGames(match.team2)
  const t1HandicapSeries = Number.isFinite(match.team1.handicapSeries)
    ? match.team1.handicapSeries
    : t1HandicapGames.reduce((sum, value) => sum + value, 0)
  const t2HandicapSeries = Number.isFinite(match.team2.handicapSeries)
    ? match.team2.handicapSeries
    : t2HandicapGames.reduce((sum, value) => sum + value, 0)
  const t1GameTotals = t1Scratches.map((g, i) => g + t1HandicapGames[i])
  const t2GameTotals = t2Scratches.map((g, i) => g + t2HandicapGames[i])
  const t1TotalSeries = t1Scratches.reduce((s, g) => s + g, 0) + t1HandicapSeries
  const t2TotalSeries = t2Scratches.reduce((s, g) => s + g, 0) + t2HandicapSeries

  // Winner determined from corrected totals, not stale stored totalSeries
  const team1Won = t1TotalSeries > t2TotalSeries
  const team2Won = t2TotalSeries > t1TotalSeries

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="matchup-modal-content" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <div className="matchup-header-info">
            <h2>Week {match.week} Matchup</h2>
            <span className="matchup-date">{formatDate(match.date)}</span>
          </div>
          <button className="modal-close-button" onClick={onClose} aria-label="Close matchup detail">
            ✕
          </button>
        </div>

        <div className="modal-body matchup-body">
          <div className="matchup-teams">
            {[match.team1, match.team2].map((team, idx) => {
              const isWinner = idx === 0 ? team1Won : team2Won
              const rows = idx === 0 ? team1Rows : team2Rows
              const roster = idx === 0 ? team1Roster : team2Roster
              // Fall back to stored teamAvg when individual scores were not recorded
              const teamAvg = team.individualScoresUnavailable
                ? team.teamAvg
                : computeTeamAvgFromRows(rows)

              // Use pre-computed corrected totals (blind contributions included)
              const [scratchGame1, scratchGame2, scratchGame3] = idx === 0 ? t1Scratches : t2Scratches
              const scratchTotal  = scratchGame1 + scratchGame2 + scratchGame3
              const grandTotal    = idx === 0 ? t1TotalSeries : t2TotalSeries
              const handicapGames = idx === 0 ? t1HandicapGames : t2HandicapGames
              const handicapSeries = idx === 0 ? t1HandicapSeries : t2HandicapSeries

              // Per-game totals vs opponent for cell-level win/loss colouring
              const myGameTotals  = idx === 0 ? t1GameTotals : t2GameTotals
              const oppGameTotals = idx === 0 ? t2GameTotals : t1GameTotals
              const oppTotalSeries = idx === 0 ? t2TotalSeries : t1TotalSeries
              const gameClass = (i: number) =>
                myGameTotals[i] > oppGameTotals[i] ? 'game-cell-win'
                : myGameTotals[i] < oppGameTotals[i] ? 'game-cell-loss' : ''
              const seriesClass = grandTotal > oppTotalSeries ? 'game-cell-win'
                : grandTotal < oppTotalSeries ? 'game-cell-loss' : ''

              return (
                <div key={team.teamId} className={`matchup-team-panel ${isWinner ? 'winner-panel' : ''}`}>
                  <div className="team-panel-header">
                    <span className={`team-panel-name ${isWinner ? 'winner' : ''}`}>{team.teamName}</span>
                    <span className="team-panel-lane">Lane {team.lane}</span>
                  </div>

                  {/*
                    Two-table layout so Scratch / Handicap / Total always pin to
                    the bottom of both equally-tall grid cells regardless of how
                    many bowlers each team has.
                  */}
                  <div className="scores-table-wrapper">

                    <table className="matchup-scores-table bowler-table">
                      <thead>
                        <tr>
                          <th className="col-name"></th>
                          <th className="col-avg">Avg</th>
                          <th className="col-game">G1</th>
                          <th className="col-game">G2</th>
                          <th className="col-game">G3</th>
                          <th className="col-series">Series</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.individualScoresUnavailable ? (
                          /*
                           * Per-bowler scores were not recorded — show roster names with
                           * dash placeholders so the scorecard still lists the players.
                           */
                          roster.length > 0 ? roster.map(b => (
                            <tr key={b.id} className="scores-unavailable-row">
                              <td className="col-name">{b.name}</td>
                              <td className="col-avg scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td>
                            </tr>
                          )) : (
                            <tr className="scores-unavailable-row">
                              <td className="col-name scores-unavailable-label">* Individual scores not available</td>
                              <td className="col-avg scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td>
                            </tr>
                          )
                        ) : (
                          rows.map((row) => (
                            <tr
                              key={row.bowlerId}
                              className={`bowler-score-row${row.blinded ? ' blinded-score-row' : ''}`}
                              onClick={() => onSelectBowler(row.bowlerId)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td className="col-name">
                                <span className="bowler-name-text">{row.bowlerName}</span>
                                {row.blinded && (
                                  <span
                                    className="blind-badge"
                                    title="Blind score — bowler was absent; score computed from their average"
                                  >B</span>
                                )}
                              </td>
                              <td className="col-avg">{row.avgBeforeThisWeek ?? '—'}</td>
                              <td className="col-game">
                                {row.blinded && <span className="blind-cell-label">Blind</span>}
                                {row.game1 ?? '—'}
                              </td>
                              <td className="col-game">
                                {row.blinded && <span className="blind-cell-label">Blind</span>}
                                {row.game2 ?? '—'}
                              </td>
                              <td className="col-game">
                                {row.blinded && <span className="blind-cell-label">Blind</span>}
                                {row.game3 ?? '—'}
                              </td>
                              <td className="col-series">
                                {row.blinded && <span className="blind-cell-label">Blind</span>}
                                {row.series ?? '—'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {team.individualScoresUnavailable && (
                      <p className="scores-unavailable-legend">
                        * Individual bowler scores were not recorded for this matchup.
                        Team game totals and match points are accurate.
                      </p>
                    )}

                    {/* Totals — pinned to the bottom of the panel */}
                    <table className="matchup-scores-table totals-table">
                      <tbody>
                        <tr className="totals-row team-avg-row">
                          <td className="col-name">Team Avg</td>
                          <td className="col-avg">{teamAvg || '—'}</td>
                          <td className="col-game"></td>
                          <td className="col-game"></td>
                          <td className="col-game"></td>
                          <td className="col-series"></td>
                        </tr>
                        <tr className="totals-row scratch-row">
                          <td className="col-name">Scratch</td>
                          <td className="col-avg"></td>
                          {team.individualScoresUnavailable ? (
                            <><td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td></>
                          ) : (
                            <><td className="col-game">{scratchGame1}</td>
                              <td className="col-game">{scratchGame2}</td>
                              <td className="col-game">{scratchGame3}</td>
                              <td className="col-series">{scratchTotal}</td></>
                          )}
                        </tr>
                        <tr className="totals-row handicap-row">
                          <td className="col-name">Handicap</td>
                          <td className="col-avg"></td>
                          {team.individualScoresUnavailable ? (
                            <><td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-game scores-unavailable-cell">—</td>
                              <td className="col-series scores-unavailable-cell">—</td></>
                          ) : (
                            <><td className="col-game">+{handicapGames[0]}</td>
                              <td className="col-game">+{handicapGames[1]}</td>
                              <td className="col-game">+{handicapGames[2]}</td>
                              <td className="col-series">+{handicapSeries}</td></>
                          )}
                        </tr>
                        <tr className={`totals-row grand-total-row ${isWinner ? 'winner' : ''}`}>
                          <td className="col-name">Total</td>
                          <td className="col-avg"></td>
                          <td className={`col-game ${gameClass(0)}`}>{scratchGame1 + handicapGames[0]}</td>
                          <td className={`col-game ${gameClass(1)}`}>{scratchGame2 + handicapGames[1]}</td>
                          <td className={`col-game ${gameClass(2)}`}>{scratchGame3 + handicapGames[2]}</td>
                          <td className={`col-series ${seriesClass}`}>
                            {team.individualScoresUnavailable ? (
                              team.totalSeries
                            ) : (
                              <>
                                <span title={`Scratch: ${scratchTotal} + HDCP: ${handicapSeries}`}>
                                  {grandTotal}
                                </span>
                                {handicapSeries > 0 && (
                                  <span
                                    className="score-hcp"
                                    title={`Scratch: ${scratchTotal} + HDCP: ${handicapSeries}`}
                                  >
                                    (+{handicapSeries})
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>

                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

export default MatchupDetailModal
