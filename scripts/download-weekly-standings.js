/**
 * download-weekly-standings.js
 *
 * Downloads all weekly standings PDFs from LeaguePals.
 *
 * The core problem: standings pages require a MongoDB snapshot ID
 * (e.g. /currentstandings?id=<24-char hex>) that is created on-demand
 * when the PrintStandingsModal is submitted. Without the correct ID,
 * the page renders empty/default content.
 *
 * Strategy:
 *   1. Log in to LeaguePals via direct API POST (no UI form)
 *   2. Navigate to the league Scoring tab and open PrintStandingsModal
 *   3. Read allWeeks + originalWeeks from the modal's Angular scope
 *   4. Reuse any pre-existing snapshot IDs from originalWeeks
 *   5. For each week still missing an ID:
 *        a. Re-open the modal, select the week, click Generate
 *        b. Intercept the POST /saveCurrentStandings response → extract _id
 *           (fallback: read the resulting navigation URL ?id= param)
 *        c. Cache the ID in snapshot-ids.json for resumable runs
 *   6. Render each /currentstandings?id=<id> page to a PDF
 *
 * Usage:   node scripts/download-weekly-standings.js
 * Env:     LEAGUEPALS_EMAIL, LEAGUEPALS_PASSWORD in .env
 * Output:  weekly-standings-pdfs/week-01.pdf ... week-NN.pdf
 *          weekly-standings-pdfs/snapshot-ids.json (ID cache)
 */

import puppeteer from 'puppeteer'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config as loadEnv } from 'dotenv'
import { google } from 'googleapis'
import { Readable } from 'stream'

loadEnv()

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PDF_DIR = join(ROOT, 'weekly-standings-pdfs')
const SNAPSHOT_CACHE_PATH = join(PDF_DIR, 'snapshot-ids.json')
const DRIVE_CACHE_PATH = join(PDF_DIR, 'drive-uploads.json')

const BASE_URL = 'https://www.leaguepals.com'
const LEAGUE_ID = '688118301406d3982ec379a1'
const LEAGUE_PAGE = `${BASE_URL}/league-user?id=${LEAGUE_ID}`

const { LEAGUEPALS_EMAIL, LEAGUEPALS_PASSWORD } = process.env
if (!LEAGUEPALS_EMAIL || !LEAGUEPALS_PASSWORD) {
  console.error('Missing LEAGUEPALS_EMAIL or LEAGUEPALS_PASSWORD in .env')
  process.exit(1)
}

// Drive upload is optional — set DRIVE_FOLDER_2025_2026_WEEKLY_REPORTS to enable
const DRIVE_FOLDER_STANDINGS = process.env.DRIVE_FOLDER_2025_2026_WEEKLY_REPORTS || ''

/** @param {number} ms */
const wait = ms => new Promise(r => setTimeout(r, ms))

// ── Snapshot ID cache ──────────────────────────────────────────────────────

/**
 * Loads the snapshot ID cache from disk.
 * Maps weekNum (string) → snapshot MongoDB ObjectId string.
 * @returns {Record<string, string>}
 */
function loadCache() {
  if (!existsSync(SNAPSHOT_CACHE_PATH)) return {}
  try { return JSON.parse(readFileSync(SNAPSHOT_CACHE_PATH, 'utf8')) }
  catch { return {} }
}

/**
 * Persists the snapshot ID cache to disk so runs are resumable.
 * @param {Record<string, string>} cache
 */
function saveCache(cache) {
  mkdirSync(PDF_DIR, { recursive: true })
  writeFileSync(SNAPSHOT_CACHE_PATH, JSON.stringify(cache, null, 2))
}

// ── Login ──────────────────────────────────────────────────────────────────

/**
 * Authenticates via LeaguePals REST API and injects session cookies into the page.
 * Avoids the UI login form because Angular ng-model doesn't respond to direct .value= assignment.
 *
 * @param {import('puppeteer').Page} page
 */
