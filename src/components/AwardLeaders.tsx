import { useMemo } from 'react'
import bowlerStatsData from '../data/bowlerStats.json'
import weeklyMatchupData from '../data/weeklyMatchupDetails.json'
import scheduleWeeksData from '../data/scheduleWeeks.json'
import type { BowlerStat, MatchupDetail, ScheduleWeek } from '../types'
import './AwardLeaders.css'

interface AwardRow {
  label: string
  prize: string
  winner: string
  score: string | number
  detail?: string
}

interface AwardGroups {
  team: AwardRow[]
  individual: AwardRow[]
}

// Compute award rows for a given set of dataWeeks
function computeAwards(
  bowlers: BowlerStat[],
  matchups: MatchupDetail[],
  halfWeeks: Set<number>
): AwardGroups {
  // --- Individual awards: aggregate from per-week data ---
  interface BowlerHalf {
    name: string
    teamName: string
    totalPins: number
    totalGames: number
    highGame: number
    highSeries: number
  }

  const bowlerHalves: Record<string, BowlerHalf> = {}

  for (const b of bowlers) {
    const halfWeekData = b.weeks.filter(w => halfWeeks.has(w.week))
    if (halfWeekData.length === 0) continue

    let totalPins = 0
    let totalGames = 0
    let highGame = 0
    let highSeries = 0

    for (const w of halfWeekData) {
      const games = [w.g1, w.g2, w.g3].filter(g => g > 0)
      totalPins  += games.reduce((s, g) => s + g, 0)
      totalGames += games.length
      highGame    = Math.max(highGame, ...games)
      highSeries  = Math.max(highSeries, w.series)
    }

    bowlerHalves[b.id] = {
      name: b.name,
      teamName: b.teamName,
      totalPins,
      totalGames,
      highGame,
      highSeries,
    }
  }

  const bowlerList = Object.values(bowlerHalves).filter(b => b.totalGames > 0)

  const byAvg    = [...bowlerList].sort((a, b) =>
    (b.totalPins / b.totalGames) - (a.totalPins / a.totalGames))
  const byGame   = [...bowlerList].sort((a, b) => b.highGame - a.highGame)
  const bySeries = [...bowlerList].sort((a, b) => b.highSeries - a.highSeries)

  // --- Team awards: aggregate from weekly matchup data ---
  interface TeamHalf {
    name: string
    highGameScratch: number
    highSeriesScratch: number
    highGameHdcp: number
    highSeriesHdcp: number
    hdcpGameScratch: number
    hdcpGameHdcp: number
    hdcpSeriesScratch: number
    hdcpSeriesHdcp: number
  }

  const teamHalves: Record<number, TeamHalf> = {}

  for (const m of matchups) {
    if (!halfWeeks.has(m.week)) continue
    for (const team of [m.team1, m.team2]) {
      if (!teamHalves[team.id]) {
        teamHalves[team.id] = {
          name: team.name,
          highGameScratch: 0,
          highSeriesScratch: 0,
          highGameHdcp: 0,
          highSeriesHdcp: 0,
          hdcpGameScratch: 0,
          hdcpGameHdcp: 0,
          hdcpSeriesScratch: 0,
          hdcpSeriesHdcp: 0,
        }
      }
      const t = teamHalves[team.id]
      const bestScratchGame = Math.max(team.gameTotals.g1, team.gameTotals.g2, team.gameTotals.g3)

      if (bestScratchGame > t.highGameScratch) t.highGameScratch = bestScratchGame
      if (team.scratchSeries > t.highSeriesScratch) t.highSeriesScratch = team.scratchSeries

      const bestHdcpGame = bestScratchGame + team.handicapPerGame
      if (bestHdcpGame > t.highGameHdcp) {
        t.highGameHdcp    = bestHdcpGame
        t.hdcpGameScratch = bestScratchGame
        t.hdcpGameHdcp    = team.handicapPerGame
      }

      if (team.totalSeries > t.highSeriesHdcp) {
        t.highSeriesHdcp    = team.totalSeries
        t.hdcpSeriesScratch = team.scratchSeries
        t.hdcpSeriesHdcp    = team.handicapSeries
      }
    }
  }

  const teamList = Object.values(teamHalves)
  const topTeamGameScratch   = [...teamList].sort((a, b) => b.highGameScratch - a.highGameScratch)[0]
  const topTeamSeriesScratch = [...teamList].sort((a, b) => b.highSeriesScratch - a.highSeriesScratch)[0]
  const topTeamGameHdcp      = [...teamList].sort((a, b) => b.highGameHdcp - a.highGameHdcp)[0]
  const topTeamSeriesHdcp    = [...teamList].sort((a, b) => b.highSeriesHdcp - a.highSeriesHdcp)[0]

  const fmtAvg = (b: typeof byAvg[0]) =>
    (b.totalPins / b.totalGames).toFixed(1)

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
        winner: topTeamSeriesScratch?.name             ?? '—',
        score:  topTeamSeriesScratch?.highSeriesScratch ?? '—',
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
        winner: topTeamSeriesHdcp?.name          ?? '—',
        score:  topTeamSeriesHdcp?.highSeriesHdcp ?? '—',
        detail: topTeamSeriesHdcp
          ? `${topTeamSeriesHdcp.hdcpSeriesScratch} + ${topTeamSeriesHdcp.hdcpSeriesHdcp} HDCP`
          : undefined,
      },
    ],
    individual: [
      {
        label:  'High Average',
        prize:  '$50',
        winner: byAvg[0]?.name    ?? '—',
        score:  byAvg[0] ? fmtAvg(byAvg[0]) : '—',
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
    ],
  }
}

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

      {/* Individual row: 3 cards centered */}
      <div className="award-row-label">Individual</div>
      <div className="award-grid-3-centered">
        {awards.individual.map(a => <AwardCard key={a.label} award={a} />)}
      </div>
    </div>
  )
}

function AwardLeaders() {
  const bowlers  = bowlerStatsData as BowlerStat[]
  const matchups = weeklyMatchupData as MatchupDetail[]
  const schedule = scheduleWeeksData as ScheduleWeek[]

  const { firstHalf, secondHalf } = useMemo(() => {
    // Build dataWeek sets per half (bowling weeks 1-16 = first, 17-32 = second)
    const firstWeeks  = new Set(
      schedule.filter(s => s.week !== null && s.week <= 16  && s.dataWeek !== null).map(s => s.dataWeek!)
    )
    const secondWeeks = new Set(
      schedule.filter(s => s.week !== null && s.week >= 17 && s.week <= 32 && s.dataWeek !== null).map(s => s.dataWeek!)
    )

    // A half is "complete" when all its scheduled bowling nights are completed
    const firstComplete  = schedule
      .filter(s => s.week !== null && s.week <= 16)
      .every(s => s.status === 'completed')
    const secondComplete = schedule
      .filter(s => s.week !== null && s.week >= 17 && s.week <= 32)
      .every(s => s.status === 'completed')

    const secondHasData = schedule.some(
      s => s.week !== null && s.week >= 17 && s.status === 'completed'
    )

    return {
      firstHalf: {
        weeks:    firstWeeks,
        complete: firstComplete,
        hasData:  true,
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
    </div>
  )
}

export default AwardLeaders
