/**
 * transform-data.js
 *
 * Reads raw LeaguePals API data from leaguepals-data/ and transforms it
 * into the JSON formats expected by the React site components in src/data/.
 *
 * Also writes all transformed data directly to Firestore when a valid
 * service account is configured via FIREBASE_SERVICE_ACCOUNT_PATH in .env.
 *
 * Generates:
 *   src/data/teams.json             — Team[] (real names, W/L/T, points)
 *   src/data/historicalMatches.json — Matchup[] (completed weeks with scores)
 *   src/data/matchups.json          — Matchup[] (upcoming weeks, no scores)
 *   src/data/seasons.json           — Season[] (2025-26 current season from standings)
 *
 * Usage: node scripts/transform-data.js
 */

// Load environment variables from .env before any other side-effectful code
import 'dotenv/config'

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import admin from 'firebase-admin'

const __dirname = dirname(fileURLToPath(import.meta.url))

// createRequire lets us use require() semantics (including JSON loading) in ESM
const _require = createRequire(import.meta.url)

// ─── Firebase Admin Initialization ───────────────────────────────────────────

/**
 * Initializes firebase-admin using a service account JSON file.
 * The path to the service account file is read from FIREBASE_SERVICE_ACCOUNT_PATH
 * (defaults to ./service-account.json relative to the project root).
 *
 * If the file is missing or initialization fails for any reason, `db` is set to
 * null and all Firestore writes are silently skipped — the transform continues
 * to produce local JSON files as normal.
 */

// Resolve the service account path relative to the project root (one level up from scripts/)
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json'

/** @type {import('firebase-admin').firestore.Firestore|null} */
let db
try {
  const serviceAccount = _require(resolve(join(__dirname, '..'), serviceAccountPath))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  db = admin.firestore()
  console.log('[firebase-admin] Initialized Firestore connection')
} catch (err) {
  console.warn('[firebase-admin] Could not initialize:', err.message)
  console.warn('[firebase-admin] Set FIREBASE_SERVICE_ACCOUNT_PATH in .env to enable Firestore writes')
  db = null
}

// ─── Firestore Batch Write Helpers ───────────────────────────────────────────

/**
 * Writes documents to a Firestore collection in batches of 500.
 *
 * Firestore batch operations are capped at 500 writes per batch. This helper
 * automatically chunks the `docs` array so callers never need to think about
 * the limit. If Firestore is not initialized (`db === null`), the function logs
 * a warning and returns early — no error is thrown.
 *
 * @param {string} collectionName - Target Firestore collection name
 * @param {Object[]} docs - Array of plain document data objects to write
 * @param {Function|null} getDocId - Optional function(doc) => string that returns
 *   a custom document ID for each doc. When null, Firestore auto-generates IDs.
 * @returns {Promise<void>}
 */
async function batchWrite(collectionName, docs, getDocId = null) {
  if (!db) {
    console.warn(`[batchWrite] Skipping ${collectionName} — Firestore not initialized`)
    return
  }

  const CHUNK_SIZE = 500
  let written = 0

  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE)
    const batch = db.batch()

    for (const doc of chunk) {
      // Use caller-supplied ID function if provided, otherwise let Firestore auto-generate
      const ref = getDocId
        ? db.collection(collectionName).doc(getDocId(doc))
        : db.collection(collectionName).doc()
      batch.set(ref, doc)
    }

    await batch.commit()
    written += chunk.length
    console.log(`[${collectionName}] Wrote ${written}/${docs.length} documents`)
  }
}

/**
 * Deletes all documents in a Firestore collection, batched in groups of 500.
 *
 * Used before re-seeding a collection to ensure idempotent re-runs. If the
 * collection is already empty, logs a message and returns early. If Firestore
 * is not initialized, returns silently.
 *
 * @param {string} collectionName - Name of the collection to clear
 * @returns {Promise<void>}
 */