async function login(page) {
  console.log('Logging in to LeaguePals via API...')

  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: LEAGUEPALS_EMAIL, password: LEAGUEPALS_PASSWORD }),
    redirect: 'manual',
  })

  const setCookieHeaders = res.headers.getSetCookie?.() ?? []
  console.log(`  Status: ${res.status}, Cookies: ${setCookieHeaders.length}`)

  if (!setCookieHeaders.length) {
    const body = await res.text()
    console.error('  Body preview:', body.slice(0, 300))
    console.error('  ✗ No session cookies returned — login failed')
    process.exit(1)
  }

  for (const cookieStr of setCookieHeaders) {
    const eqIdx = cookieStr.indexOf('=')
    const semiIdx = cookieStr.indexOf(';')
    const name = cookieStr.slice(0, eqIdx).trim()
    const value = cookieStr.slice(eqIdx + 1, semiIdx > 0 ? semiIdx : undefined).trim()
    const attrs = cookieStr.slice(semiIdx > 0 ? semiIdx : 0).split(';')
    const domainAttr = attrs.find(a => /^\s*domain=/i.test(a))
    const pathAttr = attrs.find(a => /^\s*path=/i.test(a))
    await page.setCookie({
      name,
      value,
      domain: domainAttr ? domainAttr.split('=')[1].trim() : 'www.leaguepals.com',
      path: pathAttr ? pathAttr.split('=')[1].trim() : '/',
    })
  }
  console.log(`  ✓ Injected ${setCookieHeaders.length} cookie(s) into browser`)
}

// ── Navigation helpers ─────────────────────────────────────────────────────

/**
 * Navigates to the league SPA page and clicks the Scoring tab.
 * Waits for Angular to bootstrap before proceeding.
 *
 * @param {import('puppeteer').Page} page
 */
async function navigateToScoringTab(page) {
  await page.goto(LEAGUE_PAGE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => typeof window.angular !== 'undefined', { timeout: 15000 })
  await wait(3000)

  const found = await page.evaluate(() => {
    // Try nav links first, then any element with exact text "Scoring"
    const byLink = Array.from(document.querySelectorAll('a, .nav li a, [ui-sref], [ng-click]'))
      .find(el => el.textContent.trim() === 'Scoring')
    if (byLink) { byLink.click(); return true }

    const byText = Array.from(document.querySelectorAll('*'))
      .find(el => el.childElementCount === 0 && el.textContent.trim() === 'Scoring')
    if (byText) { byText.click(); return true }
    return false
  })

  if (!found) throw new Error('Scoring tab not found on league page')
  await wait(3000)
  console.log('  ✓ Scoring tab loaded')
}

/**
 * Clicks the printer icon on the Scoring tab to open PrintStandingsModal.
 * Tries several selectors in order of specificity.
 *
 * @param {import('puppeteer').Page} page
 */
async function openPrintModal(page) {
  const result = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, a, [ng-click]'))

    // 1. Button containing a .fa-print or .glyphicon-print icon
    const iconBtn = allBtns.find(b => b.querySelector('.fa-print, .glyphicon-print'))
    if (iconBtn) { iconBtn.click(); return { method: 'fa-icon', html: iconBtn.outerHTML.slice(0, 120) } }

    // 2. ng-click that references "print" (case-insensitive)
    const ngBtn = allBtns.find(b => (b.getAttribute('ng-click') ?? '').toLowerCase().includes('print'))
    if (ngBtn) { ngBtn.click(); return { method: 'ng-click-print', html: ngBtn.outerHTML.slice(0, 120) } }

    // 3. Any element with "print" in its class name
    const classEl = Array.from(document.querySelectorAll('[class*="print"]'))
      .find(el => ['button', 'a'].includes(el.tagName.toLowerCase()) || el.getAttribute('ng-click'))
    if (classEl) { classEl.click(); return { method: 'class-print', html: classEl.outerHTML.slice(0, 120) } }

    // Debug dump — tell us what's available on the page
    return {
      method: null,
      buttons: allBtns.slice(0, 30).map(b => ({
        tag: b.tagName,
        text: b.textContent.trim().slice(0, 40),
        ngClick: b.getAttribute('ng-click'),
        classes: b.className.slice(0, 60),
      })),
    }
  })

  if (!result.method) {
    console.log('  DEBUG — page buttons:', JSON.stringify(result.buttons, null, 2))
    throw new Error('Could not find print icon button on Scoring tab')
  }

  console.log(`  ✓ Print modal opened via ${result.method}`)
  await wait(2000) // Wait for UIB modal animation
}

