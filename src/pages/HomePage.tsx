/**
 * @file HomePage.tsx
 * @module pages/HomePage
 *
 * Main landing page for the Late Night Happy Hour Bowling League site.
 *
 * Displays the latest week's matchup results and team standings using data
 * fetched live from Firestore via domain hooks. All JSON imports have been
 * replaced with Firestore hooks following the Phase 4 migration.
 *
 * Sections:
 *  - Latest Week Recap — scoreboard table for the most recently completed week
 *  - Week Highlights   — top team series (scratch + handicap) + individual
 *                        high game and series from that week
 *  - Nav Cards         — quick links to Standings, Matchups, Teams, Bowlers, History
 *  - League Standings  — full standings table via LeagueStandings component
 *  - Award Leaders     — season award leaders via AwardLeaders component
 *
 * The active season year is read from LeagueConfig via useLeagueConfig once a
 * season is resolved, defaulting to '2025' for the initial render.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import NavCard from '../components/NavCard'
import LeagueStandings from '../components/LeagueStandings'
import AwardLeaders from '../components/AwardLeaders'
import MatchupDetailModal from '../components/MatchupDetailModal'
import BowlerProfileModal from '../components/BowlerProfileModal'
import StandingsPdfModal from '../components/StandingsPdfModal'
import PlayoffBracket from '../components/PlayoffBracket'
import OffSeasonLanding from '../components/OffSeasonLanding'
import { useMatchupDetails, useMatchups, useTeams, useBowlers, useBowlerScoresByWeek, useSeasons, useScheduleWeeks, useLeagueConfig } from '../hooks'
import { useSeasonYear, useSeasonStatus } from '../context/SeasonContext'
import { getStandingsPdfId } from '../utils/weeklyStandingsPdf'
import { isScheduleWeekVisible, visibleWeekNumbers } from '../utils/weekVisibility'
import type { MatchupDetail } from '../types'
import './HomePage.css'
import './MatchupsPage.css'

// ---------------------------------------------------------------------------
// Point calculation helpers
// ---------------------------------------------------------------------------

/**
 * Calculates the points earned for a single game or series comparison.
 * Win = 1 point, tie = 0.5 points, loss = 0 points.
 *
 * @param myScore  - Score for the team being evaluated
 * @param oppScore - Opponent's score for the same game/series
 * @returns Points earned: 1 | 0.5 | 0
 */
function calcPoints(myScore: number, oppScore: number): number {
  if (myScore > oppScore) return 1
  if (myScore === oppScore) return 0.5
  return 0
}

/**
 * Calculates the match points breakdown for both teams in a MatchupDetail.
 * Uses the Firestore schema fields: `game1Total`, `game2Total`, `game3Total`,
 * `totalSeries`, and `handicapGame1/2/3`.
 *
 * @param detail - MatchupDetail document from Firestore
 * @returns Object with `team1` and `team2` point totals (max 4 points each)
 */
