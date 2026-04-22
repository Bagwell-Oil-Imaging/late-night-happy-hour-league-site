/**
 * @file seed-firestore.js
 * @description One-time bootstrap script that seeds all 12 Firestore collections
 *   from the existing `src/data/*.json` static files. Transforms the legacy JSON
 *   schema to the new Firestore-aligned schema defined in `src/types/index.ts`.
 *
 * USAGE:
 *   1. Create a Firebase service account key:
 *        Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   2. Save the downloaded JSON as `service-account.json` in the project root
 *        (it is listed in .gitignore and will NOT be committed)
 *   3. Set GOOGLE_APPLICATION_CREDENTIALS in your .env file:
 *        GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
 *   4. Run: npm run seed
 *
 * SAFETY:
 *   - This script will OVERWRITE any existing documents with matching IDs.
 *   - Run only once per clean Firestore environment (or after clearing collections).
 *   - The `documents` collection has no legacy data and is intentionally skipped.
 *
 * SCHEMA NOTES:
 *   - bowlerStats.json may have a top-level `.data` array wrapper; both shapes are handled.
 *   - weeklyMatchupDetails.json uses `gameTotals.g1/g2/g3`; these are mapped to
 *     `game1Total/game2Total/game3Total` per the TeamSummary interface.
 *   - All numeric IDs are cast to strings for Firestore FK consistency.
 *   - `preBowled`, `blinded`, and `isSubstitute` flags default to `false`; Phase 2
 *     transform pipeline will back-fill correct values from LeaguePals data.
 */

import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Firebase Admin Initialization
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the service account JSON file from the environment
 * variable GOOGLE_APPLICATION_CREDENTIALS. Falls back to `./service-account.json`
 * in the project root if the variable is not set.
 *
 * @returns {string} Absolute path to the service account key file.
 */
function resolveServiceAccountPath() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    // Support both relative (to cwd) and absolute paths
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), 'service-account.json');
}

const serviceAccountPath = resolveServiceAccountPath();

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    `[seed-firestore] ERROR: Service account key not found at:\n  ${serviceAccountPath}\n\n` +
    'Please follow the USAGE instructions at the top of this file.'
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

/** @type {FirebaseFirestore.Firestore} */
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Helper Utilities
// ---------------------------------------------------------------------------

/**
 * Reads and JSON-parses a file from `src/data/`.
 *
 * @param {string} filename - Filename within `src/data/` (e.g. `teams.json`).
 * @returns {any} Parsed JSON value.
 */
function readDataFile(filename) {
  const filePath = path.resolve(__dirname, '..', 'src', 'data', filename);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Unwraps data that may be either a plain array or an object with a `.data`
 * array property (legacy inconsistency in bowlerStats.json from some environments).
 *
 * @param {any} raw - Parsed JSON value.
 * @returns {Array<any>} The array of records.
 */
function unwrapArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  throw new Error(`Expected array or { data: [...] }, got: ${typeof raw}`);
}

/**
 * Splits a full display name into firstName and lastName.
 * The first whitespace-delimited token becomes firstName; everything else is lastName.
 *
 * @param {string} fullName - e.g. "Vincent Cariello"
 * @returns {{ firstName: string, lastName: string }}
 */
function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName  = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Splits an array into chunks of at most `size` elements.
 *
 * @template T
 * @param {T[]} arr - Source array.
 * @param {number} size - Maximum chunk length (Firestore batch limit is 500).
 * @returns {T[][]} Array of chunks.
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Writes an array of documents to a Firestore collection using batched writes.
 * Firestore batches are limited to 500 operations; this helper automatically
 * chunks larger arrays.
 *
 * @param {string} collectionName - Target Firestore collection name.
 * @param {Array<Object>} docs     - Array of plain objects to write.
 * @param {((doc: Object, index: number) => string) | null} getDocId
 *   Optional function to derive a deterministic document ID from the doc object
 *   and its index. When `null` Firestore auto-generates IDs.
 * @returns {Promise<void>}
 */
async function batchWrite(collectionName, docs, getDocId = null) {
  if (!docs || docs.length === 0) {
    console.log(`  [${collectionName}] No documents to write — skipping.`);
    return;
  }

  const chunks = chunkArray(docs, 500);
  let totalWritten = 0;

  for (const chunk of chunks) {
    const batch = db.batch();

    for (let i = 0; i < chunk.length; i++) {
      const doc = chunk[i];
      const colRef = db.collection(collectionName);
      const docRef = getDocId ? colRef.doc(String(getDocId(doc, totalWritten + i))) : colRef.doc();
      batch.set(docRef, doc);
    }

    await batch.commit();
    totalWritten += chunk.length;
  }

  console.log(`  [${collectionName}] Wrote ${totalWritten} document(s).`);
}

