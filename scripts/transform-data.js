/**
 * transform-data.js
 *
 * Reads raw LeaguePals API data from leaguepals-data/ and transforms it
 * into the JSON formats expected by the React site components in src/data/.
 *
 * Generates:
 *   src/data/teams.json           — Team[] (real names, W/L/T, points)
 *   src/data/historicalMatches.json — Matchup[] (completed weeks with scores)
 *   src/data/matchups.json        — Matchup[] (upcoming weeks, no scores)
 *   src/data/seasons.json         — Season[] (2025-26 current season from standings)
 *
 * Usage: node scripts/transform-data.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const RAW_DIR = join(ROOT, 'leaguepals-data')
const TEAMS_RAW_DIR = join(RAW_DIR, 'teams')
const OUT_DIR = join(ROOT, 'src', 'data')

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reads and parses a JSON file from the raw data directory.
 * @param {string} filePath - Absolute path to JSON file
 * @returns {any}
 */
function loadJSON(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`)
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/**
 * Writes data as pretty-printed JSON to src/data/.
 * @param {string} filename - Filename within src/data/
 * @param {any} data - Data to serialize
 */
function write(filename, data) {
  const filePath = join(OUT_DIR, filename)
  writeFileSync(filePath, JSON.stringify(data, null, 2))
  console.log(`  ✓ Wrote src/data/${filename} (${data.length} entries)`)
}

// ─── Load raw data ────────────────────────────────────────────────────────────

const standings = loadJSON(join(RAW_DIR, 'standings.json'))
const schedule = loadJSON(join(RAW_DIR, 'lane-schedule.json'))

/**
 * Loads all team roster files from leaguepals-data/teams/.
 * Returns a map of LP ObjectId → array of bowler objects.
 * Teams with no bowlers (dropped/bye) are excluded.
 *
 * @returns {Map<string, any[]>}
 */
function loadTeamRosters() {
  const standingsList = standings.data?.standings ?? []
  const rosterMap = new Map()

  for (const entry of standingsList) {
    const teamId = entry.team?._id
    if (!teamId) continue

    const filePath = join(TEAMS_RAW_DIR, `${teamId}.json`)
    if (!existsSync(filePath)) continue

    const raw = loadJSON(filePath)
    const bowlers = raw.data ?? []

    // Skip bye/vacant/empty teams
    if (bowlers.length === 0) continue

    rosterMap.set(teamId, bowlers)
  }

  return rosterMap
}

const rosterMap = loadTeamRosters()

// ─── Build team ID map ────────────────────────────────────────────────────────

/**
 * Builds a stable mapping from LP ObjectId → sequential site integer ID.
 * Teams are ordered by current standings rank (most points first).
 * Vacant/empty teams are excluded.
 *
 * @returns {Map<string, number>}
 */
function buildTeamIdMap() {
  const standingsList = standings.data?.standings ?? []

  // Sort by pointsWon descending (standings order), filter out empty teams
  const active = standingsList
    .filter(s => rosterMap.has(s.team?._id))
    .sort((a, b) => {
      if (b.pointsWon !== a.pointsWon) return b.pointsWon - a.pointsWon
      // Secondary sort: wins desc
      return b.wins - a.wins
    })

  const idMap = new Map()
  active.forEach((entry, i) => {
    idMap.set(entry.team._id, i + 1)
  })

  return idMap
}

const teamIdMap = buildTeamIdMap()

// ─── Transform: teams.json ────────────────────────────────────────────────────

/**
 * Builds the Team[] array for src/data/teams.json.
 * Uses standings for W/L/points, and the roster for the captain name.
 *
 * Team interface: { id, name, captain, wins, losses, points }
 *
 * @returns {object[]}
 */
function buildTeams() {
  const standingsList = standings.data?.standings ?? []

  return standingsList
    .filter(s => teamIdMap.has(s.team?._id))
    .map(s => {
      const lpId = s.team._id
      const siteId = teamIdMap.get(lpId)
      const bowlers = rosterMap.get(lpId) ?? []

      // Find the captain (fall back to officer if captain flag isn't set)
      const captain =
        bowlers.find(b => b.isCaptain)?.name ??
        bowlers.find(b => b.isOfficer)?.name ??
        ''

      return {
        id: siteId,
        name: s.team.name,
        captain,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        points: s.pointsWon,
      }
    })
    .sort((a, b) => a.id - b.id)
}

// ─── Score computation ────────────────────────────────────────────────────────

/**
 * Returns the total scratch pinfall for a team on a given date.
 * Sums each bowler's series (games[3]) for that date.
 * Absent bowlers (series === 0 or games[0] === '-') are excluded.
 *
 * @param {string} teamLpId - LP ObjectId for the team
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {number|null} Total pins, or null if no scores were recorded
 */
function getTeamPinsForDate(teamLpId, dateStr) {
  const bowlers = rosterMap.get(teamLpId)
  if (!bowlers) return null

  let total = 0
  let hasSomeScore = false

  for (const bowler of bowlers) {
    const weekEntry = bowler.weekGames?.[dateStr]
    if (!weekEntry || weekEntry.length === 0) continue

    // weekGames entries are arrays; use the first (and typically only) entry
    const entry = weekEntry[0]
    const games = entry?.games ?? []

    // games format: [g1, g2, g3, series] — absent bowlers have ['-','-','-',0]
    const series = games[3]
    if (typeof series === 'number' && series > 0) {
      total += series
      hasSomeScore = true
    }
  }

  return hasSomeScore ? total : null
}

// ─── Transform: matchups ──────────────────────────────────────────────────────

/**
 * Builds all matchups from the lane schedule, split into:
 *   - historical (completed weeks before today, with real scores)
 *   - upcoming (future weeks, no scores yet)
 *
 * Skipped weeks (holidays) and weeks with no matches are omitted.
 * Teams not in the active team map (dropped/vacant) are omitted.
 *
 * Matchup interface: { id, week, date, team1Id, team2Id, team1Score, team2Score, completed }
 *
 * @returns {{ historical: object[], upcoming: object[] }}
 */
function buildMatchups() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const weeks = schedule.schedule ?? []
  const historical = []
  const upcoming = []
  let matchId = 1

  weeks.forEach((week, weekIndex) => {
    // Skip weeks with no matches (holidays, filler)
    if (!week.matches || week.matches.length === 0) return

    const weekDate = new Date(week.date)
    weekDate.setHours(0, 0, 0, 0)
    const dateStr = week.date.slice(0, 10)         // YYYY-MM-DD
    const isPast = weekDate < today
    // Weeks are 1-based; normalWeek > 0 means it's a counted week
    const weekNum = weekIndex + 1

    for (const match of week.matches) {
      const team1SiteId = teamIdMap.get(match.team1_id)
      const team2SiteId = teamIdMap.get(match.team2_id)

      // Skip matches involving dropped/vacant teams
      if (!team1SiteId || !team2SiteId) continue

      if (isPast) {
        // Compute real team pin totals from bowler score history
        const team1Score = getTeamPinsForDate(match.team1_id, dateStr)
        const team2Score = getTeamPinsForDate(match.team2_id, dateStr)

        historical.push({
          id: matchId++,
          week: weekNum,
          date: dateStr,
          team1Id: team1SiteId,
          team2Id: team2SiteId,
          team1Score,
          team2Score,
          completed: team1Score !== null && team2Score !== null,
        })
      } else {
        // Future match — no scores yet
        upcoming.push({
          id: matchId++,
          week: weekNum,
          date: dateStr,
          team1Id: team1SiteId,
          team2Id: team2SiteId,
          team1Score: null,
          team2Score: null,
          completed: false,
        })
      }
    }
  })

  return { historical, upcoming }
}

// ─── Transform: seasons.json ──────────────────────────────────────────────────

/**
 * Builds the Season[] array for src/data/seasons.json.
 * Produces one entry for the current 2025-26 season using real standings data.
 * The champion field is left as TBD until the season ends.
 *
 * Season interface: { year, startDate, endDate, champion, teams: SeasonTeam[] }
 * SeasonTeam interface: { id, name, wins, losses, points }
 *
 * @returns {object[]}
 */
function buildSeasons() {
  const standingsList = standings.data?.standings ?? []

  // Current season teams sorted by rank
  const seasonTeams = standingsList
    .filter(s => teamIdMap.has(s.team?._id))
    .map(s => ({
      id: teamIdMap.get(s.team._id),
      name: s.team.name,
      wins: s.wins,
      losses: s.losses,
      points: s.pointsWon,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return b.wins - a.wins
    })

  const currentSeason = {
    year: '2025-2026',
    startDate: '2025-09-04',
    endDate: '2026-05-07',
    // Champion unknown until season ends; top team shown provisionally
    champion: seasonTeams[0]?.name ?? 'TBD',
    teams: seasonTeams,
  }

  return [currentSeason]
}

// ─── Lane lookup ──────────────────────────────────────────────────────────────

/**
 * Builds a two-level lookup: dateStr → teamLpId → { lane, opponentLpId }.
 * Used by both matchup detail and bowler stats builders to map team → lane/opponent.
 *
 * @returns {Map<string, Map<string, {lane: number, opponentLpId: string}>>}
 */
function buildLaneLookup() {
  const lookup = new Map()
  const weeks = schedule.schedule ?? []

  for (const week of weeks) {
    if (!week.matches || week.matches.length === 0) continue
    const dateStr = week.date.slice(0, 10)
    if (!lookup.has(dateStr)) lookup.set(dateStr, new Map())
    const dateMap = lookup.get(dateStr)

    for (const match of week.matches) {
      dateMap.set(match.team1_id, { lane: match.team1_lane, opponentLpId: match.team2_id })
      dateMap.set(match.team2_id, { lane: match.team2_lane, opponentLpId: match.team1_id })
    }
  }

  return lookup
}

const laneLookup = buildLaneLookup()

// ─── Transform: weeklyMatchupDetails.json ─────────────────────────────────────

/**
 * Builds a detailed per-match breakdown for every completed historical week.
 * Each entry contains both teams' bowler scores (g1/g2/g3/series), game totals,
 * team scratch averages, and computed handicap per game and series.
 *
 * Handicap formula (pctOfOpponent @ 85%):
 *   handicapPerGame = max(0, floor((opponentTeamAvg - myTeamAvg) * 0.85))
 *   handicapSeries  = handicapPerGame * 3
 *
 * Team averages are the sum of season `average` fields for bowlers who actually
 * bowled that week (series > 0). This matches how LeaguePals computes team avg.
 *
 * The `id` field mirrors the corresponding historicalMatches.json entry so
 * components can cross-reference by match ID.
 *
 * @returns {object[]}
 */
function buildWeeklyMatchupDetails() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Quick name lookup from standings so we don't iterate the array per match
  const nameLookup = new Map()
  for (const s of (standings.data?.standings ?? [])) {
    if (s.team?._id) nameLookup.set(s.team._id, s.team.name)
  }

  const weeks = schedule.schedule ?? []
  const results = []
  let matchId = 1
  const HDCP_PCT = 0.85

  /**
   * Gathers active bowler scores and per-game/series totals for one side of a match.
   *
   * @param {string} teamLpId - LP ObjectId for the team
   * @param {number} siteId   - Sequential site integer ID
   * @param {number} lane     - Lane number from schedule
   * @param {string} dateStr  - YYYY-MM-DD
   * @returns {object}
   */
  function buildTeamDetail(teamLpId, siteId, lane, dateStr) {
    const bowlers = rosterMap.get(teamLpId) ?? []
    const activeBowlers = []

    for (const b of bowlers) {
      const entry = b.weekGames?.[dateStr]?.[0]
      if (!entry) continue
      const games = entry.games ?? []
      const series = games[3]
      if (typeof series !== 'number' || series <= 0) continue

      activeBowlers.push({
        name: b.name,
        g1: games[0],
        g2: games[1],
        g3: games[2],
        series,
        average: b.average ?? 0,
      })
    }

    const toNum = v => (typeof v === 'number' ? v : 0)
    const g1Total = activeBowlers.reduce((s, b) => s + toNum(b.g1), 0)
    const g2Total = activeBowlers.reduce((s, b) => s + toNum(b.g2), 0)
    const g3Total = activeBowlers.reduce((s, b) => s + toNum(b.g3), 0)
    const scratchSeries = g1Total + g2Total + g3Total
    const teamAvg = activeBowlers.reduce((s, b) => s + b.average, 0)

    return {
      id: siteId,
      name: nameLookup.get(teamLpId) ?? '',
      lane,
      bowlers: activeBowlers,
      gameTotals: { g1: g1Total, g2: g2Total, g3: g3Total },
      scratchSeries,
      teamAvg,
      // handicap fields populated after both sides are built
    }
  }

  weeks.forEach((week, weekIndex) => {
    if (!week.matches || week.matches.length === 0) return

    const weekDate = new Date(week.date)
    weekDate.setHours(0, 0, 0, 0)
    const dateStr = week.date.slice(0, 10)
    const isPast = weekDate < today
    const weekNum = weekIndex + 1

    for (const match of week.matches) {
      const team1SiteId = teamIdMap.get(match.team1_id)
      const team2SiteId = teamIdMap.get(match.team2_id)
      if (!team1SiteId || !team2SiteId) continue

      // Increment in lockstep with buildMatchups so IDs match historicalMatches.json
      const currentMatchId = matchId++
      if (!isPast) continue

      const team1 = buildTeamDetail(match.team1_id, team1SiteId, match.team1_lane, dateStr)
      const team2 = buildTeamDetail(match.team2_id, team2SiteId, match.team2_lane, dateStr)

      // Lower-average team gets the handicap; the other team gets 0
      const t1Hdcp = Math.max(0, Math.floor((team2.teamAvg - team1.teamAvg) * HDCP_PCT))
      const t2Hdcp = Math.max(0, Math.floor((team1.teamAvg - team2.teamAvg) * HDCP_PCT))

      team1.handicapPerGame = t1Hdcp
      team1.handicapSeries = t1Hdcp * 3
      team1.totalSeries = team1.scratchSeries + team1.handicapSeries

      team2.handicapPerGame = t2Hdcp
      team2.handicapSeries = t2Hdcp * 3
      team2.totalSeries = team2.scratchSeries + team2.handicapSeries

      results.push({ id: currentMatchId, week: weekNum, date: dateStr, team1, team2 })
    }
  })

  return results
}

// ─── Transform: bowlerStats.json ──────────────────────────────────────────────

/**
 * Builds week-by-week statistics for every bowler on every active team.
 * Each bowler entry includes season stats (average, high game, etc.) and a
 * weeks array with game scores, lane, and opponent for every week they bowled.
 *
 * Absent weeks (games[3] === 0 or '-') are omitted.
 * Future weeks are omitted.
 *
 * @returns {object[]}
 */
function buildBowlerStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Map dateStr → 1-based week number for fast lookup
  const weekDateIndex = new Map()
  const weeks = schedule.schedule ?? []
  weeks.forEach((week, i) => {
    if (!week.matches || week.matches.length === 0) return
    weekDateIndex.set(week.date.slice(0, 10), i + 1)
  })

  // Quick opponent name lookup from standings
  const oppNameLookup = new Map()
  for (const s of (standings.data?.standings ?? [])) {
    if (s.team?._id) oppNameLookup.set(s.team._id, s.team.name)
  }

  const results = []

  for (const [teamLpId, bowlers] of rosterMap.entries()) {
    const siteId = teamIdMap.get(teamLpId)
    if (!siteId) continue

    for (const b of bowlers) {
      const weekGames = b.weekGames ?? {}
      const bowlerWeeks = []

      for (const [dateStr, entries] of Object.entries(weekGames)) {
        const d = new Date(dateStr)
        d.setHours(0, 0, 0, 0)
        if (d >= today) continue

        const entry = entries?.[0]
        if (!entry) continue
        const games = entry.games ?? []
        const series = games[3]
        if (typeof series !== 'number' || series <= 0) continue

        const weekNum = weekDateIndex.get(dateStr)
        if (!weekNum) continue

        const laneInfo = laneLookup.get(dateStr)?.get(teamLpId)
        const oppLpId = laneInfo?.opponentLpId ?? null

        bowlerWeeks.push({
          week: weekNum,
          date: dateStr,
          lane: laneInfo?.lane ?? null,
          opponentTeamId: oppLpId ? (teamIdMap.get(oppLpId) ?? null) : null,
          opponentTeamName: oppLpId ? (oppNameLookup.get(oppLpId) ?? '') : '',
          g1: games[0],
          g2: games[1],
          g3: games[2],
          series,
        })
      }

      bowlerWeeks.sort((a, b) => a.week - b.week)

      results.push({
        id: b._id,
        name: b.name,
        teamId: siteId,
        teamName: b.teamName ?? '',
        average: b.average ?? 0,
        enteringAvg: b.enteringAvg ?? 0,
        highGame: b.highGame ?? 0,
        highSeries: b.highSeries ?? 0,
        weeks: bowlerWeeks,
      })
    }
  }

  return results
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('LeaguePals Data Transformer')
  console.log(`Active teams: ${teamIdMap.size}`)
  console.log(`Schedule weeks: ${(schedule.schedule ?? []).length}\n`)

  // 1. Build and write teams
  console.log('Building teams.json...')
  const teams = buildTeams()
  write('teams.json', teams)

  // 2. Build and write matchups
  console.log('\nBuilding matchups...')
  const { historical, upcoming } = buildMatchups()

  // Historical matches (completed weeks)
  const completedCount = historical.filter(m => m.completed).length
  const pendingScores = historical.filter(m => !m.completed).length
  console.log(`  Historical: ${historical.length} matches (${completedCount} with scores, ${pendingScores} missing scores)`)
  write('historicalMatches.json', historical)

  // Upcoming matches (future weeks)
  console.log(`  Upcoming: ${upcoming.length} matches`)
  write('matchups.json', upcoming)

  // 3. Build and write seasons
  console.log('\nBuilding seasons.json...')
  const seasons = buildSeasons()
  write('seasons.json', seasons)

  // 4. Build and write weekly matchup details
  console.log('\nBuilding weeklyMatchupDetails.json...')
  const matchupDetails = buildWeeklyMatchupDetails()
  write('weeklyMatchupDetails.json', matchupDetails)

  // 5. Build and write bowler stats
  console.log('\nBuilding bowlerStats.json...')
  const bowlerStats = buildBowlerStats()
  write('bowlerStats.json', bowlerStats)

  // Summary
  console.log('\n─────────────────────────────────────────')
  console.log('Transform complete!')
  console.log(`  ${teams.length} teams`)
  console.log(`  ${historical.length} historical matchups (${completedCount} scored)`)
  console.log(`  ${upcoming.length} upcoming matchups`)
  console.log(`  ${matchupDetails.length} matchup detail records`)
  console.log(`  ${bowlerStats.length} bowler stat records`)
  console.log('─────────────────────────────────────────')
  console.log('\nTeam standings:')
  teams
    .sort((a, b) => b.points - a.points)
    .forEach((t, i) => console.log(`  ${String(i+1).padStart(2)}. ${t.name.padEnd(28)} W:${t.wins} L:${t.losses} T:${t.ties} Pts:${t.points}`))
}

main()
