/**
 * @file drive.ts
 * @module utils/drive
 *
 * Helper functions that convert a Google Drive file ID into a public-facing
 * URL suitable for rendering or downloading PDF documents.
 *
 * Drive file IDs are stored in Firestore as `DocumentSource.driveFileId`.
 * Call these helpers wherever a concrete URL is required (e.g., in
 * `<iframe src>`, `<a href>`, or `window.open()`).
 *
 * Both functions are pure — they have no side effects and always return the
 * same URL for the same input, making them trivially testable.
 */

/**
 * Returns a Google Drive viewer URL for the given file ID.
 *
 * This URL opens the file in Drive's built-in PDF viewer when used as an
 * `<iframe>` source or navigated to in a browser tab. It does not force a
 * download.
 *
 * @param fileId - The Google Drive file ID (the alphanumeric token found in
 *   `https://drive.google.com/file/d/<fileId>/view`).
 * @returns A fully-qualified viewer URL, e.g.
 *   `"https://drive.google.com/file/d/abc123/view"`.
 *
 * @example
 * // Render a PDF in an iframe
 * <iframe src={driveFileUrl(doc.source.driveFileId!)} />
 */
export const driveFileUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/view`

/**
 * Returns a Google Drive direct-download URL for the given file ID.
 *
 * This URL triggers a file download (bypasses the Drive viewer) and is
 * suitable for use as an `<a download href>` or passed to `window.open()`.
 *
 * @param fileId - The Google Drive file ID (the alphanumeric token found in
 *   `https://drive.google.com/file/d/<fileId>/view`).
 * @returns A fully-qualified download URL, e.g.
 *   `"https://drive.google.com/uc?export=download&id=abc123"`.
 *
 * @example
 * // Render a download button
 * <a href={driveDownloadUrl(doc.source.driveFileId!)} download>
 *   Download PDF
 * </a>
 */
export const driveDownloadUrl = (fileId: string): string =>
  `https://drive.google.com/uc?export=download&id=${fileId}`

/**
 * Returns a Google Drive embed URL for use as an `<iframe src>`.
 *
 * The `/preview` endpoint is specifically designed for iframe embedding and
 * works for publicly-shared files without requiring the viewer to be signed
 * in to Google. The `/view` URL (used for direct links) shows an access
 * prompt when embedded due to third-party cookie restrictions in modern
 * browsers.
 *
 * @param fileId - The Google Drive file ID.
 * @returns A fully-qualified embed URL, e.g.
 *   `"https://drive.google.com/file/d/abc123/preview"`.
 */
export const driveEmbedUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/preview`