// ── Modal inspection ───────────────────────────────────────────────────────

/**
 * Reads allWeeks and originalWeeks from the PrintStandingsModal Angular scope,
 * and dumps the full modal HTML for debugging on first run.
 *
 * allWeeks  — the list of bowlable weeks (week metadata, NOT snapshot IDs)
 * originalWeeks — same shape; may contain snapshot _id fields if generated before
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ allWeeks: any[], originalWeeks: any[] }>}
 */
async function getModalWeeks(page) {
  const result = await page.evaluate(() => {
    /**
     * Walks the Angular scope chain upward from el looking for allWeeks.
     * @param {Element} el
     */
    function findWeeksScope(el) {
      let scope = angular.element(el).scope()
      for (let depth = 0; depth < 25 && scope; depth++) {
        if (Array.isArray(scope.allWeeks) && scope.allWeeks.length > 0) {
          return { allWeeks: scope.allWeeks, originalWeeks: scope.originalWeeks ?? [] }
        }
        scope = scope.$parent
      }
      return null
    }

    const candidates = [
      document.querySelector('.modal-dialog'),
      document.querySelector('.modal'),
      document.querySelector('[uib-modal-window]'),
      ...document.querySelectorAll('[ng-controller]'),
    ].filter(Boolean)

    for (const el of candidates) {
      const found = findWeeksScope(el)
      if (found) {
        const modal = document.querySelector('.modal-dialog, .modal')
        return {
          ok: true,
          source: el.className || el.getAttribute('ng-controller') || el.tagName,
          modalHtml: modal ? modal.innerHTML : '',
          ...found,
        }
      }
    }

    const modal = document.querySelector('.modal-dialog, .modal')
    return {
      ok: false,
      modalHtml: modal ? modal.innerHTML.slice(0, 5000) : '(no .modal element found)',
      scopeKeys: Array.from(document.querySelectorAll('[ng-controller]')).map(el => {
        const keys = []
        let s = angular.element(el).scope()
        for (let i = 0; i < 8 && s; i++) {
          keys.push(Object.keys(s).filter(k => !k.startsWith('$')))
          s = s.$parent
        }
        return { ctrl: el.getAttribute('ng-controller'), keys }
      }),
    }
  })

  if (!result.ok) {
    console.log('\n  DEBUG — modal HTML:\n', result.modalHtml)
    console.log('\n  DEBUG — scope keys:', JSON.stringify(result.scopeKeys, null, 2))
    throw new Error('Could not find allWeeks in PrintStandingsModal Angular scope')
  }

  console.log(`  ✓ Found ${result.allWeeks.length} weeks (scope source: ${result.source})`)
  console.log('  Sample week entry:', JSON.stringify(result.allWeeks[0]))
  if (result.originalWeeks.length > 0) {
    console.log(`  originalWeeks[0]:`, JSON.stringify(result.originalWeeks[0]))
  }

  return { allWeeks: result.allWeeks, originalWeeks: result.originalWeeks, modalHtml: result.modalHtml }
}

// ── Snapshot generation ────────────────────────────────────────────────────

/**
 * Selects a week in the open PrintStandingsModal, waits for data to load,
 * clicks PRINT, and captures the resulting snapshot ID.
 *
 * Modal structure (from HTML inspection):
 *   - Week:     <select ng-model="selectedWeek" ng-change="refreshScores(false)">
 *   - Template: <select ng-model="selectedTemplate" ng-change="toggleTemplate()">
 *   - PRINT:    <div ng-click="printCurrentStandings()" ng-show="canPrint()">
 *     The PRINT div starts as ng-hide; becomes visible once refreshScores() loads data.
 *
 * Capture strategy (in priority order):
 *   1. Intercept POST /saveCurrentStandings response body → _id field
 *   2. Read the ?id= param from the resulting page navigation URL
 *
 * After returning, the page is on /currentstandings. The caller navigates back
 * to the league page before the next iteration.
 *
 * @param {import('puppeteer').Page} page
 * @param {number} weekIndex - 0-based index into allWeeks
 * @param {string} [templateName] - template to select by name; defaults to 'Late Night Notes'
 * @returns {Promise<string|null>} MongoDB ObjectId hex string, or null on failure
 */