// ---------------------------------------------------------------------------
// Collection Seeders
// ---------------------------------------------------------------------------

/**
 * Seeds the `seasons` collection from `seasons.json`.
 *
 * Mapping changes:
 *  - `champion: string` → `championTeamId: null, championTeamName: champion`
 *  - `teams[].id` → `teams[].teamId` (string), adds `ties` defaulting to 0
 *  - Document ID = `season.year`
 *
 * @returns {Promise<void>}
 */
async function seedSeasons() {
  console.log('\nSeeding seasons...');
  const raw    = readDataFile('seasons.json');
  const seasons = unwrapArray(raw);

  const docs = seasons.map((season) => ({
    year:              season.year,
    startDate:         season.startDate,
    endDate:           season.endDate,
    championTeamId:    null,                            // Phase 2 will resolve real IDs
    championTeamName:  season.champion || null,
    teams: (season.teams || []).map((t) => ({
      teamId:  String(t.id),
      name:    t.name,
      wins:    t.wins   || 0,
      losses:  t.losses || 0,
      ties:    t.ties   || 0,                           // not in seasons.json — default 0
      points:  t.points || 0,
    })),
  }));

  await batchWrite('seasons', docs, (doc) => doc.year);
}

/**
 * Seeds the `leagueConfig` collection with a single hardcoded document for
 * the 2025-2026 season. Raw league configuration lives in the external
 * leaguepals-data directory (not in src/data), so this document is manually
 * constructed from the migration plan.
 *
 * Document ID = `'2025-2026'`
 *
 * @returns {Promise<void>}
 */
async function seedLeagueConfig() {
  console.log('\nSeeding leagueConfig...');

  /** @type {import('../src/types/index').LeagueConfig} */
  const config = {
    seasonYear:            '2025-2026',
    leagueName:            'Late Night Happy Hour Bowling League',
    leagueType:            'Mens',
    weekday:               'Thursday',
    startTime:             '8:20 PM',
    bowlingCenter:         'Unknown',        // placeholder — update when known
    sanctionNumber:        0,
    numTeams:              13,
    bowlersPerTeam:        4,
    gamesPerNight:         3,
    totalWeeks:            33,
    numLanes:              26,
    handicapPct:           0.85,
    handicapBase:          220,
    blindScorePct:         0.9,
    minGamesForAvg:        3,
    prevSeasonMinGames:    21,
    positionRoundSchedule: 'Every other night',
    dues:                  0,
    lineage:               0,
    entryFee:              0,
    leaguePalsId:          '',               // will be set from LeaguePals in Phase 2
  };

  await batchWrite('leagueConfig', [config], () => '2025-2026');
}

/**
 * Seeds the `scheduleWeeks` collection from `scheduleWeeks.json`.
 *
 * Mapping changes:
 *  - `dataWeek` field REMOVED
 *  - Adds `seasonYear: '2025-2026'`
 *  - Adds `positionRound: false` (Phase 2 back-fills correct values)
 *  - Document ID = `week.date`
 *
 * @returns {Promise<void>}
 */
async function seedScheduleWeeks() {
  console.log('\nSeeding scheduleWeeks...');
  const raw   = readDataFile('scheduleWeeks.json');
  const weeks = unwrapArray(raw);

  const docs = weeks.map((w) => ({
    week:          w.week,
    date:          w.date,
    seasonYear:    '2025-2026',
    status:        w.status,
    positionRound: false,                    // Phase 2 will correct these
    skipReason:    w.skipReason || null,
    event:         w.event     || null,
    // dataWeek intentionally omitted — removed from new schema
  }));

  await batchWrite('scheduleWeeks', docs, (doc) => doc.date);
}

/**
 * Seeds the `teams` collection from `teams.json`.
 *
 * Mapping changes:
 *  - `id: number`   → `displayId: number`
 *  - `leaguePalsId` = `String(team.id)` placeholder (real ObjectIds set in Phase 2)
 *  - Firestore document ID = `leaguePalsId`
 *  - Adds computed/defaulted fields: `captainBowlerId`, `pointsWon`, `pointsLost`,
 *    `pctWon`, `average`, `scratchPins`, `totalPins`, `highGame`
 *  - Adds `seasonYear: '2025-2026'`
 *
 * @returns {Promise<void>}
 */
