/**
 * @fileoverview Vercel serverless function — Upload a PDF to Google Drive.
 *
 * Endpoint: POST /api/upload-to-drive
 * Content-Type: multipart/form-data
 *
 * Required form fields:
 *   - file        {File}   The PDF to upload (binary part)
 *   - folderId    {string} Google Drive folder ID where the file is placed
 *   - fileName    {string} Display name for the file in Google Drive
 *
 * Required HTTP headers:
 *   - Authorization: Bearer <Firebase ID Token>
 *
 * On success returns: { fileId: "<Drive file ID>" }
 * On failure returns: { error: "<message>" } with 4xx or 5xx status code.
 *
 * Security model:
 *   - Drive uploads are authenticated via OAuth2 using a stored refresh token
 *     for the league Google account. This is required because service accounts
 *     have no Drive storage quota and cannot create files in personal Drives.
 *   - Firebase Admin SDK (service account) is used only to verify the caller's
 *     Firebase ID token — not for Drive operations.
 *   - All credentials are stored server-side in environment variables and are
 *     never exposed to the browser.
 *
 * Module format: ESM (export default) — the project uses "type": "module" in
 * package.json, so all .js files are treated as ESM. Vercel's serverless
 * runtime supports both ESM export default and CommonJS module.exports for
 * api/ functions; ESM is used here to align with the project's module system.
 *
 * Environment variables required (set in Vercel dashboard and locally in .env):
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — Service account JSON for Firebase Admin SDK
 *                                  (token verification only, not Drive uploads)
 *   GOOGLE_OAUTH_CLIENT_ID       — OAuth2 client ID for Drive uploads
 *   GOOGLE_OAUTH_CLIENT_SECRET   — OAuth2 client secret for Drive uploads
 *   GOOGLE_OAUTH_REFRESH_TOKEN   — Refresh token for the league Google account
 */

import { google } from 'googleapis';
import { Readable } from 'stream';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import admin from 'firebase-admin';

// ---------------------------------------------------------------------------
// Formidable — CommonJS-only package; use createRequire to load it from ESM
// ---------------------------------------------------------------------------

/**
 * formidable is a CommonJS package. Since this file is ESM (due to
 * `"type": "module"` in package.json) we cannot use a static import.
 * createRequire from the built-in 'module' package lets us require() CJS
 * packages from within ESM without a dynamic import.
 *
 * @type {import('formidable')}
 */
const require = createRequire(import.meta.url);
const { formidable } = require('formidable');

// ---------------------------------------------------------------------------
// Firebase Admin SDK initialisation
// ---------------------------------------------------------------------------

/**
 * Lazily initialise the Firebase Admin SDK using the service account JSON
 * stored in the GOOGLE_SERVICE_ACCOUNT_JSON environment variable.
 *
 * Vercel may reuse the same function instance across invocations, so we guard
 * against double-initialisation by checking `admin.apps.length`.
 *
 * @throws {Error} When GOOGLE_SERVICE_ACCOUNT_JSON is not set or invalid JSON.
 */
function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    // Already initialised in this Lambda instance — skip.
    return;
  }

  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set. ' +
        'Paste the full service-account.json contents into this env var.'
    );
  }

  // Parse the raw JSON string into an object for firebase-admin.
  const serviceAccount = JSON.parse(serviceAccountJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ---------------------------------------------------------------------------
// Google Drive client
// ---------------------------------------------------------------------------

/**
 * Creates an authenticated Google Drive v3 client using OAuth2 credentials
 * for the league Google account.
 *
 * Service accounts cannot create files in personal Google Drives because they
 * have no Drive storage quota. OAuth2 with a stored refresh token authenticates
 * as the real Google account (which has quota) instead.
 *
 * Required env vars:
 *   GOOGLE_OAUTH_CLIENT_ID      — OAuth2 client ID
 *   GOOGLE_OAUTH_CLIENT_SECRET  — OAuth2 client secret
 *   GOOGLE_OAUTH_REFRESH_TOKEN  — Offline refresh token for the league account
 *
 * @returns {import('googleapis').drive_v3.Drive} Authenticated Drive v3 client.
 * @throws {Error} When any required OAuth env var is missing.
 */
function getDriveClient() {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN } = process.env;

  if (!GOOGLE_OAUTH_CLIENT_ID || !GOOGLE_OAUTH_CLIENT_SECRET || !GOOGLE_OAUTH_REFRESH_TOKEN) {
    throw new Error(
      'Missing OAuth2 credentials. Set GOOGLE_OAUTH_CLIENT_ID, ' +
      'GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.'
    );
  }

  const auth = new google.auth.OAuth2(GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GOOGLE_OAUTH_REFRESH_TOKEN });

  return google.drive({ version: 'v3', auth });
}

