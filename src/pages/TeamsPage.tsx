/**
 * @file TeamsPage.tsx
 * @component TeamsPage
 *
 * Redesigned teams page with a two-panel layout: a ranked sidebar roster on
 * the left and a detail panel on the right showing season stats, a win/loss
 * streak visualizer, and collapsible per-week match cards.
 *
 * UX improvements over the original:
 *  - Sidebar roster replaces the overflowing horizontal pill bar — all 14
 *    teams are visible at once, ranked by standings with W-L and points.
 *  - Week cards are collapsed by default; clicking expands the score table.
 *  - Season summary shows W/L/T, points, win%, and a color-coded streak track.
 *  - Mobile layout stacks sidebar above the detail panel.
 */

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTeams, useMatchupDetails, useMatchups, useBowlerScoresByTeamWeek, useBowlers } from '../hooks'
import StandingsPdfModal from '../components/StandingsPdfModal'
import SeasonPlaceholder from '../components/SeasonPlaceholder'
import { useSeasonStatus } from '../context/SeasonContext'
import { getStandingsPdfId } from '../utils/weeklyStandingsPdf'
import type { TeamSummary, BowlerScore } from '../types'
import { LanePairGraphic, aggregateLaneData } from './LanesPage'
import './TeamsPage.css'
import './LanesPage.css'

/** Single week outcome: W, L, or T. */
type Outcome = 'W' | 'L' | 'T'

/**
 * Formats a lane number as the full pair label ("odd | even").
 * Teams bowl on both lanes in the pair so neither is bolded.
 *
 * @param lane - Either lane number in the pair (odd or even)
 * @returns "X | Y" string, or "—" when lane is absent
 */
function formatLanePair(lane: number | null | undefined): string {
  if (lane == null) return '—'
  const odd = lane % 2 === 1 ? lane : lane - 1
  return `${odd} | ${odd + 1}`
}

/**
 * Renders the expanded accordion detail for a single week card.
 * Extracted into its own component so Firestore hooks are only subscribed
 * when the card is open (conditional rendering at the call site is fine
 * because the hooks live inside this component, not the parent).
 *
 * @param my         - TeamSummary for the selected team
 * @param opp        - TeamSummary for the opposing team
 * @param week       - Week number used to scope the bowler score query
 * @param won        - Whether the selected team won the overall series
 * @param lost       - Whether the selected team lost the overall series
 * @param seasonYear - Season year string for the Firestore query
 * @param onViewPdf  - Optional callback to open the standings PDF for this week
 */