async function seedTeams() {
  console.log('\nSeeding teams...');
  const raw   = readDataFile('teams.json');
  const teams = unwrapArray(raw);

  const docs = teams.map((team) => ({
    leaguePalsId:    String(team.id),        // placeholder until Phase 2 resolves real IDs
    displayId:       team.id,
    seasonYear:      '2025-2026',
    name:            team.name,
    captainName:     team.captain || '',
    captainBowlerId: null,
    wins:            team.wins   || 0,
    losses:          team.losses || 0,
    ties:            team.ties   || 0,
    points:          team.points || 0,
    pointsWon:       0,
    pointsLost:      0,
    pctWon:          0,
    average:         0,
    scratchPins:     0,
    totalPins:       0,
    highGame:        0,
  }));

  await batchWrite('teams', docs, (doc) => doc.leaguePalsId);
}

/**
 * Seeds the `bowlers` collection from `bowlerStats.json`.
 *
 * Mapping changes:
 *  - `id`          → `leaguePalsId`
 *  - `teamId`      → `String(bowler.teamId)` (string FK)
 *  - `name`        → split into `firstName` + `lastName`; `name` kept as-is
 *  - `average`     → kept as `average`; also stored as `averageFloat`
 *  - `enteringAvg` → kept as `enteringAvg`; adds `enteringAvgSeason: '2024-2025'`
 *  - `highGame`    → kept; also `highGameHdcp: bowler.highGame` (pre-hdcp placeholder)
 *  - `highSeries`  → kept; also `highSeriesHdcp: bowler.highSeries` placeholder
 *  - Adds: `avatarUrl: null`, `gamesPlayed: 0`, `blindWeeksTotal: 0`,
 *           `blindWeeksRow: 0`, `indPointsWon: 0`
 *  - Document ID = `bowler.id` (the LeaguePals ObjectId string)
 *
 * @returns {Promise<void>}
 */
async function seedBowlers() {
  console.log('\nSeeding bowlers...');
  const raw     = readDataFile('bowlerStats.json');
  const bowlers = unwrapArray(raw);

  const docs = bowlers.map((bowler) => {
    const { firstName, lastName } = splitName(bowler.name);
    return {
      leaguePalsId:      bowler.id,
      seasonYear:        '2025-2026',
      teamId:            String(bowler.teamId),
      teamName:          bowler.teamName     || '',
      firstName,
      lastName,
      name:              bowler.name,
      avatarUrl:         null,
      average:           bowler.average      || 0,
      averageFloat:      bowler.average      || 0,
      enteringAvg:       bowler.enteringAvg  || 0,
      enteringAvgSeason: '2024-2025',
      highGame:          bowler.highGame     || 0,
      highGameHdcp:      bowler.highGame     || 0,  // hdcp values — Phase 2 corrects
      highSeries:        bowler.highSeries   || 0,
      highSeriesHdcp:    bowler.highSeries   || 0,
      gamesPlayed:       0,
      blindWeeksTotal:   0,
      blindWeeksRow:     0,
      indPointsWon:      0,
    };
  });

  await batchWrite('bowlers', docs, (doc) => doc.leaguePalsId);
}

/**
 * Seeds the `matchups` collection from `matchups.json`.
 *
 * Mapping changes:
 *  - `team1Score`       → `team1ScratchScore`
 *  - `team2Score`       → `team2ScratchScore`
 *  - `team1Id/team2Id`  → cast to string
 *  - Adds `leaguePalsMatchId: String(m.id)`
 *  - Adds `positionRound: false` (Phase 2 sets correct flag)
 *  - Adds `seasonYear: '2025-2026'`
 *  - Document ID = `String(m.id)`
 *
 * @returns {Promise<void>}
 */
async function seedMatchups() {
  console.log('\nSeeding matchups...');
  const raw      = readDataFile('matchups.json');
  const matchups = unwrapArray(raw);

  const docs = matchups.map((m) => ({
    leaguePalsMatchId:  String(m.id),
    seasonYear:         '2025-2026',
    week:               m.week,
    date:               m.date,
    team1Id:            String(m.team1Id),
    team2Id:            String(m.team2Id),
    team1ScratchScore:  m.team1Score  ?? null,  // renamed from team1Score
    team2ScratchScore:  m.team2Score  ?? null,  // renamed from team2Score
    positionRound:      false,
    completed:          m.completed   || false,
  }));

  await batchWrite('matchups', docs, (doc) => doc.leaguePalsMatchId);
}

/**
 * Maps a raw team object from weeklyMatchupDetails.json into a TeamSummary shape.
 * Renames `gameTotals.g1/g2/g3` → `game1Total/game2Total/game3Total`.
 *
 * @param {Object} team - Raw team object from weeklyMatchupDetails.json.
 * @returns {Object} TeamSummary-shaped object.
 */
