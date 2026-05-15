/**
 * @file verify-st-hughs-data.cjs
 * Checks Firestore for St Hugh's matchup + opponent data in the first half.
 * Uses single-field queries only (no compound indexes needed).
 * Run: node scripts/verify-st-hughs-data.cjs
 */

require('dotenv').config()
const admin = require('firebase-admin')

const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const SEASON = '2025-2026'

async function main() {
  // ── All teams for this season ──────────────────────────────────────────────
  const teamsSnap = await db.collection('teams').where('seasonYear', '==', SEASON).get()
  const allTeams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.displayId ?? 99) - (b.displayId ?? 99))

  const stHughsTeam = allTeams.find(t => (t.name ?? '').toLowerCase().includes('hugh'))
  const magaTeam = allTeams.find(t =>
    (t.name ?? '').toLowerCase().includes('maga') || t.displayId === 9
  )

  console.log('\n=== Teams ===')
  for (const t of allTeams) {
    console.log(`  ${String(t.displayId).padStart(2)}  ${(t.name ?? '?').padEnd(28)} id="${t.id}"`)
  }

  console.log('\nSt Hugh\'s:', stHughsTeam
    ? `id="${stHughsTeam.id}"  displayId=${stHughsTeam.displayId}`
    : 'NOT FOUND')
  console.log('Maga-Crats:', magaTeam
    ? `id="${magaTeam.id}"  displayId=${magaTeam.displayId}`
    : 'NOT FOUND')

  // ── Schedule weeks — filter in JS to skip compound index requirement ───────
  const weeksSnap = await db.collection('scheduleWeeks').where('seasonYear', '==', SEASON).get()
  const completedWeeks = weeksSnap.docs
    .map(d => d.data())
    .filter(w => w.status === 'completed' && w.week != null)
    .sort((a, b) => a.week - b.week)
  const firstHalf = completedWeeks.filter(w => w.week <= 17)
  console.log(`\nFirst-half completed weeks: ${firstHalf.map(w => w.week).join(', ')}`)

  // ── All matchups ───────────────────────────────────────────────────────────
  const matchupsSnap = await db.collection('matchups').where('seasonYear', '==', SEASON).get()
  const allMatchups = matchupsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // ── All matchupDetails ─────────────────────────────────────────────────────
  const detailsSnap = await db.collection('matchupDetails').where('seasonYear', '==', SEASON).get()
  const allDetails = detailsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

  // Helper: resolve team name from an ID
  function teamName(id) {
    const t = allTeams.find(x => x.id === id || x.leaguePalsId === id)
    return t ? `${t.name}(${t.displayId})` : id
  }

  // ── Week 1 raw matchups ────────────────────────────────────────────────────
  console.log('\n=== Week 1 raw matchups ===')
  const week1Raw = allMatchups.filter(m => m.week === 1)
  if (week1Raw.length === 0) {
    console.log('  (none found)')
  }
  for (const m of week1Raw) {
    console.log(`  ${teamName(m.team1Id)} vs ${teamName(m.team2Id)}`)
  }

  // ── Week 1 matchupDetails ─────────────────────────────────────────────────
  console.log('\n=== Week 1 matchupDetails ===')
  const week1Details = allDetails.filter(d => d.week === 1)
  if (week1Details.length === 0) {
    console.log('  (none found)')
  }
  for (const d of week1Details) {
    const t1 = d.team1
    const t2 = d.team2
    console.log(`  ${t1?.teamName}(G:${t1?.game1Total}/${t1?.game2Total}/${t1?.game3Total} pts=${t1?.points})`)
    console.log(`    vs ${t2?.teamName}(G:${t2?.game1Total}/${t2?.game2Total}/${t2?.game3Total} pts=${t2?.points})`)
  }

  // ── Maga-Crats Week 1 bowlerScores ────────────────────────────────────────
  if (magaTeam) {
    console.log('\n=== Maga-Crats Week 1 bowlerScores ===')
    const snap = await db.collection('bowlerScores')
      .where('teamId', '==', magaTeam.id)
      .where('week', '==', 1)
      .get()
    if (snap.empty) {
      console.log('  (none found)')
    }
    for (const d of snap.docs) {
      const s = d.data()
      console.log(`  ${(s.bowlerName ?? '?').padEnd(22)} G1=${s.game1} G2=${s.game2} G3=${s.game3}  opp="${s.opponentTeamName}"`)
    }
  }

  // ── First-half summary: matchupDetails present/absent per week ─────────────
  console.log('\n=== First-half matchupDetails & bowlerScore coverage ===')
  console.log('  Wk | Details | St Hugh\'s in details | Maga bowlerScores')
  for (const w of firstHalf) {
    const weekDetails = allDetails.filter(d => d.week === w.week)
    const hasStHughs = weekDetails.some(d =>
      (d.team1?.teamName ?? '').toLowerCase().includes('hugh') ||
      (d.team2?.teamName ?? '').toLowerCase().includes('hugh')
    )

    let magaCount = '?'
    if (magaTeam) {
      const snap = await db.collection('bowlerScores')
        .where('teamId', '==', magaTeam.id)
        .where('week', '==', w.week)
        .get()
      magaCount = String(snap.size)
    }

    console.log(`   ${String(w.week).padStart(2)} |    ${weekDetails.length}    | ${String(hasStHughs).padEnd(20)} | ${magaCount}`)
  }

  // ── Teams absent from matchupDetails by week (first half) ─────────────────
  console.log('\n=== Teams absent from matchupDetails (first half only) ===')
  for (const w of firstHalf) {
    const weekDetails = allDetails.filter(d => d.week === w.week)
    const presentIds = new Set()
    const presentNorms = new Set()
    for (const d of weekDetails) {
      if (d.team1?.teamId) presentIds.add(d.team1.teamId)
      if (d.team2?.teamId) presentIds.add(d.team2.teamId)
      const norm = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
      presentNorms.add(norm(d.team1?.teamName))
      presentNorms.add(norm(d.team2?.teamName))
    }
    const norm = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const absent = allTeams.filter(t =>
      !presentIds.has(t.id) && !presentNorms.has(norm(t.name))
    )
    if (absent.length > 0) {
      console.log(`  Wk ${w.week}: ${absent.map(t => `${t.name}(${t.displayId})`).join(', ')}`)
    }
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