async function clearCollection(collectionName) {
  if (!db) { return }

  const snapshot = await db.collection(collectionName).get()
  if (snapshot.empty) {
    console.log(`[clearCollection] ${collectionName} is already empty`)
    return
  }

  const CHUNK_SIZE = 500
  for (let i = 0; i < snapshot.docs.length; i += CHUNK_SIZE) {
    const batch = db.batch()
    snapshot.docs.slice(i, i + CHUNK_SIZE).forEach(doc => batch.delete(doc.ref))
    await batch.commit()
  }

  console.log(`[clearCollection] Cleared ${snapshot.docs.length} docs from ${collectionName}`)
}

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

// ─── Firestore: leagueConfig Collection ──────────────────────────────────────

/**
 * Populates the `leagueConfig` Firestore collection with one document per season.
 *
 * Attempts to read `leaguepals-data/league-public.json` and maps known API fields
 * to the canonical leagueConfig schema. Fields not available from the LeaguePals API
 * (handicapPct, handicapBase, gamesPerNight, numTeams, bowlingCenter) are always
 * set to known-good hardcoded values from league rules.
 *
 * If `league-public.json` is missing (e.g., not yet fetched), the function falls
 * back to a full set of hardcoded defaults so the script remains runnable in any
 * environment.
 *
 * The document is written directly with `db.collection('leagueConfig').doc(seasonYear).set()`
 * rather than via `batchWrite()` because only one document is written per invocation
 * and no batch chunking is needed.
 *
 * @param {string} seasonYear - Firestore document ID, e.g. "2025-2026"
 * @returns {Promise<void>}
 */
async function populateLeagueConfig(seasonYear) {
  if (!db) {
    console.warn('[populateLeagueConfig] Skipping leagueConfig — Firestore not initialized')
    return
  }

  // Path to the league public info from the LeaguePals API
  const leaguePublicPath = join(RAW_DIR, 'league-public.json')

  /** @type {object} Firestore document to write */
  let doc

  if (existsSync(leaguePublicPath)) {
    // ── Source data exists: map API fields to canonical schema ────────────────
    const raw = JSON.parse(readFileSync(leaguePublicPath, 'utf8'))

    // The API response wraps the league object under a `data` key
    const api = raw.data ?? raw

    doc = {
      seasonYear,

      // League identity — fall back to a known name if the API name is absent
      leagueName: api.name ?? 'Late Night Happy Hour Bowling League',
      leagueType: api.leagueType ?? 'Mens',

      // Schedule info
      weekday: api.weekday ?? 'Thursday',
      startTime: api.time ?? '8:20 PM',

      // Facility info — not in the LeaguePals API; always use hardcoded value
      bowlingCenter: 'Unknown',

      // Sanction number (LeaguePals stores it as a number; normalize to integer)
      sanctionNumber: typeof api.sanction === 'number' ? api.sanction : 0,

      // Team / bowler counts — `numTeams` is not in the API so we hardcode it
      numTeams: 13,
      bowlersPerTeam: typeof api.numPlayers === 'number' ? api.numPlayers : 4,

      // Per-night games — not available in the LeaguePals API; hardcode from rules
      gamesPerNight: 3,

      // Season length from payment/fee structure
      totalWeeks: typeof api.paymentWeeks === 'number' ? api.paymentWeeks : 33,

      // Physical setup
      numLanes: typeof api.numLanes === 'number' ? api.numLanes : 26,

      // Handicap formula — these values are defined by league rules, not the API
      handicapPct: 0.85,
      handicapBase: 220,

      // Blind score: API field is `againstBlindScorePct` (a percentage value 0-100).
      // Convert to a decimal fraction (e.g., 10 → 0.10) if the API value looks like
      // a whole-number percentage, otherwise use it as-is.
      blindScorePct: (() => {
        const raw = api.againstBlindScorePct
        if (typeof raw !== 'number') return 0.9
        // Values > 1 are assumed to be whole-number percentages (e.g., 10 means 10%)
        return raw > 1 ? raw / 100 : raw
      })(),

      // Minimum games needed for an average to count this season
      minGamesForAvg: typeof api.minGamesforAvg === 'number' ? api.minGamesforAvg : 3,

      // Minimum games bowled in prior season to use entering average
      prevSeasonMinGames: typeof api.previousGamesMin === 'number' ? api.previousGamesMin : 21,

      // Position round scheduling description
      positionRoundSchedule: api.positionRounds ?? 'Every other night',

      // Financial fields
      dues: typeof api.dues === 'number' ? api.dues : 0,
      lineage: typeof api.lineage === 'number' ? api.lineage : 0,
      entryFee: typeof api.entryFee === 'number' ? api.entryFee : 0,

      // LeaguePals internal ID for cross-referencing
      leaguePalsId: api._id ?? '',
    }

    console.log('[populateLeagueConfig] Mapped fields from league-public.json')
  } else {
    // ── league-public.json not found: use full hardcoded defaults ─────────────
    console.warn('[populateLeagueConfig] league-public.json not found — using hardcoded defaults')

    doc = {
      seasonYear,
      leagueName: 'Late Night Happy Hour Bowling League',
      leagueType: 'Mens',
      weekday: 'Thursday',
      startTime: '8:20 PM',
      bowlingCenter: 'Unknown',
      sanctionNumber: 0,
      numTeams: 13,
      bowlersPerTeam: 4,
      gamesPerNight: 3,
      totalWeeks: 33,
      numLanes: 26,
      handicapPct: 0.85,
      handicapBase: 220,
      blindScorePct: 0.9,
      minGamesForAvg: 3,
      prevSeasonMinGames: 21,
      positionRoundSchedule: 'Every other night',
      dues: 0,
      lineage: 0,
      entryFee: 0,
      leaguePalsId: '',
    }
  }

  // Single-document write — no batch needed since there is exactly one config doc per season
  await db.collection('leagueConfig').doc(seasonYear).set(doc)
  console.log(`[leagueConfig] Wrote document "${seasonYear}"`)
}

