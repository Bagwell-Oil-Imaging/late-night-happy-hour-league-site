/**
 * Local API dev server for Vite proxy targets.
 *
 * Usage: npm run dev:api
 */

import fs from 'node:fs';
import localAdminWrite from '../api/local-admin-write.js';
import http from 'node:http';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import reingestWeek from '../api/reingest-week.js';

loadEnv({ path: '.env.local' });
loadEnv();

const PORT = Number(process.env.LOCAL_API_PORT ?? 3000);
process.env.LOCAL_API_SERVER = 'true';

function parseServiceAccountProjectId(value) {
  if (!value) return null;
  try {
    return JSON.parse(value).project_id ?? null;
  } catch {
    return null;
  }
}

function resolveServiceAccountPath() {
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? './service-account.json';
  return path.resolve(process.cwd(), configuredPath);
}

function ensureLocalServiceAccountJson() {
  const expectedProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  const currentProjectId = parseServiceAccountProjectId(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (currentProjectId && (!expectedProjectId || currentProjectId === expectedProjectId)) return;

  const serviceAccountPath = resolveServiceAccountPath();
  if (!fs.existsSync(serviceAccountPath)) return;

  const fileJson = fs.readFileSync(serviceAccountPath, 'utf8');
  const fileProjectId = parseServiceAccountProjectId(fileJson);
  if (expectedProjectId && fileProjectId && fileProjectId !== expectedProjectId) {
    console.warn(
      `[dev-api] Service account project "${fileProjectId}" does not match VITE_FIREBASE_PROJECT_ID "${expectedProjectId}".`
    );
    return;
  }

  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fileJson;
  console.log(`[dev-api] Loaded Firebase service account from ${serviceAccountPath}`);
}

function attachVercelResponseHelpers(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = payload => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(payload));
    return res;
  };
  return res;
}

ensureLocalServiceAccountJson();

const server = http.createServer(async (req, res) => {
  attachVercelResponseHelpers(res);

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${PORT}`}`);
  if (url.pathname === '/api/reingest-week') {
    await reingestWeek(req, res);
    return;
  }
  if (url.pathname === '/api/local-admin-write') {
    await localAdminWrite(req, res);
    return;
  }

  res.status(404).json({ error: `No local API route for ${url.pathname}.` });
});

server.listen(PORT, () => {
  console.log(`[dev-api] Listening on http://localhost:${PORT}`);
  console.log('[dev-api] Routes: POST /api/reingest-week, POST /api/local-admin-write');
});