async function generateSnapshot(page, weekIndex, templateName = 'Late Night Notes') {
  let snapshotId = null

  // ── Intercept ALL XHR/fetch responses to find the save endpoint ───────
  // Log anything that looks like a data-mutating call so we can identify
  // the correct URL if it differs from /saveCurrentStandings.
  const onResponse = async (res) => {
    const url = res.url()
    const method = res.request().method()
    if (method !== 'GET' && (url.includes('leaguepals') || url.includes('localhost'))) {
      console.log(`    [net] ${method} ${url.replace('https://www.leaguepals.com', '')}`)
    }
    if (!url.includes('saveCurrentStandings') && !url.includes('currentStandings') &&
        !url.includes('standings') && !url.includes('Standings')) return
    try {
      const text = await res.text()
      console.log(`    [intercept] ${url.replace('https://www.leaguepals.com', '')} → ${text.slice(0, 400)}`)
      const json = JSON.parse(text)
      const candidate = json._id ?? json.data?._id ?? json.id ?? json.standingsId
        ?? json.currentStandingId ?? json.snapshotId ?? null
      if (candidate && /^[a-f0-9]{24}$/i.test(String(candidate))) {
        snapshotId = String(candidate)
      }
    } catch { /* non-JSON or already consumed */ }
  }
  page.on('response', onResponse)

  // ── Watch for navigation to /currentstandings (server-rendered page) ──
  // Use framenavigated instead of waitForNavigation so we can filter by URL
  // and avoid false positives from Angular SPA route updates.
  let standingsUrl = null
  const onFrame = frame => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    if (url.includes('/currentstandings')) {
      standingsUrl = url
      console.log(`    [nav] → ${url}`)
    }
  }
  page.on('framenavigated', onFrame)

  // ── Select week + template via Angular scope, poll for PRINT, click it ─
  const actionResult = await page.evaluate(async (idx, tmplName) => {
    let scope = null
    const candidates = [
      document.querySelector('.modal-dialog'),
      document.querySelector('.modal'),
      ...document.querySelectorAll('[ng-controller]'),
    ].filter(Boolean)

    for (const el of candidates) {
      let s = angular.element(el).scope()
      for (let depth = 0; depth < 25 && s; depth++) {
        if (Array.isArray(s.allWeeks) && s.allWeeks.length) { scope = s; break }
        s = s.$parent
      }
      if (scope) break
    }

    if (!scope) return { error: 'modal scope with allWeeks not found' }

    const week = scope.allWeeks[idx]
    if (!week) return { error: `allWeeks[${idx}] undefined (len=${scope.allWeeks.length})` }

    // ── 1. Select the week — set ng-model + fire ng-change (refreshScores) ─
    scope.$apply(() => { scope.selectedWeek = week })
    await new Promise(r => setTimeout(r, 200))
    scope.$apply(() => {
      if (typeof scope.refreshScores === 'function') scope.refreshScores(false)
    })

    // ── 2. Poll until PRINT div becomes visible (canPrint() = true) ───────
    // refreshScores() makes an async API call; canPrint() gates the PRINT div.
    let printDiv = null
    for (let poll = 0; poll < 60; poll++) {
      await new Promise(r => setTimeout(r, 200))
      printDiv = document.querySelector('[ng-click="printCurrentStandings()"]')
      if (printDiv && !printDiv.classList.contains('ng-hide')) break
      printDiv = null
    }

    if (!printDiv) {
      return {
        error: 'PRINT div never became visible — week may have no bowling data',
        weekDate: week.date,
        weekNum: week.weekNum,
      }
    }

    // Brief settle after canPrint() becomes true — avoids clicking mid-load
    await new Promise(r => setTimeout(r, 600))

    // Re-check in case canPrint() flickered
    printDiv = document.querySelector('[ng-click="printCurrentStandings()"]')
    if (!printDiv || printDiv.classList.contains('ng-hide')) {
      return { error: 'PRINT div disappeared after settle — retrying outer loop', weekDate: week.date }
    }

    // ── 3. Trigger PRINT — try scope call first, fall back to DOM click ──
    // Direct scope call bypasses DOM event handling; avoids silent digest errors.
    let triggered = false
    if (typeof scope.printCurrentStandings === 'function') {
      try {
        scope.$apply(() => scope.printCurrentStandings())
        triggered = true
      } catch (e) {
        console.error('scope.printCurrentStandings() threw:', e.message)
      }
    }
    if (!triggered) {
      printDiv.click()
    }
    return { ok: true, weekDate: week.date, method: triggered ? 'scope' : 'click' }
  }, weekIndex, templateName)

  console.log(`    action:`, JSON.stringify(actionResult))

  if (actionResult.error) {
    page.off('response', onResponse)
    page.off('framenavigated', onFrame)
    return null
  }

  // ── Wait up to 20s for either a response intercept or a /currentstandings nav ─
  for (let i = 0; i < 200 && !snapshotId; i++) {
    await wait(100)
    // Check if we navigated to /currentstandings and can read the id from the URL
    if (standingsUrl && !snapshotId) {
      try {
        const id = new URL(standingsUrl).searchParams.get('id')
        if (id && /^[a-f0-9]{24}$/i.test(id)) {
          snapshotId = id
          console.log(`    [nav-url] id from /currentstandings URL: ${id}`)
        }
      } catch { /* malformed */ }
    }
  }

  page.off('response', onResponse)
  page.off('framenavigated', onFrame)

  if (snapshotId) {
    console.log(`    ✓ snapshot ID: ${snapshotId}`)
  } else {
    console.log(`    ✗ no snapshot ID captured after PRINT click`)
  }

  return snapshotId
}