function getMatchPoints(detail: MatchupDetail): { team1: number; team2: number } {
  // One point per game (3 games) + one point for overall series
  const t1 =
    calcPoints(detail.team1.game1Total + detail.team1.handicapGame1, detail.team2.game1Total + detail.team2.handicapGame1) +
    calcPoints(detail.team1.game2Total + detail.team1.handicapGame2, detail.team2.game2Total + detail.team2.handicapGame2) +
    calcPoints(detail.team1.game3Total + detail.team1.handicapGame3, detail.team2.game3Total + detail.team2.handicapGame3) +
    calcPoints(detail.team1.totalSeries, detail.team2.totalSeries)

  return { team1: t1, team2: 4 - t1 }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string into a long-form weekday + full date label.
 *
 * @param dateString - ISO date string (e.g. "2025-09-05")
 * @returns Formatted string like "Friday, September 5, 2025"
 */
function formatDate(dateString: string): string {
  const d = new Date(dateString + 'T12:00:00')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * HomePage — main landing page component.
 *
 * Fetches matchup details, teams, matchups, and individual bowler scores for
 * the current season from Firestore. Derives the latest completed week and
 * computes all week highlights (team + individual) via `useMemo`.
 */
function HomePage() {
  const navigate = useNavigate()
  const SEASON_YEAR = useSeasonYear()
  const { seasonActive, upcomingSeasonYear, loading: seasonStatusLoading } = useSeasonStatus()
  const { data: upcomingScheduleWeeks } = useScheduleWeeks(upcomingSeasonYear || '')
  const upcomingWeek1Date = upcomingScheduleWeeks.find((w) => w.week === 1)?.date ?? null
  const { data: upcomingLeagueConfig } = useLeagueConfig(upcomingSeasonYear)

  // Modal state — null means no modal is open
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null)
  const [selectedBowlerId, setSelectedBowlerId] = useState<string | null>(null)
  const [pdfWeek, setPdfWeek] = useState<number | null>(null)

  // Controls which panel is visible in the recap/preview toggle
  const [weekView, setWeekView] = useState<'recap' | 'preview'>('recap')
  const [selectedRecapWeek, setSelectedRecapWeek] = useState<number | null>(null)

  // Fetch all matchup details and teams for the season
  const { data: matchupDetails, loading: detailsLoading } = useMatchupDetails(SEASON_YEAR)
  const { data: teams, loading: teamsLoading } = useTeams(SEASON_YEAR)
  const { data: allMatchups, loading: matchupsLoading } = useMatchups(SEASON_YEAR)
  const { data: scheduleWeeks, loading: scheduleLoading } = useScheduleWeeks(SEASON_YEAR)
  const visibleWeeks = useMemo(() => visibleWeekNumbers(scheduleWeeks), [scheduleWeeks])
  const visibleScheduleWeeks = useMemo(() => scheduleWeeks.filter(isScheduleWeekVisible), [scheduleWeeks])
  const { data: bowlers } = useBowlers(SEASON_YEAR)
  const { data: seasons } = useSeasons()
  const { data: leagueConfig, loading: configLoading } = useLeagueConfig(SEASON_YEAR)

  // Derive the latest week number from completed matchup records.
  // Using matchupDetails max-week is wrong: the transform writes zero-score
  // matchupDetail records for any past week, even when scores aren't in
  // LeaguePals yet, causing an unplayed week to appear as the latest recap.
  // The `matchups` collection's `completed` flag is the authoritative signal.
  const completedWeekNumbers = useMemo(
    () => Array.from(new Set(
      allMatchups.filter((m) => m.completed && visibleWeeks.has(m.week)).map((m) => m.week)
    )).sort((a, b) => a - b),
    [allMatchups, visibleWeeks]
  )

  const latestWeek = useMemo(() => {
    if (completedWeekNumbers.length) return completedWeekNumbers[completedWeekNumbers.length - 1]
    return visibleScheduleWeeks.find((week) => week.week != null)?.week ?? 1
  }, [completedWeekNumbers, visibleScheduleWeeks])

  const recapWeek = selectedRecapWeek != null && completedWeekNumbers.includes(selectedRecapWeek)
    ? selectedRecapWeek
    : latestWeek
  const recapWeekIndex = completedWeekNumbers.indexOf(recapWeek)
  const previousRecapWeek = recapWeekIndex > 0 ? completedWeekNumbers[recapWeekIndex - 1] : null
  const followingRecapWeek = recapWeekIndex >= 0 && recapWeekIndex < completedWeekNumbers.length - 1
    ? completedWeekNumbers[recapWeekIndex + 1]
    : null

  // Filter to only the matchups from the selected recap week
  const latestWeekDetails = useMemo(
    () => matchupDetails
      .filter((m) => m.week === recapWeek && visibleWeeks.has(m.week))
      .sort((a, b) => Math.min(a.team1.lane, a.team2.lane) - Math.min(b.team1.lane, b.team2.lane)),
    [matchupDetails, recapWeek, visibleWeeks]
  )

  const latestDate = latestWeekDetails[0]?.date

  // All non-blinded bowler scores for the selected recap week (individual highlights)
  const { data: latestWeekScores, loading: scoresLoading } = useBowlerScoresByWeek(
    recapWeek || null,
    SEASON_YEAR
  )

  // Next week's schedule matchups (not yet completed)
  const nextWeek = visibleScheduleWeeks.find((week) => week.week != null && week.week > latestWeek && week.status !== 'completed')?.week ?? latestWeek + 1
  const hasNextWeek = leagueConfig?.totalWeeks != null && nextWeek <= leagueConfig.totalWeeks
  const nextWeekMatchups = useMemo(
    () => allMatchups
      .filter((m) => m.week === nextWeek && visibleWeeks.has(m.week) && !m.completed)
      .sort((a, b) => Math.min(a.team1Lane, a.team2Lane) - Math.min(b.team1Lane, b.team2Lane)),
    [allMatchups, nextWeek, visibleWeeks]
  )
  const nextWeekDate = nextWeekMatchups[0]?.date

  // ---------------------------------------------------------------------------
  // Week highlights — top 3 entries per category
  // Uses TeamSummary fields: scratchSeries, handicapSeries, totalSeries
  // ---------------------------------------------------------------------------

  /** Top 3 teams by handicap series for the latest week */
  const highTeamSeriesHcp = useMemo(
    () =>
      latestWeekDetails
        .flatMap((m) => [
          {
            name: m.team1.teamName,
            score: m.team1.totalSeries,
            scratch: m.team1.scratchSeries,
            hdcp: m.team1.handicapSeries,
          },
          {
            name: m.team2.teamName,
            score: m.team2.totalSeries,
            scratch: m.team2.scratchSeries,
            hdcp: m.team2.handicapSeries,
          },
        ])
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekDetails]
  )

  /** Top 3 teams by scratch series for the latest week */
  const highTeamSeriesScratch = useMemo(
    () =>
      latestWeekDetails
        .flatMap((m) => [
          { name: m.team1.teamName, score: m.team1.scratchSeries },
          { name: m.team2.teamName, score: m.team2.scratchSeries },
        ])
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekDetails]
  )

  /**
   * Top 3 individual single-game scores for the latest week.
   * Each bowler's three games are expanded into separate entries before ranking.
   */
  const highIndividualGame = useMemo(
    () =>
      latestWeekScores
        .flatMap((s) => [
          { name: s.bowlerName, team: s.teamName, score: s.game1 },
          { name: s.bowlerName, team: s.teamName, score: s.game2 },
          { name: s.bowlerName, team: s.teamName, score: s.game3 },
        ])
        .filter((e): e is { name: string; team: string; score: number } => e.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekScores]
  )

  /** Top 3 individual series for the latest week */
  const highIndividualSeries = useMemo(
    () =>
      latestWeekScores
        .filter((s): s is typeof s & { series: number } => s.series !== null)
        .map((s) => ({ name: s.bowlerName, team: s.teamName, score: s.series }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3),
    [latestWeekScores]
  )

  // The current standings leader (highest points) for the NavCard stat
  const leader = useMemo(
    () => (teams.length ? [...teams].sort((a, b) => b.points - a.points)[0] : null),
    [teams]
  )

  const handleSelectBowler = (id: string) => {
    setSelectedMatchupId(null)
    navigate(`/bowlers?id=${id}`)
  }

  const isLoading = detailsLoading || teamsLoading || matchupsLoading || scheduleLoading || scoresLoading || configLoading

  // Between seasons: swap the whole dashboard for the interest-form / history / countdown landing view.
  if (!seasonStatusLoading && !seasonActive) {
    return (
      <div className="home-page">
        <OffSeasonLanding
          upcomingSeasonYear={upcomingSeasonYear}
          week1Date={upcomingWeek1Date}
          bowlingCenter={upcomingLeagueConfig?.bowlingCenter ?? null}
          bowlingCenterAddress={upcomingLeagueConfig?.bowlingCenterAddress ?? null}
        />
      </div>
    )
  }

  return (
    <div className="home-page">

      {/* Recap / Preview section */}
      <section className="home-section">

        {!isLoading && (
          <div className="playoff-bracket-wrap">
            <PlayoffBracket
              matchupDetails={matchupDetails}
              week={recapWeek}
              playoffTeamCount={leagueConfig?.playoffTeamCount}
              onSelectMatchup={setSelectedMatchupId}
            />
          </div>
        )}

        {/* Tab bar — acts as both the toggle and the section header */}
        <div className="week-view-tabs">
          <div className="week-view-tabs-left">
            <div className="recap-week-nav">
              <button
                className="home-week-nav-btn"
                onClick={() => {
                  if (previousRecapWeek != null) setSelectedRecapWeek(previousRecapWeek)
                  setWeekView('recap')
                }}
                disabled={previousRecapWeek == null}
                aria-label="Previous recap week"
                title="Previous recap week"
              >
                ←
              </button>
              <button
                className={`week-tab ${weekView === 'recap' ? 'active' : ''}`}
                onClick={() => setWeekView('recap')}
              >
                <span className="week-tab-label">Week {recapWeek} Recap</span>
                <span className="week-tab-date">
                  {latestDate ? formatDate(latestDate) : '\u00A0'}
                </span>
              </button>
              <button
                className="home-week-nav-btn"
                onClick={() => {
                  if (followingRecapWeek != null) setSelectedRecapWeek(followingRecapWeek)
                  setWeekView('recap')
                }}
                disabled={followingRecapWeek == null}
                aria-label="Next recap week"
                title="Next recap week"
              >
                →
              </button>
            </div>
            {hasNextWeek && (
              <button
                className={`week-tab ${weekView === 'preview' ? 'active' : ''}`}
                onClick={() => setWeekView('preview')}
              >
                <span className="week-tab-label">Week {nextWeek} Preview</span>
                <span className="week-tab-date">
                  {nextWeekDate ? formatDate(nextWeekDate) : '\u00A0'}
                </span>
              </button>
            )}
          </div>
          <div className="week-view-tabs-right">
            {/* Show standings PDF button only in Recap mode when a PDF is available */}
            {weekView === 'recap' && getStandingsPdfId(recapWeek) && (
              <button
                className="standings-pdf-btn"
                onClick={() => setPdfWeek(recapWeek)}
                aria-label={`View standings PDF for Week ${recapWeek}`}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M14 4.5V14a2 2 0 01-2 2H4a2 2 0 01-2-2V2a2 2 0 012-2h5.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3V1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5h-2z"/>
                </svg>
                Standings PDF
              </button>
            )}
            <button
              className="recap-detail-link"
              onClick={() =>
                navigate(
                  weekView === 'recap'
                    ? `/matchups?week=${recapWeek}`
                    : `/matchups?week=${nextWeek}`
                )
              }
            >
              {weekView === 'recap' ? 'All Weeks →' : 'Full Schedule →'}
            </button>
          </div>
        </div>

        {/* ── Recap panel ── */}
        {weekView === 'recap' && (
          <>

            {isLoading && (
              <p style={{ color: '#888', textAlign: 'center' }}>Loading matchup data…</p>
            )}

            {!isLoading && latestWeekDetails.length > 0 && (
              <div className="matchup-scoreboard">
                <table className="matchup-table">
                  <thead>
                    <tr>
                      <th className="col-team-left">Team</th>
                      <th className="col-pts center">Pts</th>
                      <th className="col-score center">Total</th>
                      <th className="col-lanes center">Lanes</th>
                      <th className="col-score center">Total</th>
                      <th className="col-pts center">Pts</th>
                      <th className="col-team-right">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestWeekDetails.map((match) => {
                      const pts = getMatchPoints(match)
                      // Odd lane always on the left side of the scoreboard
                      const leftIsTeam1 = match.team1.lane % 2 === 1
                      const left  = leftIsTeam1 ? match.team1 : match.team2
                      const right = leftIsTeam1 ? match.team2 : match.team1
                      const leftPts  = leftIsTeam1 ? pts.team1 : pts.team2
                      const rightPts = leftIsTeam1 ? pts.team2 : pts.team1
                      const leftWon  = left.totalSeries > right.totalSeries
                      const rightWon = right.totalSeries > left.totalSeries
                      const oddLane  = Math.min(match.team1.lane, match.team2.lane)
                      const evenLane = Math.max(match.team1.lane, match.team2.lane)
                      return (
                        <tr
                          key={match.id}
                          className="matchup-row"
                          onClick={() => setSelectedMatchupId(match.id ?? null)}
                          title="Click for full bowler breakdown"
                        >
                          <td className={`col-team-left team-cell ${leftWon ? 'winner' : ''}`}>
                            {left.teamName}
                          </td>
                          <td className={`col-pts center pts-cell ${leftWon ? 'pts-winner' : ''}`}>
                            {leftPts % 1 === 0 ? leftPts : leftPts.toFixed(1)}
                          </td>
                          <td className={`col-score center score-cell ${leftWon ? 'winner' : ''}`}>
                            <span title={`Scratch: ${left.scratchSeries} + HDCP: ${left.handicapSeries}`}>
                              {left.totalSeries}
                            </span>
                            {left.handicapSeries > 0 && (
                              <span
                                className="score-hcp"
                                title={`Scratch: ${left.scratchSeries} + HDCP: ${left.handicapSeries}`}
                              >
                                (+{left.handicapSeries})
                              </span>
                            )}
                          </td>
                          <td className="col-lanes center lanes-cell">
                            {oddLane}-{evenLane}
                          </td>
                          <td className={`col-score center score-cell ${rightWon ? 'winner' : ''}`}>
                            <span title={`Scratch: ${right.scratchSeries} + HDCP: ${right.handicapSeries}`}>
                              {right.totalSeries}
                            </span>
                            {right.handicapSeries > 0 && (
                              <span
                                className="score-hcp"
                                title={`Scratch: ${right.scratchSeries} + HDCP: ${right.handicapSeries}`}
                              >
                                (+{right.handicapSeries})
                              </span>
                            )}
                          </td>
                          <td className={`col-pts center pts-cell ${rightWon ? 'pts-winner' : ''}`}>
                            {rightPts % 1 === 0 ? rightPts : rightPts.toFixed(1)}
                          </td>
                          <td className={`col-team-right team-cell ${rightWon ? 'winner' : ''}`}>
                            {right.teamName}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Week Highlights — team-level aggregates; individual data is in MatchupDetailModal */}
            {!isLoading && latestWeekDetails.length > 0 && (
              <div className="week-highlights">
                {([
                  { title: 'High Team Series (Scratch)', entries: highTeamSeriesScratch },
                ] as const).map(({ title, entries }) => (
                  <div key={title} className="highlight-card">
                    <h4 className="highlight-title">{title}</h4>
                    <ol className="highlight-list">
                      {entries.map((entry, i) => (
                        <li key={i} className="highlight-entry">
                          <span className="highlight-rank">{i + 1}</span>
                          <span className="highlight-name">{entry.name}</span>
                          <span className="highlight-score">{entry.score}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}

                <div className="highlight-card">
                  <h4 className="highlight-title">High Team Series (Handicap)</h4>
                  <ol className="highlight-list">
                    {highTeamSeriesHcp.map((entry, i) => (
                      <li key={i} className="highlight-entry">
                        <span className="highlight-rank">{i + 1}</span>
                        <span className="highlight-name">{entry.name}</span>
                        <span className="highlight-score">
                          <span className="highlight-breakdown">
                            ({entry.scratch} + {entry.hdcp} HDCP)
                          </span>
                          <span className="highlight-breakdown-sep"> | </span>
                          {entry.score}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="highlight-card">
                  <h4 className="highlight-title">High Individual Game</h4>
                  <ol className="highlight-list">
                    {highIndividualGame.map((entry, i) => (
                      <li key={i} className="highlight-entry">
                        <span className="highlight-rank">{i + 1}</span>
                        <span className="highlight-name">
                          {entry.name}
                          <span className="highlight-team-sub">{entry.team}</span>
                        </span>
                        <span className="highlight-score">{entry.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="highlight-card">
                  <h4 className="highlight-title">High Individual Series</h4>
                  <ol className="highlight-list">
                    {highIndividualSeries.map((entry, i) => (
                      <li key={i} className="highlight-entry">
                        <span className="highlight-rank">{i + 1}</span>
                        <span className="highlight-name">
                          {entry.name}
                          <span className="highlight-team-sub">{entry.team}</span>
                        </span>
                        <span className="highlight-score">{entry.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Preview panel ── */}
        {hasNextWeek && weekView === 'preview' && (
          <>
            {isLoading && (
              <p style={{ color: '#888', textAlign: 'center' }}>Loading matchup data…</p>
            )}

            {!isLoading && nextWeekMatchups.length > 0 && (
              <div className="matchup-scoreboard">
                <table className="matchup-table">
                  <thead>
                    <tr>
                      <th className="col-team-left">Team</th>
                      <th className="col-pts center">Record</th>
                      <th className="col-lanes center">Lanes</th>
                      <th className="col-pts center">Record</th>
                      <th className="col-team-right">Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nextWeekMatchups.map((matchup) => {
                      const team1 = teams.find((t) => t.id === matchup.team1Id)
                      const team2 = teams.find((t) => t.id === matchup.team2Id)
                      // Odd lane always on the left
                      const leftIsTeam1 = matchup.team1Lane % 2 === 1
                      const leftTeam  = leftIsTeam1 ? team1 : team2
                      const rightTeam = leftIsTeam1 ? team2 : team1
                      const oddLane   = Math.min(matchup.team1Lane, matchup.team2Lane)
                      const evenLane  = Math.max(matchup.team1Lane, matchup.team2Lane)
                      const laneLabel = oddLane > 0 ? `${oddLane}-${evenLane}` : '—'
                      return (
                        <tr key={matchup.id} className="matchup-row preview-row">
                          <td className="col-team-left team-cell">
                            {leftTeam?.name ?? matchup.team1Id}
                          </td>
                          <td className="col-pts center pts-cell">
                            {leftTeam ? `${leftTeam.wins}-${leftTeam.losses}` : '—'}
                          </td>
                          <td className="col-lanes center lanes-cell">{laneLabel}</td>
                          <td className="col-pts center pts-cell">
                            {rightTeam ? `${rightTeam.wins}-${rightTeam.losses}` : '—'}
                          </td>
                          <td className="col-team-right team-cell">
                            {rightTeam?.name ?? matchup.team2Id}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!isLoading && nextWeekMatchups.length > 0 && (
              <p className="preview-lanes-disclaimer">Lane assignments subject to change.</p>
            )}

            {!isLoading && nextWeekMatchups.length === 0 && (
              <p style={{ color: '#888', textAlign: 'center' }}>No matchups scheduled for Week {nextWeek}.</p>
            )}
          </>
        )}
      </section>

      {/* Compact Nav Cards */}
      <div className="nav-cards-grid">
        <NavCard
          to="/standings"
          icon="🏆"
          title="Standings"
          description=""
          stat={leader?.name}
          statLabel="Leading"
        />
        <NavCard
          to="/matchups"
          icon="🎳"
          title="Matchups"
          description=""
          stat={`Wk ${latestWeek}`}
          statLabel="Latest"
        />
        <NavCard
          to="/teams"
          icon="👥"
          title="Teams"
          description=""
          stat={teams.length ? String(teams.length) : undefined}
          statLabel="This Season"
        />
        <NavCard
          to="/bowlers"
          icon="🎯"
          title="Bowlers"
          description=""
          stat={bowlers.length ? String(bowlers.length) : undefined}
          statLabel="This Season"
        />
        <NavCard
          to="/history"
          icon="📜"
          title="History"
          description=""
          stat={seasons.length ? String(seasons.length) : undefined}
          statLabel={seasons.length === 1 ? 'Season' : 'Seasons'}
        />
      </div>

      {/* Standings + Award Leaders */}
      <section className="home-section">
        <LeagueStandings />
        <AwardLeaders />
      </section>

      {/* Modals */}
      <MatchupDetailModal
        matchupId={selectedMatchupId}
        onClose={() => setSelectedMatchupId(null)}
        onSelectBowler={handleSelectBowler}
      />
      <BowlerProfileModal
        bowlerId={selectedBowlerId}
        onClose={() => setSelectedBowlerId(null)}
      />
      <StandingsPdfModal weekNum={pdfWeek} onClose={() => setPdfWeek(null)} />
    </div>
  )
}

export default HomePage
