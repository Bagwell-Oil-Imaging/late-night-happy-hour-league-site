/**
 * @file StandingsPdfModal.tsx
 * @component StandingsPdfModal
 *
 * Fullscreen overlay modal that embeds the weekly standings PDF from Google
 * Drive inside an iframe. Provides a download link and an "open in Drive"
 * link in the header.
 *
 * The Drive file ID is resolved via `getStandingsPdfId(weekNum)` from the
 * statically bundled `drive-uploads.json` cache. If no PDF has been uploaded
 * for the requested week the modal renders a friendly "not available" message.
 *
 * Props:
 *  weekNum   – season week number to display (null = modal closed)
 *  onClose   – callback invoked on dismiss (close button, backdrop click, Escape)
 */

import { useEffect } from 'react'
import { getStandingsPdfId, getDriveEmbedUrl, getDriveDownloadUrl } from '../utils/weeklyStandingsPdf'
import './StandingsPdfModal.css'

interface StandingsPdfModalProps {
  /** Week number whose standings PDF to display, or null when the modal is closed. */
  weekNum: number | null
  onClose: () => void
}

/**
 * StandingsPdfModal component.
 *
 * @param weekNum - Season week number (0-indexed, matches Firestore `week` field).
 *   Pass null to keep the modal closed.
 * @param onClose - Dismiss callback.
 */
function StandingsPdfModal({ weekNum, onClose }: StandingsPdfModalProps) {
  const isOpen = weekNum !== null

  /* Lock body scroll while the modal is visible */
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  /* Dismiss on Escape key */
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen || weekNum === null) return null

  const fileId = getStandingsPdfId(weekNum)
  const embedUrl = fileId ? getDriveEmbedUrl(fileId) : null
  const downloadUrl = fileId ? getDriveDownloadUrl(fileId) : null
  const weekLabel = weekNum === 0 ? 'Pre-Season' : `Week ${weekNum}`

  return (
    <div
      className="modal-overlay pdf-modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="pdf-modal">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="modal-header pdf-modal-header">
          <div className="pdf-header-info">
            <h2>{weekLabel} — Standings Report</h2>
            {fileId && (
              <div className="pdf-header-actions">
                <a
                  href={downloadUrl!}
                  download
                  className="pdf-action-link pdf-action-link--download"
                  title="Download PDF"
                  aria-label="Download standings PDF"
                >
                  {/* Download icon */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 12l-4.5-4.5 1.06-1.06L7 8.88V1h2v7.88l2.44-2.44 1.06 1.06L8 12z"/>
                    <path d="M2 13h12v2H2z"/>
                  </svg>
                  Download
                </a>
                <a
                  href={`https://drive.google.com/file/d/${fileId}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pdf-action-link pdf-action-link--drive"
                  title="Open in Google Drive"
                  aria-label="Open in Google Drive"
                >
                  {/* External link icon */}
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M6 3v2H3v8h8v-3h2v5H1V3h5zm9-3v7l-2.5-2.5-5 5L6 8l5-5L8.5 0H15z"/>
                  </svg>
                  Open in Drive
                </a>
              </div>
            )}
          </div>
          <button
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close standings PDF"
          >
            ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="pdf-modal-body">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="pdf-iframe"
              title={`${weekLabel} Standings PDF`}
              allow="autoplay"
            />
          ) : (
            /* PDF not yet available for this week */
            <div className="pdf-unavailable">
              <span className="pdf-unavailable-icon">📄</span>
              <p className="pdf-unavailable-title">PDF Not Available</p>
              <p className="pdf-unavailable-sub">
                The standings report for {weekLabel} hasn't been uploaded yet.
                Check back after the next automated sync runs on Saturday.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StandingsPdfModal
