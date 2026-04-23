/**
 * @fileoverview Shared Google Drive API client for Node.js pipeline scripts.
 *
 * Provides three reusable functions for interacting with Google Drive:
 *   - uploadFile  — uploads a Buffer or local file path to a Drive folder
 *   - setPublic   — grants public read access to a Drive file
 *   - driveFileUrl — resolves the shareable view URL for a Drive file ID
 *
 * Authentication uses the service account key at `../service-account.json`
 * (relative to this script directory). The account must have write access to
 * the target Drive folder.
 *
 * This module is CommonJS (.cjs) because the project uses `"type": "module"`
 * in package.json. Import it with `require('./scripts/drive-client.cjs')`.
 *
 * Usage:
 *   const { uploadFile, setPublic, driveFileUrl } = require('./scripts/drive-client.cjs');
 *
 *   const fileId = await uploadFile(buffer, folderId, 'bylaws.pdf', 'application/pdf');
 *   await setPublic(fileId);
 *   console.log(driveFileUrl(fileId)); // https://drive.google.com/file/d/<id>/view
 */

'use strict';

const { google } = require('googleapis');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Auth setup
// ---------------------------------------------------------------------------

/**
 * Absolute path to the service account JSON credential file.
 * This file is gitignored and must exist locally or on the server.
 *
 * @type {string}
 */
const KEY_FILE = path.resolve(__dirname, '..', 'service-account.json');

/**
 * Creates an authenticated Google Drive v3 client using the service account.
 *
 * The auth scope is `drive` (full access) so the service account can create
 * files and manage permissions.
 *
 * @returns {import('googleapis').drive_v3.Drive} Authenticated Drive client
 */
function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    // Full Drive scope — needed for both upload and permission management.
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Uploads a file to a Google Drive folder.
 *
 * Accepts either a raw Buffer (e.g., a PDF downloaded in memory by a pipeline
 * script) or a local file-system path string (for uploading existing files).
 * When a path is given it is read synchronously before upload so the caller
 * does not need to handle stream plumbing.
 *
 * The file is created with the specified MIME type and placed inside
 * `folderId`. Only the new file's Drive ID is returned; callers that also
 * need the file to be publicly readable should call `setPublic` afterwards.
 *
 * @param {Buffer|string} bufferOrPath - File content as a Buffer, or an
 *   absolute/relative path to a local file.
 * @param {string} folderId - Google Drive folder ID where the file will be
 *   created. The service account must have write access to this folder.
 * @param {string} fileName - Display name for the file in Google Drive.
 * @param {string} mimeType - MIME type of the file
 *   (e.g., `'application/pdf'`).
 * @returns {Promise<string>} Resolves with the new Drive file's ID string.
 * @throws {Error} Propagates any API or I/O error to the caller.
 *
 * @example
 * const fileId = await uploadFile(
 *   '/path/to/bylaws.pdf',
 *   '1BcD_exampleFolderId',
 *   'league-bylaws-2024.pdf',
 *   'application/pdf'
 * );
 */
async function uploadFile(bufferOrPath, folderId, fileName, mimeType) {
  const drive = getDriveClient();

  // Resolve the content to a Buffer regardless of what the caller passed in.
  let fileBuffer;
  if (Buffer.isBuffer(bufferOrPath)) {
    // Caller already has file bytes in memory — use as-is.
    fileBuffer = bufferOrPath;
  } else if (typeof bufferOrPath === 'string') {
    // Caller passed a file path — read it synchronously.
    // Sync read is intentional here: these scripts run outside the event loop
    // hot path and simplicity outweighs the marginal async benefit.
    fileBuffer = fs.readFileSync(bufferOrPath);
  } else {
    throw new TypeError(
      'uploadFile: first argument must be a Buffer or a file path string'
    );
  }

  // Convert the Buffer to a Readable stream, which the Drive SDK requires
  // for the `media.body` field.
  const bodyStream = Readable.from(fileBuffer);

  const response = await drive.files.create({
    requestBody: {
      // Human-readable name shown in Drive UI.
      name: fileName,
      // Place the file inside the specified folder.
      parents: [folderId],
    },
    media: {
      mimeType,
      body: bodyStream,
    },
    // Only request the `id` field — avoids unnecessary data transfer.
    fields: 'id',
  });

  // response.data.id is guaranteed non-null when `fields: 'id'` is set and
  // the upload succeeded.
  const fileId = response.data.id;

  if (!fileId) {
    throw new Error(
      'uploadFile: Drive API returned a successful response but no file ID. ' +
        'Check the Drive quota and folder permissions.'
    );
  }

  return fileId;
}

/**
 * Grants public read access to a Google Drive file.
 *
 * Creates an `anyone` / `reader` permission on the file so that any user with
 * the file URL can view it without signing in. This is required before a PDF
 * can be embedded or linked in the league site.
 *
 * Call this immediately after `uploadFile` when the file should be public.
 *
 * @param {string} fileId - Drive file ID returned by `uploadFile`.
 * @returns {Promise<void>} Resolves when the permission has been created.
 * @throws {Error} Propagates any API error to the caller.
 *
 * @example
 * await setPublic('1BcD_exampleFileId');
 */
async function setPublic(fileId) {
  const drive = getDriveClient();

  await drive.permissions.create({
    fileId,
    requestBody: {
      // 'anyone' means any user on the internet — no authentication required.
      type: 'anyone',
      // 'reader' grants view-only access; cannot download without a link.
      role: 'reader',
    },
    // Suppress the default email notification sent to permission recipients
    // (not applicable for 'anyone' type, but silences any API warnings).
    sendNotificationEmail: false,
  });
}

/**
 * Returns the public shareable view URL for a Google Drive file.
 *
 * This URL opens the file in Drive's built-in viewer. It works for PDFs,
 * images, and most document types without requiring the viewer to sign in,
 * provided `setPublic` has been called on the file.
 *
 * Note: This function is purely a URL builder — it performs no API calls and
 * does not verify that the file exists or is actually public.
 *
 * @param {string} fileId - Google Drive file ID.
 * @returns {string} Full HTTPS view URL for the file.
 *
 * @example
 * driveFileUrl('1BcD_exampleFileId');
 * // => 'https://drive.google.com/file/d/1BcD_exampleFileId/view'
 */
function driveFileUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  uploadFile,
  setPublic,
  driveFileUrl,
};