// ── PDF download ───────────────────────────────────────────────────────────

/**
 * Opens /currentstandings?id=<snapshotId> in a new page, suppresses the
 * auto-firing window.print() call, and renders the page to a PDF file.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} snapshotId - MongoDB ObjectId
 * @param {number} weekNum - 1-based week number for the filename
 * @param {string} weekLabel - human-readable label for console output
 * @returns {Promise<boolean>}
 */
async function downloadPdf(browser, snapshotId, weekNum, weekLabel) {
  const num = String(weekNum).padStart(2, '0')
  const filename = `week-${num}.pdf`
  const outPath = join(PDF_DIR, filename)
  const url = `${BASE_URL}/currentstandings?id=${snapshotId}`

  process.stdout.write(`  [Week ${num}] ${weekLabel} … `)

  const pg = await browser.newPage()
  try {
    // Suppress window.print() — the page auto-calls it on load
    await pg.evaluateOnNewDocument(() => { window.print = () => {} })
    await pg.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
    await wait(2000) // Extra settle time for web fonts and images
    await pg.pdf({
      path: outPath,
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
    })
    console.log(`✓  ${filename}`)
    return true
  } catch (err) {
    console.log(`✗  ${err.message}`)
    return false
  } finally {
    await pg.close()
  }
}

// ── Google Drive upload ────────────────────────────────────────────────────

/**
 * Loads the Drive upload cache from disk.
 * Maps weekNum (string) → Drive file ID string.
 * @returns {Record<string, string>}
 */
function loadDriveCache() {
  if (!existsSync(DRIVE_CACHE_PATH)) return {}
  try { return JSON.parse(readFileSync(DRIVE_CACHE_PATH, 'utf8')) }
  catch { return {} }
}

/**
 * Persists the Drive upload cache to disk.
 * @param {Record<string, string>} cache
 */
function saveDriveCache(cache) {
  writeFileSync(DRIVE_CACHE_PATH, JSON.stringify(cache, null, 2))
}