// ---------------------------------------------------------------------------
// Drive helpers
// ---------------------------------------------------------------------------

/**
 * Uploads a file buffer to the specified Google Drive folder.
 *
 * @param {Buffer} buffer     File content in memory.
 * @param {string} folderId   Drive folder ID to upload into.
 * @param {string} fileName   Display name for the file in Drive.
 * @param {string} mimeType   MIME type (e.g. 'application/pdf').
 * @returns {Promise<string>} Resolves with the new Drive file ID.
 * @throws {Error}            On any Drive API or authentication error.
 */
async function uploadFileToDrive(buffer, folderId, fileName, mimeType) {
  const drive = getDriveClient();

  // Drive SDK requires a Readable stream for media.body — convert Buffer.
  const bodyStream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bodyStream,
    },
    // Only request the `id` field to minimise data transfer.
    fields: 'id',
  });

  const fileId = response.data.id;

  if (!fileId) {
    throw new Error(
      'Drive API returned a successful response but no file ID. ' +
        'Verify folder permissions and Drive quota.'
    );
  }

  return fileId;
}

/**
 * Grants public read access to a Google Drive file.
 *
 * Creates an `anyone` / `reader` permission so any user with the file URL
 * can view it without signing in. Required before embedding a PDF in the site.
 *
 * @param {string} fileId Drive file ID to make public.
 * @returns {Promise<void>}
 * @throws {Error} On any Drive API error.
 */
async function setPublic(fileId) {
  const drive = getDriveClient();

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'anyone',
      role: 'reader',
    },
    // Suppress the default notification email (not applicable for 'anyone',
    // but silences potential API warnings).
    sendNotificationEmail: false,
  });
}

// ---------------------------------------------------------------------------
// Multipart parser
// ---------------------------------------------------------------------------

/**
 * Parses the incoming multipart/form-data request using formidable.
 *
 * Vercel does not auto-parse request bodies, so we must handle this manually.
 * Formidable writes uploaded files to a temp directory on disk; we read the
 * file back into memory so we can pipe it to the Drive API.
 *
 * @param {import('http').IncomingMessage} req  Node.js IncomingMessage object.
 * @returns {Promise<{ fields: object, files: object }>}
 * @throws {Error} On parse failures (malformed multipart, missing boundaries).
 */
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      // Allow up to 20 MB — PDFs are typically small but bylaws can be lengthy.
      maxFileSize: 20 * 1024 * 1024,
      // Keep the original filename extension for MIME type inference.
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main handler (ESM default export — required by Vercel for ESM api/ files)
// ---------------------------------------------------------------------------