function mapTeamSummary(team) {
  const gameTotals = team.gameTotals || {};
  return {
    teamId:          String(team.id),
    teamName:        team.name             || '',
    lane:            team.lane             || 0,
    teamAvg:         team.teamAvg          || 0,
    game1Total:      gameTotals.g1         || 0,  // renamed from gameTotals.g1
    game2Total:      gameTotals.g2         || 0,  // renamed from gameTotals.g2
    game3Total:      gameTotals.g3         || 0,  // renamed from gameTotals.g3
    scratchSeries:   team.scratchSeries    || 0,
    handicapPerGame: team.handicapPerGame  || 0,
    handicapSeries:  team.handicapSeries   || 0,
    totalSeries:     team.totalSeries      || 0,
    points:          team.points           || 0,  // not in legacy data, defaulted
  };
}

/**
 * Seeds the `matchupDetails` collection from `weeklyMatchupDetails.json`.
 *
 * Mapping changes:
 *  - `d.id`                → `matchupId: String(d.id)`, doc ID = `String(d.id)`
 *  - `team1/team2` objects → mapped through `mapTeamSummary()`:
 *      `gameTotals.g1`  → `game1Total`
 *      `gameTotals.g2`  → `game2Total`
 *      `gameTotals.g3`  → `game3Total`
 *  - `team.id`             → `teamId: String(team.id)`
 *  - Adds `seasonYear: '2025-2026'`
 *
 * @returns {Promise<void>}
 */
async function seedMatchupDetails() {
  console.log('\nSeeding matchupDetails...');
  const raw     = readDataFile('weeklyMatchupDetails.json');
  const details = unwrapArray(raw);

  const docs = details.map((d) => ({
    matchupId:  String(d.id),
    seasonYear: '2025-2026',
    week:       d.week,
    date:       d.date,
    team1:      mapTeamSummary(d.team1),
    team2:      mapTeamSummary(d.team2),
  }));

  await batchWrite('matchupDetails', docs, (doc) => doc.matchupId);
}

/**
 * Seeds the `bowlerScores` collection by flattening each bowler's `weeks` array
 * from `bowlerStats.json` into one document per bowler × week.
 *
 * Mapping changes (per week entry):
 *  - `g1/g2/g3` → `game1/game2/game3`
 *  - Adds `bowlerId`, `bowlerName`, `teamId` (string), `teamName`
 *  - Adds `opponentTeamId: String(week.opponentTeamId || 0)`
 *  - Adds `matchupId: ''`           — linked in Phase 2
 *  - Adds `actualBowlDate: null`    — set in Phase 2 for pre-bowled rows
 *  - Adds `preBowled: false`        — Phase 2 corrects
 *  - Adds `blinded: false`          — Phase 2 corrects
 *  - Adds `isSubstitute: false`     — Phase 2 corrects
 *  - Adds `substituteFor: null`     — Phase 2 corrects
 *  - Adds `seasonYear: '2025-2026'`
 *  - Document ID = `${bowler.id}_week${week.week}` (deterministic and unique)
 *
 * @returns {Promise<void>}
 */
async function seedBowlerScores() {
  console.log('\nSeeding bowlerScores...');
  const raw     = readDataFile('bowlerStats.json');
  const bowlers = unwrapArray(raw);

  /** @type {Array<Object>} */
  const docs = [];

  for (const bowler of bowlers) {
    const weeks = bowler.weeks || [];
    for (const week of weeks) {
      docs.push({
        bowlerId:           bowler.id,
        bowlerName:         bowler.name,
        teamId:             String(bowler.teamId),
        teamName:           bowler.teamName             || '',
        opponentTeamId:     String(week.opponentTeamId  || 0),
        opponentTeamName:   week.opponentTeamName       || '',
        matchupId:          '',                         // linked in Phase 2
        seasonYear:         '2025-2026',
        week:               week.week,
        date:               week.date,
        actualBowlDate:     null,                       // set in Phase 2 for pre-bowled
        lanePair:           week.lane                   || 0,
        game1:              week.g1  ?? null,           // renamed from g1
        game2:              week.g2  ?? null,           // renamed from g2
        game3:              week.g3  ?? null,           // renamed from g3
        series:             week.series                 ?? null,
        preBowled:          false,                      // Phase 2 corrects
        blinded:            false,                      // Phase 2 corrects
        isSubstitute:       false,                      // Phase 2 corrects
        substituteFor:      null,                       // Phase 2 corrects
      });
    }
  }

  // Derive a deterministic doc ID: bowlerId_weekN ensures uniqueness per bowler per week
  await batchWrite(
    'bowlerScores',
    docs,
    (doc) => `${doc.bowlerId}_week${doc.week}`
  );
}

