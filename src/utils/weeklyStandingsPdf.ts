/**
 * @file weeklyStandingsPdf.ts
 * @module utils/weeklyStandingsPdf
 *
 * Utility helpers for surfacing weekly standings PDFs uploaded to Google Drive.
 *
 * The `drive-uploads.json` file (located at the project root in
 * `weekly-standings-pdfs/drive-uploads.json`) maps week numbers (as string keys)
 * to Google Drive file IDs. It is committed to the repo by the GitHub Actions
 * workflow each Saturday after uploading that week's PDF, so the bundled copy
 * stays current with each Vercel deployment.
 *
 * Usage:
 *   const fileId = getStandingsPdfId(weekNum)
 *   if (fileId) {
 *     window.open(getDriveEmbedUrl(fileId))
 *   }
 */

// Vite bundles JSON imports natively — the path resolves from the project root.
import driveUploads from '../../weekly-standings-pdfs/drive-uploads.json'

/** Map of week number (string key) → Google Drive file ID. */
const uploads: Record<string, string> = driveUploads as Record<string, string>

/**
 * Returns the Google Drive file ID for a given week's standings PDF, or null
 * if no PDF has been uploaded for that week yet.
 *
 * @param weekNum - Season week number (0-indexed, matching the `week` field on
 *   Firestore MatchupDetail documents)
 * @returns Drive file ID string, or null when unavailable
 */
export function getStandingsPdfId(weekNum: number): string | null {
  const id = uploads[String(weekNum)]
  return id ?? null
}

/**
 * Builds a Google Drive in-browser preview embed URL for an iframe.
 *
 * @param fileId - Google Drive file ID
 * @returns Preview URL suitable for use as an iframe `src`
 */
export function getDriveEmbedUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`
}

/**
 * Builds a direct download URL for a Google Drive file.
 *
 * @param fileId - Google Drive file ID
 * @returns Download URL that forces the browser to download the PDF
 */
export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}