// ─── Firestore: teams Collection ─────────────────────────────────────────────

/**
 * Populates the `teams` Firestore collection with one document per active team.
 *
 * Primary data source: `leaguepals-data/standings.json`, which contains rich
 * team-level stats (average, scratchPins, totalPins, pctWon, highGame,
 * pointsWon, pointsLost) that the local JSON transform was previously
 * discarding.
 *
 * Fallback: `src/data/teams.json` — the locally-built file produced by
 * `buildTeams()`. This is used when standings.json is missing (unlikely in
 * practice but guards against accidental file removal during development).
 * Fallback docs have stub zeroes for all stats fields.
 *
 * Document ID: LeaguePals MongoDB ObjectId string (`team._id`). This is the
 * canonical FK used by all downstream Firestore collections (bowlers,
 * bowlerScores, matchups) so stable string IDs are required from the start.
 *
 * The `captainBowlerId` field is intentionally left null; it will be set by
 * the admin UI in Phase 5 after bowler documents are created.
 *
 * @param {string} seasonYear - e.g. "2025-2026". Stored on every document for
 *   easy query filtering.
 * @returns {Promise<void>}
 */
async function populateTeams(seasonYear) {
  if (!db) {
    console.warn('[populateTeams] Skipping teams — Firestore not initialized')
    return
  }

  /** @type {object[]} */
  let docs

  const standingsPath = join(RAW_DIR, 'standings.json')

  if (existsSync(standingsPath)) {
    // ── Primary path: use standings.json for full stat coverage ───────────────
    const raw = JSON.parse(readFileSync(standingsPath, 'utf8'))
    const standingsList = raw.data?.standings ?? []

    docs = standingsList.map((entry, index) => {
      const team = entry.team ?? {}

      return {
        // Firestore document identity
        leaguePalsId: team._id ?? '',

        // Display order follows standings rank (1 = best record)
        displayId: index + 1,

        // Season FK — every doc tagged for easy cross-season queries
        seasonYear,

        // Team name and captain info
        name: team.name ?? '',

        // Phase 5 admin will resolve the captain's bowler document ID
        captainBowlerId: null,

        // Win / loss record
        wins: entry.wins ?? 0,
        losses: entry.losses ?? 0,
        ties: entry.ties ?? 0,

        // Points-based standings
        pointsWon: entry.pointsWon ?? 0,
        pointsLost: entry.pointsLost ?? 0,

        // Win percentage — LeaguePals stores this as a string ("48.21");
        // parse to a float so Firestore can do numeric comparisons/sorting.
        pctWon: parseFloat(entry.pctWon ?? '0') || 0,

        // Team-level pin statistics
        average: entry.average ?? 0,
        scratchPins: entry.scratchPins ?? 0,
        totalPins: entry.totalPins ?? 0,

        // maxGame from the standings API maps to highGame in our schema
        highGame: entry.maxGame ?? 0,
      }
    })

    console.log(`[populateTeams] Mapped ${docs.length} teams from standings.json`)
  } else {
    // ── Fallback path: derive from the locally built teams.json ───────────────
    // This path is a safety net; stats fields are zeroed out because the local
    // JSON only carries W/L/points — not the richer stats from the API.
    console.warn('[populateTeams] standings.json not found — falling back to src/data/teams.json')

    const localTeamsPath = join(OUT_DIR, 'teams.json')
    const localTeams = existsSync(localTeamsPath)
      ? JSON.parse(readFileSync(localTeamsPath, 'utf8'))
      : buildTeams()

    docs = localTeams.map(team => ({
      leaguePalsId: String(team.id), // placeholder — not a real ObjectId
      displayId: team.id,
      seasonYear,
      name: team.name ?? '',
      captainBowlerId: null,
      wins: team.wins ?? 0,
      losses: team.losses ?? 0,
      ties: team.ties ?? 0,
      pointsWon: team.points ?? 0,
      pointsLost: 0,
      pctWon: 0,
      average: 0,
      scratchPins: 0,
      totalPins: 0,
      highGame: 0,
    }))
  }

  // Use the LeaguePals ObjectId as the Firestore document ID so that all
  // collections sharing this FK can be joined without an extra lookup step.
  await batchWrite('teams', docs, doc => doc.leaguePalsId)
}