function WeekCardDetail({
  my, opp, week, won: _won, lost: _lost, seasonYear, onViewPdf,
}: {
  my: TeamSummary
  opp: TeamSummary
  week: number
  won: boolean
  lost: boolean
  seasonYear: string
  onViewPdf?: () => void
}) {
  const { data: myScores }  = useBowlerScoresByTeamWeek(my.teamId,  week, seasonYear)
  const { data: oppScores } = useBowlerScoresByTeamWeek(opp.teamId, week, seasonYear)

  // Rosters supply enteringAvg as a fallback for blind bowlers whose rollingAvg is
  // null in Firestore (old pipeline stored null when no games had been accumulated yet).
  const { data: myRoster }  = useBowlers(seasonYear, my.teamId)
  const { data: oppRoster } = useBowlers(seasonYear, opp.teamId)

  const myEnteringAvgMap  = new Map(myRoster.map(b => [b.id!, b.enteringAvg ?? 0]))
  const oppEnteringAvgMap = new Map(oppRoster.map(b => [b.id!, b.enteringAvg ?? 0]))

  // If a BowlerScore is blinded but has null game scores (old pipeline data),
  // compute the blind value from rollingAvg, falling back to roster enteringAvg.
  const makeResolveBlind = (enteringAvgMap: Map<string, number>) => (s: BowlerScore): BowlerScore => {
    if (!s.blinded || s.game1 !== null) return s
    const avg = s.rollingAvg ?? enteringAvgMap.get(s.bowlerId) ?? 0
    if (avg <= 0) return s
    const penalty = Math.floor(avg * 0.10)
    const blind = avg - penalty
    return { ...s, game1: blind, game2: blind, game3: blind, series: blind * 3 }
  }

  const myResolved  = myScores.map(makeResolveBlind(myEnteringAvgMap))
  const oppResolved = oppScores.map(makeResolveBlind(oppEnteringAvgMap))

  // Sort by series descending for display (best scorer first)
  const myBowlers  = [...myResolved].sort((a, b) => (b.series ?? 0) - (a.series ?? 0))
  const oppBowlers = [...oppResolved].sort((a, b) => (b.series ?? 0) - (a.series ?? 0))
  const rowCount   = Math.max(myBowlers.length, oppBowlers.length)

  // Compute scratch game totals from resolved BowlerScore records so blind
  // contributions are included. Fall back to stored values when per-bowler
  // scores were not recorded (individualScoresUnavailable weeks, e.g. St. Hughs).
  const myScratch1 = my.individualScoresUnavailable  ? my.game1Total  : myResolved.reduce((s, r) => s + (r.game1 ?? 0), 0)
  const myScratch2 = my.individualScoresUnavailable  ? my.game2Total  : myResolved.reduce((s, r) => s + (r.game2 ?? 0), 0)
  const myScratch3 = my.individualScoresUnavailable  ? my.game3Total  : myResolved.reduce((s, r) => s + (r.game3 ?? 0), 0)
  const myScratchTotal = myScratch1 + myScratch2 + myScratch3

  const oppScratch1 = opp.individualScoresUnavailable ? opp.game1Total : oppResolved.reduce((s, r) => s + (r.game1 ?? 0), 0)
  const oppScratch2 = opp.individualScoresUnavailable ? opp.game2Total : oppResolved.reduce((s, r) => s + (r.game2 ?? 0), 0)
  const oppScratch3 = opp.individualScoresUnavailable ? opp.game3Total : oppResolved.reduce((s, r) => s + (r.game3 ?? 0), 0)
  const oppScratchTotal = oppScratch1 + oppScratch2 + oppScratch3

  // Handicap-adjusted per-game totals for winner colouring and point calculation
  const myTotals  = [myScratch1 + my.handicapGame1,  myScratch2 + my.handicapGame2,  myScratch3 + my.handicapGame3]
  const oppTotals = [oppScratch1 + opp.handicapGame1, oppScratch2 + opp.handicapGame2, oppScratch3 + opp.handicapGame3]
  const myTotalSeries  = myScratchTotal  + my.handicapSeries
  const oppTotalSeries = oppScratchTotal + opp.handicapSeries

  // Recompute won/lost from corrected totals so series colouring and pts are accurate
  const myWon  = myTotalSeries > oppTotalSeries
  const myLost = myTotalSeries < oppTotalSeries

  // 1pt per game won + 1pt for total series; ties split 0.5
  const gamePoints = (a: number, b: number) => a > b ? 1 : a === b ? 0.5 : 0
  const myPts = myTotals.reduce((sum, myG, i) => sum + gamePoints(myG, oppTotals[i]), 0)
              + gamePoints(myTotalSeries, oppTotalSeries)
  const oppPts = 4 - myPts

  return (
    <div className="wcard-detail-wrapper">
      <div className="wcard-detail">
      {/* Points panels flank the table on each side */}
      <div className="wcd-pts-panel wcd-pts-opp">
        <span className="wcd-pts-label">{opp.teamName}</span>
        <span className="wcd-pts-value">{oppPts % 1 === 0 ? oppPts : oppPts.toFixed(1)}</span>
        <span className="wcd-pts-unit">pts</span>
      </div>

      <table className="wcard-table">
        <thead>
          {/* Team name headers spanning name + G1/G2/G3/Series/Avg columns */}
          <tr>
            <th className="wct-label" />
            <th className="wct-opp-header" colSpan={6}>{opp.teamName}</th>
            <th className="wct-divider-header" />
            <th className="wct-my-header" colSpan={6}>{my.teamName}</th>
          </tr>
          {/* Column labels */}
          <tr className="wct-col-labels">
            <th className="wct-label" />
            <th className="wct-opp-col wct-name-col" />
            <th className="wct-opp-col">G1</th>
            <th className="wct-opp-col">G2</th>
            <th className="wct-opp-col">G3</th>
            <th className="wct-opp-col">Series</th>
            <th className="wct-opp-col wct-avg-col">Avg</th>
            <th className="wct-divider" />
            <th className="wct-name-col" />
            <th>G1</th>
            <th>G2</th>
            <th>G3</th>
            <th>Series</th>
            <th className="wct-avg-col">Avg</th>
          </tr>
        </thead>
        <tbody>
          {/* Bowler rows — one per slot, fills with dash if counts differ */}
          {Array.from({ length: rowCount }).map((_, i) => {
            const ob = oppBowlers[i]
            const mb = myBowlers[i]
            return (
              <tr key={i} className="wct-bowler">
                <td className="wct-label" />
                <td className="wct-opp-col wct-name-col wct-bowler-name">{ob?.bowlerName ?? '—'}</td>
                <td className="wct-opp-col">{ob?.game1 ?? '—'}</td>
                <td className="wct-opp-col">{ob?.game2 ?? '—'}</td>
                <td className="wct-opp-col">{ob?.game3 ?? '—'}</td>
                <td className="wct-opp-col">{ob?.series ?? '—'}</td>
                <td className="wct-opp-col wct-avg-col wct-rolling-avg">{ob?.rollingAvg ?? '—'}</td>
                <td className="wct-divider" />
                <td className="wct-name-col wct-bowler-name">{mb?.bowlerName ?? '—'}</td>
                <td>{mb?.game1 ?? '—'}</td>
                <td>{mb?.game2 ?? '—'}</td>
                <td>{mb?.game3 ?? '—'}</td>
                <td>{mb?.series ?? '—'}</td>
                <td className="wct-avg-col wct-rolling-avg">{mb?.rollingAvg ?? '—'}</td>
              </tr>
            )
          })}

          {/* Scratch totals */}
          <tr className="wct-scratch wct-totals-divider">
            <td>Scratch</td>
            <td className="wct-opp-col wct-name-col" />
            <td className="wct-opp-col">{oppScratch1}</td>
            <td className="wct-opp-col">{oppScratch2}</td>
            <td className="wct-opp-col">{oppScratch3}</td>
            <td className="wct-opp-col">{oppScratchTotal}</td>
            <td className="wct-opp-col" />
            <td className="wct-divider" />
            <td className="wct-name-col" />
            <td>{myScratch1}</td>
            <td>{myScratch2}</td>
            <td>{myScratch3}</td>
            <td>{myScratchTotal}</td>
            <td />
          </tr>

          {/* Handicap row */}
          <tr className="wct-hdcp">
            <td>Handicap</td>
            <td className="wct-opp-col wct-name-col" />
            <td className="wct-opp-col">+{opp.handicapGame1}</td>
            <td className="wct-opp-col">+{opp.handicapGame2}</td>
            <td className="wct-opp-col">+{opp.handicapGame3}</td>
            <td className="wct-opp-col">+{opp.handicapSeries}</td>
            <td className="wct-opp-col" />
            <td className="wct-divider" />
            <td className="wct-name-col" />
            <td>+{my.handicapGame1}</td>
            <td>+{my.handicapGame2}</td>
            <td>+{my.handicapGame3}</td>
            <td>+{my.handicapSeries}</td>
            <td />
          </tr>

          {/* Total row — per-game win/loss colouring */}
          <tr className="wct-total">
            <td>Total</td>
            <td className="wct-opp-col wct-name-col" />
            {oppTotals.map((oppG, i) => {
              const myG = myTotals[i]
              return (
                <td key={i} className={`wct-opp-col ${oppG > myG ? 'wct-game-win-opp' : myG > oppG ? 'wct-game-loss-opp' : ''}`}>
                  {oppG}
                </td>
              )
            })}
            <td className={`wct-opp-col ${myLost ? 'wct-game-win-opp' : myWon ? 'wct-game-loss-opp' : ''}`}>{oppTotalSeries}</td>
            <td className="wct-opp-col" />
            <td className="wct-divider" />
            <td className="wct-name-col" />
            {myTotals.map((myG, i) => {
              const oppG = oppTotals[i]
              return (
                <td key={i} className={myG > oppG ? 'wct-game-win' : oppG > myG ? 'wct-game-loss' : ''}>
                  {myG}
                </td>
              )
            })}
            <td className={myWon ? 'wct-game-win' : myLost ? 'wct-game-loss' : ''}>{myTotalSeries}</td>
            <td />
          </tr>
        </tbody>
      </table>

      <div className="wcd-pts-panel wcd-pts-my">
        <span className="wcd-pts-label">{my.teamName}</span>
        <span className={`wcd-pts-value ${myWon ? 'wcd-pts-win' : myLost ? 'wcd-pts-loss' : ''}`}>{myPts % 1 === 0 ? myPts : myPts.toFixed(1)}</span>
        <span className="wcd-pts-unit">pts</span>
      </div>
      </div>{/* end .wcard-detail */}

      {/* Standings PDF footer — only rendered when a PDF exists for this week */}
      {onViewPdf && getStandingsPdfId(week) && (
        <div className="wcd-pdf-footer">
          <button
            className="standings-pdf-btn"
            onClick={onViewPdf}
            aria-label={`View standings PDF for Week ${week}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
            </svg>
            View Standings PDF — Week {week}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * TeamsPage component.
 *
 * @returns Two-panel teams page with ranked sidebar and collapsible week cards.
 *   Returns a loading placeholder while Firestore data is in flight.
 */
function TeamsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const [selectedLane, setSelectedLane] = useState<number | null>(null)
  const [laneSelectedTeamId, setLaneSelectedTeamId] = useState<string | null>(null)
  const [pdfWeek, setPdfWeek] = useState<number | null>(null)
  const { seasonActive, loading: seasonStatusLoading } = useSeasonStatus()

  const { data: teams, loading: teamsLoading } = useTeams('2025-2026')
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails('2025-2026')
  const { data: allMatchups } = useMatchups('2025-2026')

  // Sort teams by points descending for the ranked sidebar
  // Must stay above any early return — Rules of Hooks
  const sortedTeams = useMemo(() =>
    [...teams].sort((a, b) => b.points - a.points),
    [teams]
  )

  const teamIdParam = searchParams.get('team')
  const selectedTeamId = teamIdParam ?? sortedTeams[0]?.leaguePalsId
  const selectedTeam = teams.find(t => t.leaguePalsId === selectedTeamId)
  const selectedRank = sortedTeams.findIndex(t => t.leaguePalsId === selectedTeamId) + 1

  const teamMatchups = useMemo(() =>
    matchupDetails
      .filter(m => m.team1.teamId === selectedTeamId || m.team2.teamId === selectedTeamId)
      .sort((a, b) => a.week - b.week),
    [matchupDetails, selectedTeamId]
  )

  /**
   * Derives the W/L/T outcome sequence for the selected team's completed weeks.
   * Used to render the streak dot track in the season summary.
   */
  const resultSequence = useMemo((): Outcome[] =>
    teamMatchups.map(match => {
      const isTeam1 = match.team1.teamId === selectedTeamId
      const my = isTeam1 ? match.team1 : match.team2
      const opp = isTeam1 ? match.team2 : match.team1
      if (my.totalSeries > opp.totalSeries) return 'W'
      if (my.totalSeries < opp.totalSeries) return 'L'
      return 'T'
    }),
    [teamMatchups, selectedTeamId]
  )

  /** Scheduled but not-yet-completed weeks for the selected team, sorted ascending. */
  const pendingWeeks = useMemo(() =>
    allMatchups
      .filter(m =>
        !m.completed &&
        (m.team1Id === selectedTeamId || m.team2Id === selectedTeamId)
      )
      .sort((a, b) => a.week - b.week),
    [allMatchups, selectedTeamId]
  )

  /** Per-lane-pair analytics derived from the already-fetched matchupDetails. */
  const laneData = useMemo(() => aggregateLaneData(matchupDetails), [matchupDetails])

  /** All unique teams across all lane pairs, alphabetically sorted. */
  const laneAllTeams = useMemo(() => {
    const map = new Map<string, { teamId: string; teamName: string }>()
    for (const lane of laneData) {
      for (const t of lane.teams) {
        if (!map.has(t.teamId)) map.set(t.teamId, { teamId: t.teamId, teamName: t.teamName })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.teamName.localeCompare(b.teamName))
  }, [laneData])

  const selectedLaneData = laneData.find(l => l.baseLane === selectedLane) ?? null

  /** Weekly scores for the lane-filtered team on the selected lane pair. */
  const laneWeeklyScores = useMemo(() => {
    if (!selectedLaneData || !laneSelectedTeamId) return []
    return matchupDetails
      .filter(d => {
        const raw = d.team1.lane
        const base = raw % 2 === 1 ? raw : raw - 1
        return base === selectedLaneData.baseLane &&
          (d.team1.teamId === laneSelectedTeamId || d.team2.teamId === laneSelectedTeamId)
      })
      .sort((a, b) => a.week - b.week)
      .map(d => {
        const isTeam1 = d.team1.teamId === laneSelectedTeamId
        const my  = isTeam1 ? d.team1 : d.team2
        const opp = isTeam1 ? d.team2 : d.team1
        return {
          week: d.week,
          date: d.date,
          my,
          opp,
          won:  my.totalSeries > opp.totalSeries,
          lost: my.totalSeries < opp.totalSeries,
        }
      })
  }, [matchupDetails, selectedLaneData, laneSelectedTeamId])

  if (!seasonStatusLoading && !seasonActive) {
    return (
      <SeasonPlaceholder
        pageTitle="Teams"
        whatYoullSee="you'll see team rosters, win/loss records, and weekly match breakdowns."
      />
    )
  }

  if (teamsLoading || detailsLoading) {
    return <div className="loading">Loading teams…</div>
  }

  /**
   * Switches the active team and resets all expanded week cards.
   *
   * @param id - leaguePalsId of the team to select
   */
  const selectTeam = (id: string) => {
    setSearchParams({ team: id })
    setExpandedWeeks(new Set())
  }

  /**
   * Toggles the expanded state of a single week card.
   *
   * @param cardId - Unique identifier for the card (match.id or week fallback)
   */
  const toggleWeek = (cardId: string) => {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  /**
   * Toggles selection of a lane pair in the Lane Analytics section.
   * Selected team persists so the user can compare the same team across pairs.
   *
   * @param baseLane - Odd lane number of the pair to toggle
   */
  const handleLaneCardClick = (baseLane: number) => {
    setSelectedLane(prev => prev === baseLane ? null : baseLane)
  }

  /**
   * Formats an ISO date string for compact display ("Sep 4").
   *
   * @param dateString - ISO date, e.g. "2025-09-04"
   * @returns Short month+day string
   */
  const formatDate = (dateString: string): string => {
    const d = new Date(dateString + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const totalGames = (selectedTeam?.wins ?? 0) + (selectedTeam?.losses ?? 0) + (selectedTeam?.ties ?? 0)
  const winPct = totalGames > 0
    ? ((selectedTeam!.wins / totalGames) * 100).toFixed(0) + '%'
    : '—'

  return (
    <div className="teams-page">
      <div className="teams-layout">

        {/* ── Left: Ranked team roster sidebar ─────────────────────────── */}
        <aside className="teams-sidebar">
          <div className="sidebar-header">
            <h2 className="section-title sidebar-title">Teams</h2>
            <span className="sidebar-season">2025–2026</span>
          </div>
          <ul className="roster-list">
            {sortedTeams.map((team, idx) => (
              <li key={team.leaguePalsId}>
                <button
                  className={`roster-item ${team.leaguePalsId === selectedTeamId ? 'active' : ''}`}
                  onClick={() => selectTeam(team.leaguePalsId)}
                >
                  <span className="roster-rank">{idx + 1}</span>
                  <span className="roster-name-block">
                    <span className="roster-name">{team.name}</span>
                    {team.average > 0 && (
                      <span className="roster-avg">
                        {team.average}
                        <span className="roster-avg-sep">|</span>
                        {team.average * 3} avg
                      </span>
                    )}
                  </span>
                  <span className="roster-wl">
                    <span className="rr-w">{team.wins}</span>
                    <span className="rr-sep">–</span>
                    <span className="rr-l">{team.losses}</span>
                  </span>
                  <span className="roster-pts">
                    {team.points}
                    <span className="roster-pts-unit">pts</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── Right: Selected team detail ───────────────────────────────── */}
        <main className="teams-detail">
          {selectedTeam ? (
            <>
              {/* Season summary card */}
              <div className="season-card">
                <div className="season-card-header">
                  <div className="season-team-name">{selectedTeam.name}</div>
                  <div className="season-rank-badge">
                    #{selectedRank}
                    <span className="season-rank-label"> in league</span>
                  </div>
                </div>

                <div className="season-stats-row">
                  <div className="stat-block">
                    <span className="stat-val stat-wins">{selectedTeam.wins}</span>
                    <span className="stat-lbl">Wins</span>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat-block">
                    <span className="stat-val stat-losses">{selectedTeam.losses}</span>
                    <span className="stat-lbl">Losses</span>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat-block">
                    <span className="stat-val">{selectedTeam.ties}</span>
                    <span className="stat-lbl">Ties</span>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat-block">
                    <span className="stat-val stat-pts">{selectedTeam.points}</span>
                    <span className="stat-lbl">Points</span>
                  </div>
                  <div className="stat-divider" />
                  <div className="stat-block">
                    <span className="stat-val">{winPct}</span>
                    <span className="stat-lbl">Win %</span>
                  </div>
                </div>

                {/* Color-coded outcome track across the season */}
                {resultSequence.length > 0 && (
                  <div className="streak-track">
                    <span className="streak-label">Season</span>
                    <div className="streak-dots">
                      {resultSequence.map((r, i) => {
                        const weekNum = teamMatchups[i]?.week ?? i + 1
                        return (
                          <div key={weekNum} className="sdot-col">
                            <span className="sdot-week-num">{weekNum}</span>
                            <span
                              className={`sdot sdot-${r === 'W' ? 'win' : r === 'L' ? 'loss' : 'tie'}`}
                              title={`Week ${weekNum}: ${r === 'W' ? 'Win' : r === 'L' ? 'Loss' : 'Tie'}`}
                            />
                          </div>
                        )
                      })}
                      {pendingWeeks.map(m => (
                        <div key={`p-${m.week}`} className="sdot-col">
                          <span className="sdot-week-num">{m.week}</span>
                          <span className="sdot sdot-pending" title={`Week ${m.week}: Upcoming`} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Weekly match cards */}
              <div className="weeks-section">
                <h4 className="weeks-heading">
                  Weekly Results
                  <span className="weeks-hint">click a row to expand</span>
                </h4>

                {teamMatchups.length === 0 ? (
                  <p className="no-data">No match data available yet.</p>
                ) : (
                  <div className="week-cards">
                    {teamMatchups.map(match => {
                      const isTeam1 = match.team1.teamId === selectedTeamId
                      const my = isTeam1 ? match.team1 : match.team2
                      const opp = isTeam1 ? match.team2 : match.team1
                      const won = my.totalSeries > opp.totalSeries
                      const lost = my.totalSeries < opp.totalSeries
                      const outcome: Outcome = won ? 'W' : lost ? 'L' : 'T'
                      const cardId = match.id ?? String(match.week)
                      const expanded = expandedWeeks.has(cardId)

                      return (
                        <div
                          key={cardId}
                          className={`wcard wcard-${outcome === 'W' ? 'won' : outcome === 'L' ? 'lost' : 'tied'}${expanded ? ' wcard-open' : ''}`}
                        >
                          {/* Summary row — always visible, click to toggle */}
                          <button
                            className="wcard-row"
                            onClick={() => toggleWeek(cardId)}
                            aria-expanded={expanded}
                          >
                            <span className="wcard-week">WK {match.week}</span>
                            <span className="wcard-date">{formatDate(match.date)}</span>
                            <span className="wcard-lane">{formatLanePair(my.lane)}</span>
                            <span className="wcard-opp">vs {opp.teamName}</span>
                            <span className={`wcard-chip chip-${outcome === 'W' ? 'win' : outcome === 'L' ? 'loss' : 'tie'}`}>
                              {outcome === 'W' ? 'WIN' : outcome === 'L' ? 'LOSS' : 'TIE'}
                            </span>
                            <span className="wcard-score">
                              {my.totalSeries}
                              <span className="wcard-score-sep"> – </span>
                              {opp.totalSeries}
                            </span>
                            <span className={`wcard-chevron${expanded ? ' open' : ''}`}>▾</span>
                          </button>

                          {/* Expanded detail — mounted only when open so hooks fire conditionally */}
                          {expanded && (
                            <WeekCardDetail
                              my={my}
                              opp={opp}
                              week={match.week}
                              won={won}
                              lost={lost}
                              seasonYear="2025-2026"
                              onViewPdf={() => setPdfWeek(match.week)}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="no-data">Select a team to view their season.</p>
          )}
        </main>
      </div>

      {/* ── Lane Analytics section ─────────────────────────────────────────── */}
      <div className="teams-lanes-section">
        <div className="teams-lanes-header">
          <h3 className="section-title">Lane Analytics</h3>
          <span className="lanes-page-subtitle">Performance by lane pair · 2025–2026</span>
        </div>

        {/* Team filter */}
        {laneAllTeams.length > 0 && (
          <div className="ld-team-selector lanes-team-selector">
            <span className="ld-team-selector-label">Filter by team</span>
            <div className="ld-team-pills">
              <button
                className={`ld-team-pill${laneSelectedTeamId === null ? ' ld-team-pill-active' : ''}`}
                onClick={() => setLaneSelectedTeamId(null)}
              >
                All
              </button>
              {laneAllTeams.map(t => (
                <button
                  key={t.teamId}
                  className={`ld-team-pill${laneSelectedTeamId === t.teamId ? ' ld-team-pill-active' : ''}`}
                  onClick={() => setLaneSelectedTeamId(prev => prev === t.teamId ? null : t.teamId)}
                >
                  {t.teamName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Lane pair grid */}
        <div className="lanes-grid">
          {laneData.map(lane => {
            const active = selectedLane === lane.baseLane
            const teamRecord = laneSelectedTeamId ? (lane.teams.find(t => t.teamId === laneSelectedTeamId) ?? null) : null
            return (
              <button
                key={lane.baseLane}
                className={`lane-card${active ? ' lane-card-active' : ''}${teamRecord ? ' lane-card-team-match' : ''}`}
                onClick={() => handleLaneCardClick(lane.baseLane)}
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
                    {teamRecord ? (
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

        {/* Expanded detail panel for the selected lane pair */}
        {selectedLaneData && (
          <div className="lane-detail" role="region" aria-label={`Detail for lanes ${selectedLaneData.label}`}>
            <div className="ld-header">
              <div className="ld-title-block">
                <span className="ld-lanes-label">Lanes</span>
                <span className="ld-lanes-num">{selectedLaneData.label}</span>
              </div>
              <div className="ld-summary-pills">
                <span className="ld-pill">{selectedLaneData.appearances} matches</span>
                <span className="ld-pill">Avg scratch {selectedLaneData.avgScratch.toLocaleString()}</span>
                <span className="ld-pill">Avg total {selectedLaneData.avgHandicap.toLocaleString()}</span>
                <span className="ld-pill ld-pill-gold">High {selectedLaneData.highScratch.toLocaleString()}</span>
              </div>
            </div>

            {laneSelectedTeamId && laneWeeklyScores.length > 0 ? (
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
                  {laneWeeklyScores.map(({ week, date, my, opp, won, lost }) => (
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
                  {selectedLaneData.teams.map((t, i) => (
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

      {/* Standings PDF viewer — triggered from expanded week card footers */}
      <StandingsPdfModal weekNum={pdfWeek} onClose={() => setPdfWeek(null)} />
    </div>
  )
}

export default TeamsPage