/**
 * Vercel serverless function handler — handles POST /api/upload-to-drive.
 *
 * Flow:
 *  1. Reject non-POST methods with 405.
 *  2. Extract the Bearer token from the Authorization header.
 *  3. Verify the token against Firebase Auth (returns 401 on failure).
 *  4. Parse the multipart form to extract folderId, fileName, and the file.
 *  5. Upload the file to Drive in the specified folder.
 *  6. Set the file's permission to public.
 *  7. Return { fileId } with 200.
 *
 * @param {import('http').IncomingMessage} req   Vercel request object.
 * @param {import('http').ServerResponse}  res   Vercel response object.
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  // ------------------------------------------------------------------
  // 1. Method guard — only accept POST requests.
  // ------------------------------------------------------------------
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  // ------------------------------------------------------------------
  // 2. Extract Bearer token from the Authorization header.
  // ------------------------------------------------------------------
  const authHeader = req.headers['authorization'] || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    res.status(401).json({
      error:
        'Missing or malformed Authorization header. ' +
        'Expected: Authorization: Bearer <Firebase ID Token>',
    });
    return;
  }

  const idToken = match[1];

  // ------------------------------------------------------------------
  // 3. Verify the Firebase ID token.
  // ------------------------------------------------------------------
  try {
    initFirebaseAdmin();
    // verifyIdToken throws if the token is expired, revoked, or invalid.
    await admin.auth().verifyIdToken(idToken);
  } catch (authError) {
    console.error('[upload-to-drive] Token verification failed:', authError.message);
    res.status(401).json({
      error: 'Unauthorized. The provided Firebase ID token is invalid or expired.',
    });
    return;
  }

  // ------------------------------------------------------------------
  // 4. Parse the multipart/form-data body.
  // ------------------------------------------------------------------
  let fields, files;
  try {
    ({ fields, files } = await parseMultipartForm(req));
  } catch (parseError) {
    console.error('[upload-to-drive] Form parse error:', parseError.message);
    res.status(400).json({ error: `Failed to parse form data: ${parseError.message}` });
    return;
  }

  // Formidable v3 stores field values as arrays; normalise to strings.
  const folderId = Array.isArray(fields.folderId)
    ? fields.folderId[0]
    : fields.folderId;
  const fileName = Array.isArray(fields.fileName)
    ? fields.fileName[0]
    : fields.fileName;

  // Formidable v3 stores file entries as arrays as well.
  const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;

  // Validate required fields.
  if (!folderId || !fileName || !uploadedFile) {
    res.status(400).json({
      error:
        'Missing required form fields. ' +
        'Expected: folderId (string), fileName (string), file (binary).',
    });
    return;
  }

  // ------------------------------------------------------------------
  // 5. Read the file from disk into a Buffer.
  //    Formidable writes uploads to a temp path on disk. We read it back
  //    into memory to pipe it to the Drive API as a Readable stream.
  // ------------------------------------------------------------------
  let fileBuffer;
  try {
    fileBuffer = readFileSync(uploadedFile.filepath);
  } catch (readError) {
    console.error('[upload-to-drive] Failed to read temp file:', readError.message);
    res.status(500).json({ error: 'Server error: could not read uploaded file.' });
    return;
  }

  // Determine MIME type — prefer what formidable detected, fall back to PDF.
  const mimeType = uploadedFile.mimetype || 'application/pdf';

  // ------------------------------------------------------------------
  // 6. Upload to Google Drive.
  // ------------------------------------------------------------------
  let fileId;
  try {
    fileId = await uploadFileToDrive(fileBuffer, folderId, fileName, mimeType);
  } catch (uploadError) {
    console.error('[upload-to-drive] Drive upload error:', uploadError.message);
    res.status(500).json({
      error: `Drive upload failed: ${uploadError.message}`,
    });
    return;
  }

  // ------------------------------------------------------------------
  // 7. Make the file publicly readable.
  // ------------------------------------------------------------------
  try {
    await setPublic(fileId);
  } catch (permError) {
    // The file was uploaded but we couldn't set it public.
    // Log the error but still return the fileId — the admin can manually
    // adjust permissions in the Drive UI if needed.
    console.error(
      '[upload-to-drive] Failed to set file public (fileId=%s): %s',
      fileId,
      permError.message
    );
    // Return a partial-success response so the caller knows what happened.
    res.status(207).json({
      fileId,
      warning:
        'File uploaded successfully but could not be set to public. ' +
        'Manually share the file in Google Drive.',
    });
    return;
  }

  // ------------------------------------------------------------------
  // 8. Success — return the Drive file ID to the caller.
  // ------------------------------------------------------------------
  res.status(200).json({ fileId });
}
