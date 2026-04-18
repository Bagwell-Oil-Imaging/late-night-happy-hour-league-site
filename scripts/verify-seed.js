/**
 * @file verify-seed.js
 * @description Queries all 12 Firestore collections and reports document counts
 *   against expected minimums. Exits with code 1 if any required collection is
 *   empty (expected >= 1 but actual = 0), so this can be used as a CI gate after
 *   running `npm run seed`.
 *
 * USAGE:
 *   npm run verify-seed
 *   -- or --
 *   node scripts/verify-seed.js
 *
 * PREREQUISITES:
 *   - A Firebase service account key on disk
 *   - GOOGLE_APPLICATION_CREDENTIALS set in .env pointing to the key file
 *     (or at ./service-account.json as a fallback)
 *
 * EXIT CODES:
 *   0 — All required collections have at least one document (or no credentials found)
 *   1 — One or more required collections are empty
 */

import { createRequire } from 'module';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// ESM-compatible helpers
// ---------------------------------------------------------------------------

/**
 * Derive __dirname equivalent in ESM context.
 * `import.meta.url` gives the current module's file URL; `fileURLToPath`
 * converts it to an OS path so we can resolve siblings reliably.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = resolve(__filename, '..');

/**
 * createRequire lets us use CommonJS `require()` inside an ESM module.
 * We need it to load the JSON service account file without enabling
 * the `--experimental-json-modules` flag.
 */
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Load dotenv — same pattern as seed-firestore.js
// ---------------------------------------------------------------------------

/**
 * Dynamically import dotenv so .env is parsed before we read
 * GOOGLE_APPLICATION_CREDENTIALS. We use a dynamic import because dotenv is
 * a CommonJS package and we want to load it at startup.
 */
const dotenv = await import('dotenv');
dotenv.default.config();

// ---------------------------------------------------------------------------
// Collection definitions: name, human label, expected minimum document count
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CollectionSpec
 * @property {string} name         - Firestore collection name (exact)
 * @property {string} label        - Human-readable label for table output
 * @property {number} expectedMin  - Minimum document count for a passing result
 */

/** @type {CollectionSpec[]} */
const COLLECTIONS = [
  // Required collections — must have at least one document after seeding
  { name: 'leagueConfig',   label: 'leagueConfig',   expectedMin: 1 },
  { name: 'teams',          label: 'teams',           expectedMin: 1 },
  { name: 'bowlers',        label: 'bowlers',         expectedMin: 1 },
  { name: 'bowlerScores',   label: 'bowlerScores',    expectedMin: 1 },
  { name: 'matchups',       label: 'matchups',        expectedMin: 1 },
  { name: 'matchupDetails', label: 'matchupDetails',  expectedMin: 1 },
  { name: 'scheduleWeeks',  label: 'scheduleWeeks',   expectedMin: 1 },

  // Optional collections — seeded from small JSON files that may legitimately
  // be empty in a minimal environment, so we expect >= 0 (warn if 0, but pass)
  { name: 'seasons',        label: 'seasons',         expectedMin: 0 },
  { name: 'documents',      label: 'documents',       expectedMin: 0 },
  { name: 'announcements',  label: 'announcements',   expectedMin: 0 },
  { name: 'events',         label: 'events',          expectedMin: 0 },
  { name: 'carouselImages', label: 'carouselImages',  expectedMin: 0 },
];

// ---------------------------------------------------------------------------
// Service Account Resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the absolute path to the Firebase service account JSON key file.
 * Reads GOOGLE_APPLICATION_CREDENTIALS from the environment (populated by
 * dotenv above); falls back to `./service-account.json` in the project root.
 *
 * @returns {string} Absolute path to the service account key file.
 */
function resolveServiceAccountPath() {
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    return isAbsolute(envPath)
      ? envPath
      : resolve(process.cwd(), envPath);
  }
  // Default fallback — same as seed-firestore.js
  return resolve(process.cwd(), 'service-account.json');
}

// ---------------------------------------------------------------------------
// Table Rendering
// ---------------------------------------------------------------------------

/**
 * Pads a string to a fixed width for fixed-width table columns.
 *
 * @param {string}  text  - The string to pad.
 * @param {number}  width - Target column width.
 * @returns {string} Left-aligned, space-padded string.
 */
function col(text, width) {
  return String(text).padEnd(width);
}