// ─── Firestore: bowlers Collection ───────────────────────────────────────────

/**
 * Populates the `bowlers` Firestore collection with one document per active
 * bowler for the given season.
 *
 * Primary data source: individual team JSON files at
 * `leaguepals-data/teams/{teamId}.json`. Each file's `.data` array contains
 * rich per-bowler stats (highGame, highGameHdcp, highSeries, highSeriesHdcp,
 * gamesPlayed, blindWeeksTotal, blindWeeksRow, indPointsWon, etc.) that were
 * not exposed through the old local JSON pipeline.
 *
 * Intentionally excluded fields (privacy / unused):
 *   birthDate, dexterity, isFemale, dontIdentify, isJunior, classification
 *
 * Fallback: `src/data/bowlerStats.json` — used when no team files are found
 * (rare; only during initial dev bootstrapping). The bowler name is split into
 * firstName/lastName on whitespace, stats are zeroed for missing fields.
 *
 * Document ID: LeaguePals MongoDB ObjectId string (`player._id`). Used as FK
 * in the `bowlerScores` collection and for admin captain-assignment.
 *
 * @param {string} seasonYear - e.g. "2025-2026". Stored on every document for
 *   easy query filtering.
 * @returns {Promise<void>}
 */
async function populateBowlers(seasonYear) {
  if (!db) {
    console.warn('[populateBowlers] Skipping bowlers — Firestore not initialized')
    return
  }

  /** @type {object[]} */
  let docs

  // Glob all team JSON files present in the raw data directory.
  // We use the directory listing rather than deriving IDs from standings so
  // the function remains correct even if standings and the team files drift.
  const teamFilePaths = readdirSync(TEAMS_RAW_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(TEAMS_RAW_DIR, f))

  if (teamFilePaths.length > 0) {
    // ── Primary path: individual team JSON files ──────────────────────────────
    docs = []

    for (const filePath of teamFilePaths) {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'))

      // Team files store players in a `.data` array; the team-level object is
      // available on each player as `.team` (ObjectId string) and `.teamName`.
      const players = raw.data ?? []
      if (players.length === 0) continue // skip vacant/bye teams

      for (const player of players) {
        // Derive the prior season year string from the current season.
        // e.g. "2025-2026" → "2024-2025"
        const [startYear] = (seasonYear ?? '2025-2026').split('-').map(Number)
        const enteringAvgSeason = `${startYear - 1}-${startYear}`

        docs.push({
          // ── Document identity ─────────────────────────────────────────────
          leaguePalsId: player._id ?? '',

          // ── Season FK ────────────────────────────────────────────────────
          seasonYear,

          // ── Team FK (LeaguePals ObjectId string) ─────────────────────────
          // `player.team` is the team's ObjectId stored on every player record
          teamId: player.team ?? '',

          // Denormalized team name so bowler queries don't need a join
          teamName: player.teamName ?? '',

          // ── Name fields ───────────────────────────────────────────────────
          firstName: player.firstName ?? '',
          lastName: player.lastName ?? '',
          // Pre-computed full name for display convenience
          name: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),

          // ── Avatar ────────────────────────────────────────────────────────
          // Intentionally null when no custom avatar has been uploaded
          avatarUrl: player.avatar || null,

          // ── Current-season average (integer) ─────────────────────────────
          // `avg` is the truncated integer, `average` is the stored round number;
          // fall back chain: realAvg (truncated) → average (stored)
          average: player.realAvg ?? player.average ?? 0,

          // Floating-point average for precision sorting / display
          averageFloat: player.realAvgFloat ?? player.averageFloat ?? player.avg ?? 0,

          // ── Prior-season entering average ─────────────────────────────────
          enteringAvg: player.enteringAvg ?? 0,
          // The season to which the entering average belongs (prior year)
          enteringAvgSeason,

          // ── Season high scores ────────────────────────────────────────────
          highGame: player.highGame ?? 0,
          // Handicap high game (scratch + per-game handicap)
          highGameHdcp: player.highGameHdcp ?? 0,
          highSeries: player.highSeries ?? 0,
          // Handicap high series (scratch + 3-game handicap)
          highSeriesHdcp: player.highSeriesHdcp ?? 0,

          // ── Participation stats ───────────────────────────────────────────
          gamesPlayed: player.gamesPlayed ?? 0,

          // Blind weeks: total absent weeks and consecutive absent streak
          blindWeeksTotal: player.blindWeeksTotal ?? 0,
          blindWeeksRow: player.blindWeeksRow ?? 0,

          // Individual match points won this season
          indPointsWon: player.indPointsWon ?? 0,
        })
      }
    }

    console.log(`[populateBowlers] Mapped ${docs.length} bowlers from ${teamFilePaths.length} team files`)
  } else {
    // ── Fallback path: derive from the locally built bowlerStats.json ─────────
    // This path is used only during development before team files are fetched.
    // Stats beyond what buildBowlerStats() produces are zeroed.
    console.warn('[populateBowlers] No team files found — falling back to src/data/bowlerStats.json')

    const bowlerStatsPath = join(OUT_DIR, 'bowlerStats.json')
    const rawStats = existsSync(bowlerStatsPath)
      ? JSON.parse(readFileSync(bowlerStatsPath, 'utf8'))
      : buildBowlerStats()

    // Unwrap `.data` wrapper if present (some legacy formats wrap the array)
    const statsArray = rawStats.data ?? rawStats

    docs = statsArray.map(bowler => {
      // Split "First Last" → firstName = first word, lastName = remainder
      const nameParts = (bowler.name ?? '').trim().split(/\s+/)
      const firstName = nameParts[0] ?? ''
      const lastName = nameParts.slice(1).join(' ')

      const [startYear] = (seasonYear ?? '2025-2026').split('-').map(Number)
      const enteringAvgSeason = `${startYear - 1}-${startYear}`

      return {
        leaguePalsId: bowler.id ?? '',
        seasonYear,
        teamId: String(bowler.teamId ?? ''),
        teamName: bowler.teamName ?? '',
        firstName,
        lastName,
        name: bowler.name ?? '',
        avatarUrl: null,
        average: bowler.average ?? 0,
        averageFloat: bowler.average ?? 0,
        enteringAvg: bowler.enteringAvg ?? 0,
        enteringAvgSeason,
        highGame: bowler.highGame ?? 0,
        highGameHdcp: 0,
        highSeries: bowler.highSeries ?? 0,
        highSeriesHdcp: 0,
        gamesPlayed: 0,
        blindWeeksTotal: 0,
        blindWeeksRow: 0,
        indPointsWon: 0,
      }
    })
  }

  // Use the LeaguePals ObjectId as the Firestore document ID — consistent FK
  // referenced by bowlerScores and the admin captain-assignment tool.
  await batchWrite('bowlers', docs, doc => doc.leaguePalsId)
}

