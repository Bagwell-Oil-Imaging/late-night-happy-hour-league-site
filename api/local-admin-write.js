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

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
