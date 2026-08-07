/**
 * Local-development-only admin write bridge.
 *
 * POST /api/local-admin-write
 *
 * Allows the local admin UI bypass to write through Firebase Admin SDK without
 * exposing service-account credentials to the browser. The bypass is accepted
 * only by scripts/dev-api-server.js when LOCAL_ADMIN_BYPASS=true.
 */

import admin from 'firebase-admin';

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)) });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function localBypassAllowed(req) {
  return process.env.LOCAL_API_SERVER === 'true'
    && process.env.LOCAL_ADMIN_BYPASS === 'true'
    && req.headers['x-local-admin-bypass'] === 'true';
}

function validSeasonYear(value) {
  return typeof value === 'string' && /^\d{4}-\d{4}$/.test(value);
}

/** Season years must be two consecutive calendar years, e.g. "2026-2027". */
function validConsecutiveSeasonYear(value) {
  if (!validSeasonYear(value)) return false;
  const [start, end] = value.split('-').map(Number);
  return end === start + 1;
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validDocId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
}

function validRosterName(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
}

function validEnteringAvg(value) {
  return Number.isInteger(value) && value >= 0 && value <= 300;
}

export default async function localAdminWrite(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!localBypassAllowed(req)) return res.status(403).json({ error: 'Local admin bypass is disabled.' });

  try {
    const body = await parseJsonBody(req);
    initFirebaseAdmin();
    const db = admin.firestore();

    if (body.operation === 'set-active-season') {
      if (!validSeasonYear(body.seasonYear)) return res.status(400).json({ error: 'Invalid season year.' });
      await db.collection('settings').doc('global').set({ currentSeasonYear: body.seasonYear }, { merge: true });
    } else if (body.operation === 'set-season-status') {
      if (typeof body.seasonActive !== 'boolean') return res.status(400).json({ error: 'Invalid season status.' });
      if (body.upcomingSeasonYear !== null && !validSeasonYear(body.upcomingSeasonYear)) {
        return res.status(400).json({ error: 'Invalid upcoming season year.' });
      }
      await db.collection('settings').doc('global').set({
        seasonActive: body.seasonActive,
        upcomingSeasonYear: body.upcomingSeasonYear,
      }, { merge: true });
    } else if (body.operation === 'create-season') {
      if (!validConsecutiveSeasonYear(body.seasonYear)) {
        return res.status(400).json({ error: 'Season year must be two consecutive years, e.g. 2026-2027.' });
      }
      if (!Number.isInteger(body.totalWeeks) || body.totalWeeks < 1 || body.totalWeeks > 52) {
        return res.status(400).json({ error: 'Total weeks must be an integer from 1 to 52.' });
      }
      const seasonRef = db.collection('seasons').doc(body.seasonYear);
      const existing = await seasonRef.get();
      if (existing.exists) {
        return res.status(409).json({ error: `Season ${body.seasonYear} already exists.` });
      }
      const batch = db.batch();
      batch.set(seasonRef, {
        year: body.seasonYear,
        startDate: '',
        endDate: '',
        championTeamId: null,
        championTeamName: null,
        teams: [],
      });
      // Mirrors the pipeline's own no-LeaguePals-data fallback defaults
      // (scripts/transform-data.js populateLeagueConfig) so a staged season
      // behaves identically to one the pipeline creates from scratch.
      batch.set(db.collection('leagueConfig').doc(body.seasonYear), {
        seasonYear: body.seasonYear,
        leagueName: 'Late Night Happy Hour Bowling League',
        leagueType: 'Mens',
        weekday: 'Thursday',
        startTime: '8:20 PM',
        bowlingCenter: 'Unknown',
        sanctionNumber: 0,
        numTeams: 13,
        bowlersPerTeam: 4,
        gamesPerNight: 3,
        totalWeeks: body.totalWeeks,
        playoffTeamCount: 8,
        numLanes: 26,
        handicapProfile: { type: 'teamDifference', percentage: 0.85 },
        blindScorePct: 0.9,
        minGamesForAvg: 3,
        prevSeasonMinGames: 21,
        positionRoundSchedule: 'Every other night',
        dues: 0,
        lineage: 0,
        entryFee: 0,
        leaguePalsId: '',
      });
      await batch.commit();
    } else if (body.operation === 'set-week-visibility') {
      if (!Array.isArray(body.updates) || body.updates.length < 1 || body.updates.length > 100) {
        return res.status(400).json({ error: 'Provide 1 to 100 visibility updates.' });
      }
      const batch = db.batch();
      for (const update of body.updates) {
        if (!validDate(update?.date) || typeof update?.visible !== 'boolean') {
          return res.status(400).json({ error: 'Invalid visibility update.' });
        }
        batch.set(db.collection('scheduleWeeks').doc(update.date), { visible: update.visible }, { merge: true });
      }
      await batch.commit();
    } else if (body.operation === 'set-playoff-team-count') {
      if (!validSeasonYear(body.seasonYear) || !Number.isInteger(body.playoffTeamCount) || body.playoffTeamCount < 2 || body.playoffTeamCount > 8) {
        return res.status(400).json({ error: 'Playoff team count must be an integer from 2 to 8.' });
      }
      await db.collection('leagueConfig').doc(body.seasonYear).set({ playoffTeamCount: body.playoffTeamCount }, { merge: true });
    } else if (body.operation === 'set-venue') {
      if (!validSeasonYear(body.seasonYear) || typeof body.bowlingCenter !== 'string' || !body.bowlingCenter.trim()
        || body.bowlingCenter.length > 200 || typeof body.bowlingCenterAddress !== 'string' || body.bowlingCenterAddress.length > 300) {
        return res.status(400).json({ error: 'Invalid venue.' });
      }
      await db.collection('leagueConfig').doc(body.seasonYear).set({
        bowlingCenter: body.bowlingCenter.trim(),
        bowlingCenterAddress: body.bowlingCenterAddress.trim(),
      }, { merge: true });
    } else if (body.operation === 'set-handicap-profile') {
      const profile = body.handicapProfile;
      const validType = profile?.type === 'teamDifference' || profile?.type === 'basisScore';
      const validPct = typeof profile?.percentage === 'number' && profile.percentage > 0 && profile.percentage <= 1;
      const validValue = profile?.type !== 'basisScore' || (Number.isInteger(profile?.value) && profile.value > 0);
      if (!validSeasonYear(body.seasonYear) || !validType || !validPct || !validValue) {
        return res.status(400).json({ error: 'Invalid handicap profile.' });
      }
      await db.collection('leagueConfig').doc(body.seasonYear).set({ handicapProfile: profile }, { merge: true });
    } else if (body.operation === 'save-roster-bowler') {
      if (!validDocId(body.docId) || !validRosterName(body.firstName)
        || !validRosterName(body.lastName) || !validRosterName(body.name)
        || !validEnteringAvg(body.enteringAvg)) {
        return res.status(400).json({ error: 'Invalid roster bowler update.' });
      }
      await db.collection('bowlers').doc(body.docId).set({
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        name: body.name.trim(),
        enteringAvg: body.enteringAvg,
        averageFloat: body.enteringAvg,
        adminOverride: true,
        rosterRemoved: false,
      }, { merge: true });
    } else if (body.operation === 'add-roster-bowler') {
      const bowler = body.bowler;
      if (!validDocId(body.docId) || !bowler || !validSeasonYear(bowler.seasonYear)
        || !validDocId(bowler.teamId) || !validRosterName(bowler.teamName)
        || !validRosterName(bowler.firstName) || !validRosterName(bowler.lastName)
        || !validRosterName(bowler.name) || !validEnteringAvg(bowler.enteringAvg)) {
        return res.status(400).json({ error: 'Invalid new roster bowler.' });
      }
      await db.collection('bowlers').doc(body.docId).set({
        leaguePalsId: typeof bowler.leaguePalsId === 'string' ? bowler.leaguePalsId : 'admin-' + Date.now(),
        seasonYear: bowler.seasonYear,
        teamId: bowler.teamId,
        teamName: bowler.teamName.trim(),
        firstName: bowler.firstName.trim(),
        lastName: bowler.lastName.trim(),
        name: bowler.name.trim(),
        avatarUrl: null,
        average: bowler.enteringAvg,
        averageFloat: bowler.enteringAvg,
        enteringAvg: bowler.enteringAvg,
        enteringAvgSeason: bowler.seasonYear,
        highGame: 0,
        highGameHdcp: 0,
        highSeries: 0,
        highSeriesHdcp: 0,
        gamesPlayed: 0,
        blindWeeksTotal: 0,
        blindWeeksRow: 0,
        indPointsWon: 0,
        adminOverride: true,
        rosterRemoved: false,
      });
    } else if (body.operation === 'add-substitute-bowler') {
      const bowler = body.bowler;
      if (!validDocId(body.docId) || !bowler || !validSeasonYear(bowler.seasonYear)
        || !validRosterName(bowler.firstName) || !validRosterName(bowler.lastName)
        || !validRosterName(bowler.name) || !validEnteringAvg(bowler.enteringAvg)) {
        return res.status(400).json({ error: 'Invalid new substitute bowler.' });
      }
      await db.collection('bowlers').doc(body.docId).set({
        leaguePalsId: typeof bowler.leaguePalsId === 'string' ? bowler.leaguePalsId : 'admin-sub-' + Date.now(),
        seasonYear: bowler.seasonYear,
        teamId: '',
        teamName: '',
        firstName: bowler.firstName.trim(),
        lastName: bowler.lastName.trim(),
        name: bowler.name.trim(),
        avatarUrl: null,
        average: bowler.enteringAvg,
        averageFloat: bowler.enteringAvg,
        enteringAvg: bowler.enteringAvg,
        enteringAvgSeason: bowler.seasonYear,
        highGame: 0,
        highGameHdcp: 0,
        highSeries: 0,
        highSeriesHdcp: 0,
        gamesPlayed: 0,
        blindWeeksTotal: 0,
        blindWeeksRow: 0,
        indPointsWon: 0,
        adminOverride: true,
        isSubPool: true,
      });
    } else if (body.operation === 'remove-roster-bowler') {
      if (!validDocId(body.docId)) {
        return res.status(400).json({ error: 'Invalid roster bowler document ID.' });
      }
      await db.collection('bowlers').doc(body.docId).set({
        teamId: '',
        teamName: '',
        adminOverride: true,
        rosterRemoved: true,
        rosterRemovedAt: new Date().toISOString(),
      }, { merge: true });
    } else if (body.operation === 'save-score-docs') {
      if (!Array.isArray(body.writes) || body.writes.length < 1 || body.writes.length > 100) {
        return res.status(400).json({ error: 'Provide 1 to 100 score document writes.' });
      }
      const allowedCollections = new Set(['bowlerScores', 'matchupDetails']);
      const batch = db.batch();
      for (const write of body.writes) {
        if (!allowedCollections.has(write?.collection) || !validDocId(write?.docId)) {
          return res.status(400).json({ error: 'Invalid score document target.' });
        }
        const ref = db.collection(write.collection).doc(write.docId);
        if (write.operation === 'delete') {
          batch.delete(ref);
        } else if (write.operation === 'set' && write.data && typeof write.data === 'object' && !Array.isArray(write.data)) {
          batch.set(ref, write.data, { merge: write.merge === true });
        } else {
          return res.status(400).json({ error: 'Invalid score document write.' });
        }
      }
      await batch.commit();
    } else if (body.operation === 'save-schedule') {
      if (!validSeasonYear(body.seasonYear) || !Number.isInteger(body.totalWeeks) || body.totalWeeks < 1 || body.totalWeeks > 52) {
        return res.status(400).json({ error: 'Invalid schedule configuration.' });
      }
      if (!Array.isArray(body.writes) || !Array.isArray(body.deleteDates) || body.writes.length + body.deleteDates.length > 500) {
        return res.status(400).json({ error: 'Invalid schedule changes.' });
      }
      const batch = db.batch();
      batch.set(db.collection('leagueConfig').doc(body.seasonYear), { totalWeeks: body.totalWeeks }, { merge: true });
      for (const write of body.writes) {
        if (!validDate(write?.date) || !write?.data || write.data.seasonYear !== body.seasonYear) {
          return res.status(400).json({ error: 'Invalid schedule entry.' });
        }
        batch.set(db.collection('scheduleWeeks').doc(write.date), write.data);
      }
      for (const date of body.deleteDates) {
        if (!validDate(date)) return res.status(400).json({ error: 'Invalid schedule date.' });
        batch.delete(db.collection('scheduleWeeks').doc(date));
      }
      await batch.commit();
    } else {
      return res.status(400).json({ error: 'Unsupported local admin operation.' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[local-admin-write] Failed:', error);
    return res.status(500).json({ error: 'Local admin write failed. Check the local API server and service account.' });
  }
}