// ─── Firestore: bowlerScores Collection ──────────────────────────────────────

/**
 * Populates the `bowlerScores` Firestore collection with one document per bowler
 * per week they have a game entry recorded.
 *
 * Primary data source: `leaguepals-data/teams/{teamId}.json` — the same files
 * used by `populateBowlers()`. Each player's `weekGames` property is an object
 * keyed by date string (YYYY-MM-DD). Each value is an array; we use the first
 * element (index 0) as the canonical entry for that week.
 *
 * Key detection logic:
 *   Blind detection  — `games.some(g => g === "-" || g === null)`. Absent bowlers
 *     receive `"-"` as their game values. When blinded, game1/game2/game3/series
 *     are stored as `null` (not 0) to prevent corrupting aggregate queries.
 *   Pre-bowl detection — `weekEntry.isMatch === false`. When a bowler pre-bowls
 *     (bowls before the scheduled match night), `isMatch` is false, the date key
 *     is the actual bowl date, and `matchDate` (if present) is the scheduled night.
 *     We store the bowl date as `actualBowlDate` and the scheduled date as `date`.
 *   Substitute tracking — defaulted to `false`/`null` for all bowlers. Full
 *     substitute detection requires manual admin input (TODO: Phase 5 admin UI).
 *
 * Lane pair and opponent team are resolved from the lane schedule lookup built
 * by `buildLaneLookup()`. Fields `opponentTeamId`, `opponentTeamName`, and
 * `matchupId` are intentionally left as empty strings — they will be wired
 * in phase-2/sub-task-5.
 *
 * Fallback: if no team JSON files are present, reads `src/data/bowlerStats.json`
 * and maps each bowler's `weeks` array (with g1/g2/g3 fields) to the canonical
 * bowlerScore schema. All detection flags default to false/null.
 *
 * @param {string} seasonYear - e.g. "2025-2026". Stored on every document.
 * @returns {Promise<void>}
 */
