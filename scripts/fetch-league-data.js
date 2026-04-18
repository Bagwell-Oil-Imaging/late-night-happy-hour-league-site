/**
 * fetch-league-data.js
 *
 * Pulls all public data from the LeaguePals API and saves raw JSON files
 * to leaguepals-data/ for use by transform-data.js.
 *
 * Usage: node scripts/fetch-league-data.js
 *
 * No auth required — all endpoints are publicly accessible using the
 * league ID and team IDs embedded in the schedule.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'leaguepals-data')
const TEAMS_DIR = join(DATA_DIR, 'teams')

// ─── League identifiers (from the LeaguePals app) ────────────────────────────
const LEAGUE_ID = '688118301406d3982ec379a1'
const BASE_URL = 'https://www.leaguepals.com'

// All 16 team IDs found in the lane schedule (3 are dropped/empty mid-season)
const ALL_TEAM_IDS = [
  '688118421406d3982ec37a6e',
  '688118391406d3982ec37a1c',
  '6881183d1406d3982ec37a42',
  '6881183b1406d3982ec37a2f',
  '688118461406d3982ec37a9a',
  '688118441406d3982ec37a87',
  '688118401406d3982ec37a5b',
  '688118321406d3982ec379c7',
  '688118351406d3982ec379f0',
  '688118331406d3982ec379dd',
  '688118371406d3982ec37a06',
  '688118491406d3982ec37ac3',
  '688118301406d3982ec379ab',
  '68811b528fce42526776f19f',
  '68811b528fce42526776f1a6',
  '688118481406d3982ec37aad',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetches a URL and returns parsed JSON. Logs progress to console.
 * @param {string} url - Full URL to fetch
 * @param {RequestInit} [options] - Optional fetch options (method, body, headers)
 * @returns {Promise<any>}
 */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  return res.json()
}

/**
 * Writes data as pretty-printed JSON to a file path.
 * @param {string} filePath - Absolute path to write
 * @param {any} data - Data to serialize
 */
function save(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2))
  const kb = (JSON.stringify(data).length / 1024).toFixed(1)
  console.log(`  ✓ Saved ${filePath.replace(ROOT, '.')} (${kb} KB)`)
}

// ─── Fetch functions ──────────────────────────────────────────────────────────

/**
 * Fetches the full lane schedule (week-by-week matchups with lane assignments).
 * Endpoint: GET /laneSchedule?league_id=&simple=false&withLeagueTime=true
 */
async function fetchLaneSchedule() {
  const url = `${BASE_URL}/laneSchedule?league_id=${LEAGUE_ID}&simple=false&withLeagueTime=true`
  const data = await fetchJSON(url)
  save(join(DATA_DIR, 'lane-schedule.json'), data)
  return data
}

/**
 * Fetches current standings for all active teams.
 * Endpoint: GET /api/getStandingsPublic?leagueId=
 */
async function fetchStandings() {
  const url = `${BASE_URL}/api/getStandingsPublic?leagueId=${LEAGUE_ID}`
  const data = await fetchJSON(url)
  save(join(DATA_DIR, 'standings.json'), data)
  return data
}

/**
 * Fetches top player/team stats and full bowler score history by week.
 * Endpoint: POST /api/getTopsPublic { leagueId }
 * Note: The topAvgs entries include weekGames — a full per-bowler score history.
 */
async function fetchTops() {
  const url = `${BASE_URL}/api/getTopsPublic`
  const data = await fetchJSON(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leagueId: LEAGUE_ID }),
  })
  save(join(DATA_DIR, 'tops.json'), data)
  return data
}

/**
 * Fetches public league info (rules, handicap settings, center details).
 * Endpoint: GET /getLeaguePublic?id=
 */
async function fetchLeaguePublic() {
  const url = `${BASE_URL}/getLeaguePublic?id=${LEAGUE_ID}`
  const data = await fetchJSON(url)
  save(join(DATA_DIR, 'league-public.json'), data)
  return data
}

/**
 * Fetches extended public league info (splits, divisions, format details).
 * Endpoint: GET /fullLeagueInfoPublic?id=
 */
async function fetchFullLeagueInfo() {
  const url = `${BASE_URL}/fullLeagueInfoPublic?id=${LEAGUE_ID}`
  const data = await fetchJSON(url)
  save(join(DATA_DIR, 'full-league-info.json'), data)
  return data
}

/**
 * Fetches roster + per-bowler score history for a single team.
 * Each bowler includes weekGames: { [date]: [{games: [g1,g2,g3,series], ...}] }
 * Endpoint: GET /api/loadIndividualTeamPublic?id=
 * @param {string} teamId - LP ObjectId for the team
 */
async function fetchTeam(teamId) {
  const url = `${BASE_URL}/api/loadIndividualTeamPublic?id=${teamId}`
  const data = await fetchJSON(url)
  save(join(TEAMS_DIR, `${teamId}.json`), data)
  return data
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('LeaguePals Data Fetcher')
  console.log(`League: ${LEAGUE_ID}`)
  console.log(`Output: leaguepals-data/\n`)

  // Ensure output directories exist
  mkdirSync(DATA_DIR, { recursive: true })
  mkdirSync(TEAMS_DIR, { recursive: true })

  // Fetch all top-level endpoints in parallel
  console.log('Fetching league-level data...')
  await Promise.all([
    fetchLaneSchedule(),
    fetchStandings(),
    fetchTops(),
    fetchLeaguePublic(),
    fetchFullLeagueInfo(),
  ])

  // Fetch all team rosters sequentially to avoid hammering the API
  console.log('\nFetching team rosters...')
  for (const teamId of ALL_TEAM_IDS) {
    await fetchTeam(teamId)
  }

  console.log('\nDone! All data saved to leaguepals-data/')
  console.log('Run "npm run transform" to generate src/data/ files.')
}

main().catch(err => {
  console.error('Fetch failed:', err.message)
  process.exit(1)
})
