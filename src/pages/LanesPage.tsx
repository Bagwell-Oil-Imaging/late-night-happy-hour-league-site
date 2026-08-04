/**
 * @file LanesPage.tsx
 * @component LanesPage
 *
 * Visualizes per-lane-pair bowling performance analytics for the 2025-2026
 * season. Each lane pair in the league gets a card featuring a top-down SVG
 * illustration of the pair plus aggregate stats (avg scratch, high series,
 * match count, top team). Clicking a card expands a detail panel with full
 * team-by-team breakdowns for that pair.
 *
 * Data is aggregated client-side from `useMatchupDetails` — each MatchupDetail
 * carries the lane number for both teams, which normalises to the odd (base)
 * lane to identify the pair.
 */

import { useMemo, useState } from 'react'
import { useMatchupDetails, useBowlers, useBowlerScores } from '../hooks'
import { useSeasonStatus } from '../context/SeasonContext'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import type { MatchupDetail } from '../types'
import './LanesPage.css'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamLaneRecord {
  teamId: string
  teamName: string
  appearances: number
  totalScratch: number
  totalHandicap: number
  avgScratch: number
  avgHandicap: number
  wins: number
  losses: number
  ties: number
}

export interface LanePairData {
  baseLane: number
  label: string
  appearances: number
  avgScratch: number
  avgHandicap: number
  highScratch: number
  teams: TeamLaneRecord[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Lane pair SVG graphic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders a top-down SVG illustration of a bowling lane pair.
 * Shows pin formation, targeting arrows, foul line, approach dots,
 * and lane numbers using a warm wood-grain colour scheme.
 *
 * @param baseLane - Odd lane number (e.g. 5 for lanes 5 | 6)
 * @param active   - Whether the parent card is currently selected
 */
export function LanePairGraphic({ baseLane, active }: { baseLane: number; active: boolean }) {
  const W = 260, H = 150
  // Layout: outer gutter | left lane | center gutter | right lane | outer gutter
  // 18 + 106 + 12 + 106 + 18 = 260 ✓
  const gutterW = 18, laneW = 106, centerW = 12
  const lx = gutterW                       // left lane start x = 18
  const rx = gutterW + laneW + centerW     // right lane start x = 136
  const lc = lx + laneW / 2               // left center  = 71
  const rc = rx + laneW / 2               // right center = 189
  const foulY = 108
  const arrowY = 82
  const uid = `lp-${baseLane}`

  /** 10 pin positions in equilateral triangle, top-to-bottom (back→front). */
  function pinPositions(cx: number): [number, number][] {
    const sp = 8.5, pr_y = 8  // horizontal spacing, starting y
    return [
      [cx - 1.5 * sp, pr_y + 6],  [cx - 0.5 * sp, pr_y + 6],
      [cx + 0.5 * sp, pr_y + 6],  [cx + 1.5 * sp, pr_y + 6],  // row 4 (back)
      [cx - sp,        pr_y + 14], [cx,              pr_y + 14], [cx + sp, pr_y + 14], // row 3
      [cx - sp / 2,    pr_y + 22], [cx + sp / 2,    pr_y + 22],                        // row 2
      [cx,             pr_y + 30],                                                       // head pin
    ]
  }

  /** X positions of the 7 targeting arrows at board positions 5,10,15,20,25,30,35. */
  function arrowXs(laneX: number): number[] {
    return [5, 10, 15, 20, 25, 30, 35].map(b => laneX + laneW * (b / 39))
  }

  /** X positions of subtle vertical board lines every 6 boards. */
  function boardLineXs(laneX: number): number[] {
    return [6, 12, 18, 24, 30, 36].map(b => laneX + laneW * (b / 39))
  }

  /** Approach dot x positions (5 evenly-spaced). */
  const dotOffsets = [0.18, 0.34, 0.50, 0.66, 0.82]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`lane-svg${active ? ' lane-svg-active' : ''}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#1d1208" />
          <stop offset="25%"  stopColor="#241709" />
          <stop offset="55%"  stopColor="#1c1308" />
          <stop offset="85%"  stopColor="#231608" />
          <stop offset="100%" stopColor="#1a1107" />
        </linearGradient>
        <linearGradient id={`${uid}-approach`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#130f0c" />
          <stop offset="100%" stopColor="#0c0a08" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="40%" r="55%">
          <stop offset="0%"   stopColor="rgba(240,180,41,0.10)" />
          <stop offset="100%" stopColor="rgba(240,180,41,0)" />
        </radialGradient>
      </defs>

      {/* Alley floor */}
      <rect width={W} height={H} fill="#07040b" />

      {/* Lane bodies */}
      <rect x={lx} y={0} width={laneW} height={foulY} fill={`url(#${uid}-wood)`} />
      <rect x={rx} y={0} width={laneW} height={foulY} fill={`url(#${uid}-wood)`} />

      {/* Board grain lines */}
      {[lx, rx].flatMap(laneX =>
        boardLineXs(laneX).map((bx, i) => (
          <line key={`${laneX}-${i}`} x1={bx} y1={0} x2={bx} y2={foulY}
            stroke="rgba(0,0,0,0.22)" strokeWidth="0.7" />
        ))
      )}

      {/* Centre board highlight */}
      <line x1={lc} y1={0} x2={lc} y2={foulY} stroke="rgba(240,180,41,0.07)" strokeWidth="1.2" />
      <line x1={rc} y1={0} x2={rc} y2={foulY} stroke="rgba(240,180,41,0.07)" strokeWidth="1.2" />

      {/* Approach areas (below foul line) */}
      <rect x={lx} y={foulY} width={laneW} height={H - foulY} fill={`url(#${uid}-approach)`} />
      <rect x={rx} y={foulY} width={laneW} height={H - foulY} fill={`url(#${uid}-approach)`} />

      {/* Active glow overlay */}
      {active && (
        <>
          <rect x={lx} y={0} width={laneW} height={foulY} fill={`url(#${uid}-glow)`} />
          <rect x={rx} y={0} width={laneW} height={foulY} fill={`url(#${uid}-glow)`} />
        </>
      )}

      {/* Lane edge lines */}
      {[lx, lx + laneW, rx, rx + laneW].map((bx, i) => (
        <line key={i} x1={bx} y1={0} x2={bx} y2={foulY}
          stroke="rgba(240,180,41,0.16)" strokeWidth="1" />
      ))}

      {/* Pins */}
      {[lc, rc].flatMap(cx =>
        pinPositions(cx).map(([px, py], i) => (
          <g key={`${cx}-${i}`}>
            <circle cx={px} cy={py} r={3.5} fill="rgba(0,0,0,0.55)" />
            <circle cx={px} cy={py} r={2.8} fill="#dcc89a" stroke="rgba(255,255,255,0.22)" strokeWidth="0.5" />
          </g>
        ))
      )}

      {/* Targeting arrows */}
      {[lx, rx].flatMap(laneX =>
        arrowXs(laneX).map((ax, i) => (
          <polygon key={`${laneX}-${i}`}
            points={`${ax},${arrowY - 5} ${ax - 3},${arrowY + 4} ${ax + 3},${arrowY + 4}`}
            fill={`rgba(240,180,41,${i === 3 ? 0.78 : 0.30})`}
          />
        ))
      )}

      {/* Foul lines */}
      <line x1={lx} y1={foulY} x2={lx + laneW} y2={foulY} stroke="rgba(240,180,41,0.70)" strokeWidth="2" />
      <line x1={rx} y1={foulY} x2={rx + laneW} y2={foulY} stroke="rgba(240,180,41,0.70)" strokeWidth="2" />

      {/* Approach dots — row 1 (7-ft mark) */}
      {[lx, rx].flatMap(laneX =>
        dotOffsets.map((t, i) => (
          <circle key={`${laneX}-a-${i}`} cx={laneX + laneW * t} cy={120} r={2}
            fill="rgba(240,180,41,0.24)" />
        ))
      )}

      {/* Approach dots — row 2 (12-ft mark) */}
      {[lx, rx].flatMap(laneX =>
        dotOffsets.map((t, i) => (
          <circle key={`${laneX}-b-${i}`} cx={laneX + laneW * t} cy={133} r={2}
            fill="rgba(240,180,41,0.14)" />
        ))
      )}

      {/* Lane number labels */}
      {[[lc, baseLane], [rc, baseLane + 1]].map(([cx, num]) => (
        <text key={String(num)} x={cx} y={H - 3} textAnchor="middle"
          fill="rgba(240,180,41,0.50)" fontSize="9"
          fontFamily="'Barlow Semi Condensed', sans-serif" fontWeight="700" letterSpacing="0.5">
          {num}
        </text>
      ))}
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Data aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates matchupDetails into per-lane-pair stats.
 * Both teams in a matchup bowl on the same lane pair; their `lane` field
 * identifies which side they started on. The odd lane is always the pair key.
 *
 * @param matchupDetails - All MatchupDetail records for the season
 * @returns Array of LanePairData sorted by ascending lane number
 */
export function aggregateLaneData(matchupDetails: MatchupDetail[]): LanePairData[] {
  const map = new Map<number, {
    baseLane: number
    appearances: number
    totalScratch: number
    totalHandicap: number
    highScratch: number
    teamMap: Map<string, {
      teamId: string; teamName: string
      appearances: number; totalScratch: number; totalHandicap: number
      wins: number; losses: number; ties: number
    }>
  }>()

  for (const d of matchupDetails) {
    const raw = d.team1.lane
    if (!raw || raw <= 0) continue
    const base = raw % 2 === 1 ? raw : raw - 1

    if (!map.has(base)) {
      map.set(base, {
        baseLane: base, appearances: 0,
        totalScratch: 0, totalHandicap: 0, highScratch: 0,
        teamMap: new Map(),
      })
    }

    const entry = map.get(base)!
    entry.appearances++

    const t1Won = d.team1.totalSeries > d.team2.totalSeries
    const t2Won = d.team2.totalSeries > d.team1.totalSeries

    const pairs: [typeof d.team1, boolean, boolean][] = [
      [d.team1, t1Won, t2Won],
      [d.team2, t2Won, t1Won],
    ]

    for (const [ts, won, lost] of pairs) {
      entry.totalScratch += ts.scratchSeries
      entry.totalHandicap += ts.totalSeries
      if (ts.scratchSeries > entry.highScratch) entry.highScratch = ts.scratchSeries

      if (!entry.teamMap.has(ts.teamId)) {
        entry.teamMap.set(ts.teamId, {
          teamId: ts.teamId, teamName: ts.teamName,
          appearances: 0, totalScratch: 0, totalHandicap: 0,
          wins: 0, losses: 0, ties: 0,
        })
      }
      const t = entry.teamMap.get(ts.teamId)!
      t.appearances++
      t.totalScratch += ts.scratchSeries
      t.totalHandicap += ts.totalSeries
      if (won) t.wins++
      else if (lost) t.losses++
      else t.ties++
    }
  }

  return Array.from(map.values())
    .map(({ teamMap, ...rest }) => ({
      ...rest,
      label: `${rest.baseLane} | ${rest.baseLane + 1}`,
      avgScratch:  rest.appearances > 0 ? Math.round(rest.totalScratch  / (rest.appearances * 2)) : 0,
      avgHandicap: rest.appearances > 0 ? Math.round(rest.totalHandicap / (rest.appearances * 2)) : 0,
      teams: Array.from(teamMap.values())
        .map(t => ({
          ...t,
          avgScratch:  Math.round(t.totalScratch  / t.appearances),
          avgHandicap: Math.round(t.totalHandicap / t.appearances),
        }))
        .sort((a, b) => b.wins - a.wins || b.avgScratch - a.avgScratch),
    }))
    .sort((a, b) => a.baseLane - b.baseLane)
}

// ─────────────────────────────────────────────────────────────────────────────
// Page component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LanesPage component.
 *
 * @returns Lane analytics page with SVG lane pair cards and an expandable
 *   detail panel showing per-team performance on each pair.
 */
function LanesPage() {
  const [selectedLane, setSelectedLane] = useState<number | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)
  const { seasonActive, loading: seasonStatusLoading } = useSeasonStatus()

  const { data: matchupDetails, loading } = useMatchupDetails('2025-2026')
  const { data: bowlers } = useBowlers('2025-2026', selectedTeamId ?? undefined)
  const { data: bowlerScores } = useBowlerScores(selectedBowlerId ?? '__never__', '2025-2026')

  const laneData = useMemo(() => aggregateLaneData(matchupDetails), [matchupDetails])

  /** All unique teams across every lane pair, sorted alphabetically. */
  const allTeams = useMemo(() => {
    const map = new Map<string, { teamId: string; teamName: string }>()
    for (const lane of laneData) {
      for (const t of lane.teams) {
        if (!map.has(t.teamId)) map.set(t.teamId, { teamId: t.teamId, teamName: t.teamName })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.teamName.localeCompare(b.teamName))
  }, [laneData])

  /** Bowlers for the currently selected team, sorted by name. */
  const teamBowlerList = useMemo(() =>
    selectedTeamId
      ? [...bowlers].sort((a, b) => a.name.localeCompare(b.name))
      : [],
    [bowlers, selectedTeamId]
  )

  /** Per-base-lane stats for the selected bowler, keyed by base lane number. */
  const bowlerLaneStats = useMemo(() => {
    if (!selectedBowlerId || !bowlerScores.length) return null
    const map = new Map<number, { appearances: number; totalScratch: number; highSeries: number }>()
    for (const s of bowlerScores) {
      if (s.blinded || s.series === null) continue
      const base = s.lanePair % 2 === 1 ? s.lanePair : s.lanePair - 1
      if (!map.has(base)) map.set(base, { appearances: 0, totalScratch: 0, highSeries: 0 })
      const e = map.get(base)!
      e.appearances++
      e.totalScratch += s.series
      if (s.series > e.highSeries) e.highSeries = s.series
    }
    return map
  }, [bowlerScores, selectedBowlerId])

  /** Selected bowler's individual game scores on the selected lane pair. */
  const bowlerWeeklyScoresForLane = useMemo(() => {
    if (!selectedBowlerId || !selectedLane) return []
    return bowlerScores
      .filter(s => {
        const base = s.lanePair % 2 === 1 ? s.lanePair : s.lanePair - 1
        return base === selectedLane && !s.blinded
      })
      .sort((a, b) => a.week - b.week)
  }, [bowlerScores, selectedBowlerId, selectedLane])

  const selectedData = laneData.find(l => l.baseLane === selectedLane) ?? null

  /** Weekly scores for the selected team on the selected lane pair, sorted by week. */
  const teamWeeklyScores = useMemo(() => {
    if (!selectedData || !selectedTeamId || selectedBowlerId) return []
    return matchupDetails
      .filter(d => {
        const raw = d.team1.lane
        const base = raw % 2 === 1 ? raw : raw - 1
        return base === selectedData.baseLane &&
          (d.team1.teamId === selectedTeamId || d.team2.teamId === selectedTeamId)
      })
      .sort((a, b) => a.week - b.week)
      .map(d => {
        const isTeam1 = d.team1.teamId === selectedTeamId
        const my  = isTeam1 ? d.team1 : d.team2
        const opp = isTeam1 ? d.team2 : d.team1
        return { week: d.week, date: d.date, my, opp,
          won:  my.totalSeries > opp.totalSeries,
          lost: my.totalSeries < opp.totalSeries,
        }
      })
  }, [matchupDetails, selectedData, selectedTeamId, selectedBowlerId])

  if (!seasonStatusLoading && !seasonActive) {
    return (
      <SeasonPlaceholder
        pageTitle="Lane Analytics"
        whatYoullSee="you'll see lane-pair performance analytics for the season."
      />
    )
  }

  if (loading) return <div className="loading">Loading lanes…</div>

  /** Toggle lane selection; selected team persists across lane changes for easy comparison. */
  const handleCardClick = (baseLane: number) => {
    setSelectedLane(prev => prev === baseLane ? null : baseLane)
  }

  const formatDate = (s: string) => {
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className="lanes-page">
      <div className="lanes-page-header">
        <h2 className="section-title">Lanes</h2>
        <span className="lanes-page-subtitle">2025–2026 Season · Lane Performance Analytics</span>
      </div>

      {/* Global team filter */}
      {allTeams.length > 0 && (
        <div className="ld-team-selector lanes-team-selector">
          <span className="ld-team-selector-label">Filter by team</span>
          <div className="ld-team-pills">
            <button
              className={`ld-team-pill${selectedTeamId === null ? ' ld-team-pill-active' : ''}`}
              onClick={() => { setSelectedTeamId(null); setSelectedBowlerId(null) }}
            >
              All
            </button>
            {allTeams.map(t => (
              <button
                key={t.teamId}
                className={`ld-team-pill${selectedTeamId === t.teamId ? ' ld-team-pill-active' : ''}`}
                onClick={() => {
                  setSelectedTeamId(prev => prev === t.teamId ? null : t.teamId)
                  setSelectedBowlerId(null)
                }}
              >
                {t.teamName}
              </button>
            ))}
          </div>

          {/* Bowler pills — appear when a team is selected */}
          {selectedTeamId && teamBowlerList.length > 0 && (
            <div className="lanes-bowler-pills">
              {teamBowlerList.map(b => (
                <button
                  key={b.leaguePalsId}
                  className={`lanes-bowler-pill${selectedBowlerId === b.leaguePalsId ? ' lanes-bowler-pill-active' : ''}`}
                  onClick={() => setSelectedBowlerId(prev => prev === b.leaguePalsId ? null : b.leaguePalsId)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lane pair card grid */}
      <div className="lanes-grid">
        {laneData.map(lane => {
          const active = selectedLane === lane.baseLane
          const teamRecord = (!selectedBowlerId && selectedTeamId)
            ? (lane.teams.find(t => t.teamId === selectedTeamId) ?? null)
            : null
          const bowlerRecord = bowlerLaneStats?.get(lane.baseLane) ?? null

          return (
            <button
              key={lane.baseLane}
              className={`lane-card${active ? ' lane-card-active' : ''}${teamRecord || bowlerRecord ? ' lane-card-team-match' : ''}`}
              onClick={() => handleCardClick(lane.baseLane)}
              aria-pressed={active}
              aria-label={`Lanes ${lane.label} — ${lane.appearances} matches`}
            >
              <LanePairGraphic baseLane={lane.baseLane} active={active} />

              <div className="lane-card-body">
                <div className="lc-title-row">
                  <span className="lc-label-prefix">Lanes</span>
                  <div className="lc-number-row">
                    <span className="lc-number">{lane.label}</span>
                    {active && <span className="lc-active-pip" aria-hidden="true" />}
                  </div>
                </div>

                <div className="lc-stats">
                  {bowlerRecord ? (
                    <>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{bowlerRecord.appearances}</span>
                        <span className="lc-stat-lbl">Games</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">
                          {bowlerRecord.appearances > 0
                            ? Math.round(bowlerRecord.totalScratch / bowlerRecord.appearances)
                            : '—'}
                        </span>
                        <span className="lc-stat-lbl">Avg</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{bowlerRecord.highSeries}</span>
                        <span className="lc-stat-lbl">High Series</span>
                      </div>
                    </>
                  ) : teamRecord ? (
                    <>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{teamRecord.appearances}</span>
                        <span className="lc-stat-lbl">App</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{teamRecord.wins}–{teamRecord.losses}</span>
                        <span className="lc-stat-lbl">W-L</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{teamRecord.avgScratch.toLocaleString()}</span>
                        <span className="lc-stat-lbl">Avg Scratch</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{lane.appearances}</span>
                        <span className="lc-stat-lbl">Matches</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{lane.avgScratch.toLocaleString()}</span>
                        <span className="lc-stat-lbl">Avg Scratch</span>
                      </div>
                      <div className="lc-stat">
                        <span className="lc-stat-val">{lane.highScratch.toLocaleString()}</span>
                        <span className="lc-stat-lbl">High Scratch</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Expanded detail panel */}
      {selectedData && (
        <div className="lane-detail" role="region" aria-label={`Detail for lanes ${selectedData.label}`}>
          <div className="ld-header">
            <div className="ld-title-block">
              <span className="ld-lanes-label">Lanes</span>
              <span className="ld-lanes-num">{selectedData.label}</span>
            </div>
            <div className="ld-summary-pills">
              <span className="ld-pill">{selectedData.appearances} matches</span>
              <span className="ld-pill">Avg scratch {selectedData.avgScratch.toLocaleString()}</span>
              <span className="ld-pill">Avg total {selectedData.avgHandicap.toLocaleString()}</span>
              <span className="ld-pill ld-pill-gold">High {selectedData.highScratch.toLocaleString()}</span>
            </div>
          </div>

          {/* Bowler game-by-game scores on this lane pair */}
          {selectedBowlerId && bowlerWeeklyScoresForLane.length > 0 ? (
            <table className="ld-table">
              <thead>
                <tr>
                  <th className="ld-th ld-col-wk">Week</th>
                  <th className="ld-th ld-col-num">G1</th>
                  <th className="ld-th ld-col-num">G2</th>
                  <th className="ld-th ld-col-num">G3</th>
                  <th className="ld-th ld-col-score">Series</th>
                </tr>
              </thead>
              <tbody>
                {bowlerWeeklyScoresForLane.map(s => (
                  <tr key={s.week} className="ld-row">
                    <td className="ld-td ld-col-wk"><span className="ld-wk-badge">WK {s.week}</span></td>
                    <td className="ld-td ld-col-num">{s.game1 ?? '—'}</td>
                    <td className="ld-td ld-col-num">{s.game2 ?? '—'}</td>
                    <td className="ld-td ld-col-num">{s.game3 ?? '—'}</td>
                    <td className="ld-td ld-col-score">{s.series ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : selectedBowlerId && bowlerWeeklyScoresForLane.length === 0 ? (
            <p className="ld-empty">No scores recorded on this lane pair for the selected bowler.</p>
          ) : /* Weekly scores for selected team OR aggregate table */
          selectedTeamId && teamWeeklyScores.length > 0 ? (
            <table className="ld-table">
              <thead>
                <tr>
                  <th className="ld-th ld-col-wk">Week</th>
                  <th className="ld-th ld-col-name">Date · Opponent</th>
                  <th className="ld-th ld-col-num">Result</th>
                  <th className="ld-th ld-col-num">G1</th>
                  <th className="ld-th ld-col-num">G2</th>
                  <th className="ld-th ld-col-num">G3</th>
                  <th className="ld-th ld-col-score">Scratch</th>
                  <th className="ld-th ld-col-score">+Hdcp</th>
                  <th className="ld-th ld-col-score">Total</th>
                </tr>
              </thead>
              <tbody>
                {teamWeeklyScores.map(({ week, date, my, opp, won, lost }) => (
                  <tr key={week} className="ld-row">
                    <td className="ld-td ld-col-wk">
                      <span className="ld-wk-badge">WK {week}</span>
                    </td>
                    <td className="ld-td ld-col-name">
                      {formatDate(date)} <span className="ld-vs">vs</span> {opp.teamName}
                    </td>
                    <td className="ld-td ld-col-num">
                      <span className={`ld-result-chip ${won ? 'chip-win' : lost ? 'chip-loss' : 'chip-tie'}`}>
                        {won ? 'W' : lost ? 'L' : 'T'}
                      </span>
                    </td>
                    <td className="ld-td ld-col-num">{my.game1Total}</td>
                    <td className="ld-td ld-col-num">{my.game2Total}</td>
                    <td className="ld-td ld-col-num">{my.game3Total}</td>
                    <td className="ld-td ld-col-score">{my.scratchSeries}</td>
                    <td className="ld-td ld-col-score ld-hdcp">+{my.handicapSeries}</td>
                    <td className={`ld-td ld-col-score ${won ? 'ld-wins' : lost ? 'ld-losses' : ''}`}>
                      {my.totalSeries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="ld-table">
              <thead>
                <tr>
                  <th className="ld-th ld-col-rank">#</th>
                  <th className="ld-th ld-col-name">Team</th>
                  <th className="ld-th ld-col-num">App</th>
                  <th className="ld-th ld-col-num">W</th>
                  <th className="ld-th ld-col-num">L</th>
                  <th className="ld-th ld-col-num">T</th>
                  <th className="ld-th ld-col-score">Avg Scratch</th>
                  <th className="ld-th ld-col-score">Avg Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedData.teams.map((t, i) => (
                  <tr key={t.teamId} className={`ld-row${i === 0 ? ' ld-row-first' : ''}`}>
                    <td className="ld-td ld-col-rank">
                      {i === 0 ? <span className="ld-rank-star">★</span> : i + 1}
                    </td>
                    <td className="ld-td ld-col-name">{t.teamName}</td>
                    <td className="ld-td ld-col-num">{t.appearances}</td>
                    <td className="ld-td ld-col-num ld-wins">{t.wins}</td>
                    <td className="ld-td ld-col-num ld-losses">{t.losses}</td>
                    <td className="ld-td ld-col-num">{t.ties}</td>
                    <td className="ld-td ld-col-score">{t.avgScratch.toLocaleString()}</td>
                    <td className="ld-td ld-col-score">{t.avgHandicap.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default LanesPage