async function populateBowlerScores(seasonYear) {
  if (!db) {
    console.warn('[populateBowlerScores] Skipping bowlerScores — Firestore not initialized')
    return
  }

  /** @type {object[]} Accumulated bowler score documents to batch-write */
  const bowlerScoreDocs = []

  // Build a date → week-number lookup from the lane schedule for `week` field
  // (same approach as buildBowlerStats to keep consistency)
  const weekDateIndex = new Map()
  const weeks = schedule.schedule ?? []
  weeks.forEach((week, i) => {
    if (!week.matches || week.matches.length === 0) return
    weekDateIndex.set(week.date.slice(0, 10), i + 1)
  })

  // Read team file listing — same directory glob as populateBowlers()
  const teamFilePaths = readdirSync(TEAMS_RAW_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => join(TEAMS_RAW_DIR, f))

  if (teamFilePaths.length > 0) {
    // ── Primary path: individual team JSON files ──────────────────────────────
    for (const filePath of teamFilePaths) {
      const raw = JSON.parse(readFileSync(filePath, 'utf8'))
      const players = raw.data ?? []
      if (players.length === 0) continue // skip vacant/bye teams

      for (const player of players) {
        // `player.weekGames` is an object: { "YYYY-MM-DD": [ { isMatch, weekIdx, games } ] }
        // The value is always an array; we use index 0 as the canonical entry.
        const weekGames = player.weekGames ?? {}

        for (const [dateKey, entries] of Object.entries(weekGames)) {
          // Guard: entries must be a non-empty array
          if (!Array.isArray(entries) || entries.length === 0) continue
          const weekEntry = entries[0]
          if (!weekEntry) continue

          const games = weekEntry.games ?? []

          // ── Blind detection ───────────────────────────────────────────────
          // An absent bowler's games array contains "-" string markers (e.g. ["-","-","-",0]).
          // We also check for null values defensively.
          const blinded = games.some(g => g === '-' || g === null)

          // ── Pre-bowl detection ────────────────────────────────────────────
          // isMatch === false means the bowler bowled on a different night than the
          // scheduled match. The date key IS the actual bowl date; matchDate (if
          // present) is the scheduled match night this score counts toward.
          const preBowled = weekEntry.isMatch === false

          // ── Week number ───────────────────────────────────────────────────
          // For a pre-bowled entry the dateKey is the actual bowl night, not the
          // scheduled match night, so we may not find it in weekDateIndex. We
          // try the matchDate first (the week it counts for) and fall back to
          // looking up by the dateKey itself.
          const scheduledDate = preBowled
            ? (weekEntry.matchDate ?? dateKey)
            : dateKey
          const weekNum = weekDateIndex.get(scheduledDate)
            ?? weekDateIndex.get(dateKey)
            ?? 0

          // ── Lane and opponent from lane schedule ──────────────────────────
          // laneLookup is keyed by the *scheduled match* date and team LP ObjectId.
          // Use scheduledDate so pre-bowled entries resolve to the correct lane pair.
          const teamLpId = player.team ?? ''
          const laneInfo = laneLookup.get(scheduledDate)?.get(teamLpId)
            ?? laneLookup.get(dateKey)?.get(teamLpId)

          // ── Individual game scores ────────────────────────────────────────
          // games[3] is the series total — skip it; we only want games[0..2].
          // Store null (not 0) when blinded so aggregates remain uncontaminated.
          const game1 = blinded ? null : (typeof games[0] === 'number' ? games[0] : null)
          const game2 = blinded ? null : (typeof games[1] === 'number' ? games[1] : null)
          const game3 = blinded ? null : (typeof games[2] === 'number' ? games[2] : null)

          // Compute series from individual games to avoid relying on games[3] (which
          // may be 0 for absent bowlers). Returns null when blinded.
          const series = blinded
            ? null
            : ([game1, game2, game3].filter(g => typeof g === 'number').reduce((a, b) => a + b, 0) || null)

          bowlerScoreDocs.push({
            // ── Bowler identity ─────────────────────────────────────────────
            bowlerId: player._id ?? '',
            bowlerName: `${player.firstName ?? ''} ${player.lastName ?? ''}`.trim(),

            // ── Team FKs (LeaguePals ObjectId strings) ──────────────────────
            teamId: teamLpId,
            teamName: player.teamName ?? '',

            // Opponent FKs — will be wired in phase-2/sub-task-5
            opponentTeamId: '',
            opponentTeamName: '',

            // Matchup FK — will be wired in phase-2/sub-task-5
            matchupId: '',

            // ── Season / week context ────────────────────────────────────────
            seasonYear,
            week: weekNum,

            // `date` is the scheduled match date this score counts toward.
            // For pre-bowled scores, `actualBowlDate` records when they actually bowled.
            date: scheduledDate,
            actualBowlDate: preBowled ? dateKey : null,

            // Lane assignment (odd lane number of the pair)
            lanePair: laneInfo?.lane ?? 0,

            // ── Game scores ──────────────────────────────────────────────────
            game1,
            game2,
            game3,
            series,

            // ── Status flags ─────────────────────────────────────────────────
            preBowled,
            blinded,

            // Substitute tracking: defaulted to false/null.
            // TODO: Phase 5 admin UI will allow marking actual substitutes.
            isSubstitute: false,
            substituteFor: null,
          })
        }
      }
    }

    console.log(`[populateBowlerScores] Mapped ${bowlerScoreDocs.length} score documents from ${teamFilePaths.length} team files`)
  } else {
    // ── Fallback path: derive from the locally built bowlerStats.json ─────────
    // Used only when no team files are present (e.g., initial dev bootstrapping).
    // bowlerStats.json uses g1/g2/g3 field names — we remap to game1/game2/game3.
    console.warn('[populateBowlerScores] No team files found — falling back to src/data/bowlerStats.json')

    const bowlerStatsPath = join(OUT_DIR, 'bowlerStats.json')
    const rawStats = existsSync(bowlerStatsPath)
      ? JSON.parse(readFileSync(bowlerStatsPath, 'utf8'))
      : buildBowlerStats()

    const statsArray = rawStats.data ?? rawStats

    for (const bowler of statsArray) {
      const weeksArr = bowler.weeks ?? []

      for (const w of weeksArr) {
        // Fallback data never has blind/preBowl markers — default all flags
        const game1 = typeof w.g1 === 'number' ? w.g1 : null
        const game2 = typeof w.g2 === 'number' ? w.g2 : null
        const game3 = typeof w.g3 === 'number' ? w.g3 : null
        const series = [game1, game2, game3]
          .filter(g => typeof g === 'number')
          .reduce((a, b) => a + b, 0) || null

        bowlerScoreDocs.push({
          bowlerId: bowler.id ?? '',
          bowlerName: bowler.name ?? '',
          teamId: String(bowler.teamId ?? ''),
          teamName: bowler.teamName ?? '',
          opponentTeamId: '',
          opponentTeamName: '',
          matchupId: '',
          seasonYear,
          week: w.week ?? 0,
          date: w.date ?? '',
          actualBowlDate: null,
          lanePair: w.lane ?? 0,
          game1,
          game2,
          game3,
          series,
          preBowled: false,
          blinded: false,
          isSubstitute: false,
          substituteFor: null,
        })
      }
    }

    console.log(`[populateBowlerScores] Mapped ${bowlerScoreDocs.length} score documents from bowlerStats.json (fallback)`)
  }

  // Auto-generated Firestore IDs — no custom doc ID needed for scores
  await batchWrite('bowlerScores', bowlerScoreDocs)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Main async entry point — orchestrates all transform and Firestore population steps.
 *
 * Synchronous steps (local JSON file writes) run first so the output files are
 * always produced regardless of Firestore availability. Async Firestore population
 * steps run afterward and are awaited so any write errors are surfaced at the end.
 *
 * @returns {Promise<void>}
 */
async function main() {
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

  // ── Firestore population ─────────────────────────────────────────────────────
  // Each populate* function is a no-op when db === null (Firestore not configured).

  console.log('\n─────────────────────────────────────────')
  console.log('Firestore population...')

  // 6. Write league configuration document for the current season
  await populateLeagueConfig('2025-2026')

  // 7. Write teams collection — full standings stats from LeaguePals API
  await populateTeams('2025-2026')

  // 8. Write bowlers collection — rich per-bowler stats from team roster files
  await populateBowlers('2025-2026')

  // 9. Write bowlerScores collection — one document per bowler per week,
  //    with corrected blind/preBowl detection and null scores for absent weeks
  await populateBowlerScores('2025-2026')
}

main()