/**
 * Seeds the `announcements` collection from `announcements.json`.
 *
 * Adds fields required by the new Announcement interface:
 *  - `pinned: false`
 *  - `expiresAt: null`
 *  - `createdAt: <ISO timestamp>`
 *  - `updatedAt: <ISO timestamp>`
 *
 * @returns {Promise<void>}
 */
async function seedAnnouncements() {
  console.log('\nSeeding announcements...');
  const raw           = readDataFile('announcements.json');
  const announcements = unwrapArray(raw);
  const now           = new Date().toISOString();

  const docs = announcements.map((a) => ({
    title:     a.title,
    message:   a.message,
    date:      a.date,
    type:      a.type     || 'info',
    priority:  a.priority || 'normal',
    pinned:    false,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  }));

  // Auto-generated Firestore IDs (no stable natural key in legacy data)
  await batchWrite('announcements', docs, null);
}

/**
 * Seeds the `events` collection from `events.json`.
 *
 * Adds fields required by the new Event interface:
 *  - `endDate: null`
 *  - `allDay: false`
 *  - `createdAt: <ISO timestamp>`
 *  - `updatedAt: <ISO timestamp>`
 *
 * @returns {Promise<void>}
 */
async function seedEvents() {
  console.log('\nSeeding events...');
  const raw    = readDataFile('events.json');
  const events = unwrapArray(raw);
  const now    = new Date().toISOString();

  const docs = events.map((e) => ({
    title:       e.title,
    date:        e.date,
    endDate:     null,
    allDay:      false,
    location:    e.location    || '',
    type:        e.type        || 'regular',
    description: e.description || '',
    createdAt:   now,
    updatedAt:   now,
  }));

  await batchWrite('events', docs, null);
}

/**
 * Seeds the `carouselImages` collection from `carouselImages.json`.
 *
 * Mapping changes:
 *  - `image` → `imageUrl` (field rename)
 *  - Adds `order: index + 1` when not already present
 *  - Adds `createdAt` and `updatedAt` timestamps
 *
 * @returns {Promise<void>}
 */
async function seedCarouselImages() {
  console.log('\nSeeding carouselImages...');
  const raw    = readDataFile('carouselImages.json');
  const images = unwrapArray(raw);
  const now    = new Date().toISOString();

  const docs = images.map((img, index) => ({
    title:       img.title       || '',
    description: img.description || '',
    imageUrl:    img.imageUrl    || img.image || '',  // renamed from `image`
    alt:         img.alt         || '',
    order:       img.order !== undefined ? img.order : index + 1,
    createdAt:   now,
    updatedAt:   now,
  }));

  await batchWrite('carouselImages', docs, null);
}

/**
 * The `documents` collection holds versioned league documents (bylaws, rules,
 * etc.). No legacy data exists for this collection — it is intentionally skipped
 * and will be populated manually through the Admin CRUD UI (Phase 5).
 *
 * @returns {Promise<void>}
 */
async function seedDocuments() {
  console.log('\nSeeding documents... (no legacy data — skipped)');
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Orchestrates seeding of all 12 Firestore collections in dependency order:
 *  1. seasons         — no FKs
 *  2. leagueConfig    — no FKs
 *  3. scheduleWeeks   — no FKs
 *  4. teams           — no FKs (uses placeholder leaguePalsId)
 *  5. bowlers         — FK: teams
 *  6. matchups        — FK: teams
 *  7. matchupDetails  — FK: matchups
 *  8. bowlerScores    — FK: bowlers, teams
 *  9. announcements   — no FKs
 * 10. events          — no FKs
 * 11. carouselImages  — no FKs
 * 12. documents       — skipped (no legacy data)
 *
 * @returns {Promise<void>}
 */
async function main() {
  console.log('=== seed-firestore.js ===');
  console.log(`Project: ${serviceAccount.project_id}`);
  console.log(`Time:    ${new Date().toISOString()}\n`);

  try {
    await seedSeasons();
    await seedLeagueConfig();
    await seedScheduleWeeks();
    await seedTeams();
    await seedBowlers();
    await seedMatchups();
    await seedMatchupDetails();
    await seedBowlerScores();
    await seedAnnouncements();
    await seedEvents();
    await seedCarouselImages();
    await seedDocuments();

    console.log('\n=== Seeding complete! ===');
  } catch (err) {
    console.error('\n[seed-firestore] FATAL ERROR:', err);
    process.exit(1);
  }
}

main().catch(console.error);