/**
 * Prints the verification results as a human-readable table to stdout.
 * Each row shows the collection name, expected minimum, actual count, and a
 * pass/fail indicator.
 *
 * @param {Array<{spec: CollectionSpec, actual: number}>} results
 */
function printTable(results) {
  const HEADER = `${'Collection'.padEnd(18)}  ${'Expected'.padEnd(10)}  ${'Actual'.padEnd(8)}  Status`;
  const RULE   = '-'.repeat(HEADER.length);

  console.log('\n=== Firestore Collection Verification ===\n');
  console.log(HEADER);
  console.log(RULE);

  for (const { spec, actual } of results) {
    const expected = spec.expectedMin === 0 ? '>= 0' : `>= ${spec.expectedMin}`;
    const pass     = actual >= spec.expectedMin;
    const status   = pass ? '\u2705' : '\u274c'; // ✅ or ❌

    console.log(
      `${col(spec.label, 18)}  ${col(expected, 10)}  ${col(actual, 8)}  ${status}`
    );
  }

  console.log(RULE);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Entry point. Initializes Firebase Admin SDK, queries every collection's
 * document count via `collection.count().get()`, prints a summary table, and
 * exits with code 1 if any required collection is empty.
 *
 * If GOOGLE_APPLICATION_CREDENTIALS / service-account.json is absent the
 * script prints a warning and exits 0 so CI environments without credentials
 * (e.g. open-source forks, PR previews) are not broken unnecessarily.
 *
 * @returns {Promise<void>}
 */
async function main() {
  // ── Credential guard ─────────────────────────────────────────────────────
  const serviceAccountPath = resolveServiceAccountPath();

  if (!existsSync(serviceAccountPath)) {
    console.warn(
      '\n[verify-seed] WARNING: Service account key not found at:\n' +
      `  ${serviceAccountPath}\n\n` +
      'Set GOOGLE_APPLICATION_CREDENTIALS in your .env file or place\n' +
      'service-account.json in the project root before running this script.\n\n' +
      'Skipping Firestore verification — exiting 0 so CI is not blocked.\n'
    );
    process.exit(0);
  }

  // ── Firebase Admin init ───────────────────────────────────────────────────
  // We load firebase-admin via require() because firebase-admin still ships as
  // CommonJS. createRequire (imported above) gives us CommonJS semantics inside
  // this ESM module.
  const admin = require('firebase-admin');

  /** @type {object} */
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  /** @type {import('firebase-admin').firestore.Firestore} */
  const db = admin.firestore();

  console.log('=== verify-seed.js ===');
  console.log(`Project : ${serviceAccount.project_id}`);
  console.log(`Time    : ${new Date().toISOString()}`);

  // ── Query all 12 collections ──────────────────────────────────────────────
  /**
   * @type {Array<{spec: CollectionSpec, actual: number}>}
   */
  const results = [];

  for (const spec of COLLECTIONS) {
    try {
      // Firestore Admin SDK: collection.count() returns an AggregateQuery.
      // .get() resolves to an AggregateQuerySnapshot whose .data().count holds
      // the integer document count without fetching all documents.
      const snapshot = await db.collection(spec.name).count().get();
      const actual   = snapshot.data().count;
      results.push({ spec, actual });
    } catch (err) {
      // Surface per-collection errors clearly but continue so we still print
      // counts for the collections that did succeed.
      console.error(`  [${spec.name}] ERROR querying collection: ${err.message}`);
      results.push({ spec, actual: -1 });
    }
  }

  // ── Print results table ───────────────────────────────────────────────────
  printTable(results);

  // ── Determine overall pass/fail ───────────────────────────────────────────
  // A failure is any required collection (expectedMin >= 1) with 0 documents.
  // Collections with an error (actual = -1) also count as failures when required.
  const failures = results.filter(
    ({ spec, actual }) => spec.expectedMin >= 1 && actual < spec.expectedMin
  );

  if (failures.length === 0) {
    console.log(
      '\n[verify-seed] All required collections have data. Verification PASSED.\n'
    );
    process.exit(0);
  } else {
    console.error('\n[verify-seed] FAILED — the following required collections are empty:');
    for (const { spec, actual } of failures) {
      console.error(`  - ${spec.name} (expected >= ${spec.expectedMin}, got ${actual})`);
    }
    console.error(
      '\nRun `npm run seed` with valid GOOGLE_APPLICATION_CREDENTIALS to populate Firestore.\n'
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[verify-seed] FATAL ERROR:', err);
  process.exit(1);
});