/**
 * Creates an authenticated Google Drive v3 client using OAuth2.
 * Uses the same credentials as api/upload-to-drive.js (offline refresh token
 * for the league Google account — service accounts have no Drive quota).
 *
 * @returns {import('googleapis').drive_v3.Drive}
 * @throws {Error} When any required OAuth env var is missing.
 */
function getDriveClient() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env
  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error(
      'Missing OAuth2 credentials for Drive upload. ' +
      'Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.'
    )
  }
  const auth = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

/**
 * Uploads a PDF file to the standings Google Drive folder and makes it public.
 *
 * @param {import('googleapis').drive_v3.Drive} drive  Authenticated Drive client.
 * @param {string} pdfPath     Absolute path to the local PDF file.
 * @param {number} weekNum     1-based week number used in the file name.
 * @param {string} weekLabel   Human-readable week label (e.g. "Week 12").
 * @returns {Promise<string>}  Resolves with the new Drive file ID.
 * @throws {Error}             On any Drive API error.
 */
async function uploadPdfToDrive(drive, pdfPath, weekNum, weekLabel) {
  const fileName = `Week ${String(weekNum).padStart(2, '0')} - ${weekLabel}.pdf`
  const buffer = readFileSync(pdfPath)
  const bodyStream = Readable.from(buffer)

  const { data } = await drive.files.create({
    requestBody: { name: fileName, parents: [DRIVE_FOLDER_STANDINGS] },
    media: { mimeType: 'application/pdf', body: bodyStream },
    fields: 'id',
  })

  if (!data.id) throw new Error(`Drive API returned no file ID for ${fileName}`)

  // Make the file publicly readable so it can be embedded in the site
  await drive.permissions.create({
    fileId: data.id,
    requestBody: { type: 'anyone', role: 'reader' },
    sendNotificationEmail: false,
  })

  return data.id
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(PDF_DIR, { recursive: true })

  // Load cached snapshot IDs from a previous run (allows resuming)
  const cache = loadCache()
  console.log(`Snapshot cache loaded: ${Object.keys(cache).length} week(s) already have IDs`)

  // In CI (GitHub Actions sets CI=true) run headless with extra sandbox flags
  const isCI = Boolean(process.env.CI)
  const browser = await puppeteer.launch({
    headless: isCI,
    slowMo: isCI ? 0 : 30,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      ...(isCI ? ['--disable-dev-shm-usage'] : []),
    ],
  })

  let allWeeks = []

  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    )

    // ── 1. Login ────────────────────────────────────────────────────────
    await login(page)

    // ── 2. Open modal and read week list ────────────────────────────────
    console.log('\nDiscovering weeks from PrintStandingsModal...')
    await navigateToScoringTab(page)
    await openPrintModal(page)
    const modalData = await getModalWeeks(page)
    allWeeks = modalData.allWeeks

    // ── 3. Harvest any pre-existing snapshot IDs from originalWeeks ─────
    // originalWeeks contains snapshots from previous admin sessions
    if (modalData.originalWeeks.length > 0) {
      console.log('\nHarvesting pre-existing snapshot IDs from originalWeeks...')
      for (const ow of modalData.originalWeeks) {
        const id = ow._id || ow.id
        const wn = ow.weekNum ?? ow.week
        if (id && wn && /^[a-f0-9]{24}$/i.test(String(id)) && !cache[String(wn)]) {
          cache[String(wn)] = id
          console.log(`  ✓ Week ${wn}: ${id}`)
        }
      }
      saveCache(cache)
    }

    // ── 4. Normalize week list for processing ───────────────────────────
    const weeks = allWeeks.map((w, i) => ({
      ...w,
      _index: i,
      weekNum: w.weekNum ?? i + 1,
      label: w.weekLabel ?? w.label ?? w.name ?? `Week ${(w.weekNum ?? i + 1)}`,
    }))

    // ── DEBUG: exit after first modal open if DUMP_MODAL is set ──────────
    if (process.env.DUMP_MODAL) {
      console.log('\n[DUMP_MODAL] Exiting after modal inspection. Check DEBUG output above.')
      return
    }

    // Dismiss the modal before looping (Escape key)
    await page.keyboard.press('Escape')
    await wait(500)

    // ── 5. Generate snapshot IDs for uncached weeks ─────────────────────
    const missing = weeks.filter(w => !cache[String(w.weekNum)])
    console.log(`\n${missing.length} weeks need snapshot generation (${weeks.length - missing.length} cached)`)

    for (const week of missing) {
      console.log(`\nGenerating snapshot for Week ${week.weekNum} (${week.label})...`)

      // Re-navigate to Scoring tab and re-open the modal each iteration.
      // The Generate action navigates away to /currentstandings, so we must
      // return to the league page before opening the modal again.
      await navigateToScoringTab(page)
      await openPrintModal(page)

      const snapshotId = await generateSnapshot(page, week._index)

      if (snapshotId) {
        cache[String(week.weekNum)] = snapshotId
        saveCache(cache) // persist after each success so a crash doesn't lose progress
        console.log(`  → Cached Week ${week.weekNum}`)
      } else {
        console.log(`  ✗ Week ${week.weekNum} skipped — will need manual retry`)
      }

      await wait(1000)
    }

    // ── 6. Download a PDF for every cached snapshot ID ──────────────────
    const weekLabelMap = Object.fromEntries(weeks.map(w => [String(w.weekNum), w.label]))

    const sortedEntries = Object.entries(cache)
      .map(([wn, id]) => ({ weekNum: parseInt(wn), id, label: weekLabelMap[wn] ?? `Week ${wn}` }))
      .sort((a, b) => a.weekNum - b.weekNum)

    console.log(`\nDownloading ${sortedEntries.length} PDF(s)...`)
    let okCount = 0
    for (const { weekNum, id, label } of sortedEntries) {
      const ok = await downloadPdf(browser, id, weekNum, label)
      if (ok) okCount++
      await wait(300)
    }

    console.log(`\n✓ Done: ${okCount}/${sortedEntries.length} PDFs saved to ${PDF_DIR}`)

    if (okCount < sortedEntries.length) {
      console.log(`  ✗ ${sortedEntries.length - okCount} PDF(s) failed — re-run to retry`)
    }

    // ── 7. Upload PDFs to Google Drive ──────────────────────────────────
    if (!DRIVE_FOLDER_STANDINGS) {
      console.log('\nSkipping Drive upload — set DRIVE_FOLDER_2025_2026_WEEKLY_REPORTS to enable')
    } else {
      const driveCache = loadDriveCache()
      const uploadable = sortedEntries.filter(({ weekNum }) => {
        const pdfPath = join(PDF_DIR, `week-${String(weekNum).padStart(2, '0')}.pdf`)
        return existsSync(pdfPath) && !driveCache[String(weekNum)]
      })

      console.log(
        `\nUploading ${uploadable.length} PDF(s) to Google Drive ` +
        `(${sortedEntries.length - uploadable.length} already uploaded)...`
      )

      let drive
      try {
        drive = getDriveClient()
      } catch (err) {
        console.error(`  ✗ Drive client init failed: ${err.message}`)
        console.error('  Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN')
      }

      if (drive) {
        for (const { weekNum, label } of uploadable) {
          const pdfPath = join(PDF_DIR, `week-${String(weekNum).padStart(2, '0')}.pdf`)
          process.stdout.write(`  [Week ${String(weekNum).padStart(2, '0')}] ${label} → Drive … `)
          try {
            const fileId = await uploadPdfToDrive(drive, pdfPath, weekNum, label)
            driveCache[String(weekNum)] = fileId
            saveDriveCache(driveCache)
            console.log(`✓  ${fileId}`)
          } catch (err) {
            console.log(`✗  ${err.message}`)
          }
          await wait(300)
        }

        const uploadedCount = Object.keys(driveCache).length
        console.log(`\n✓ Drive: ${uploadedCount} PDF(s) uploaded total`)
      }
    }

  } finally {
    await browser.close()
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message)
  console.error(err.stack)
  process.exit(1)
})
