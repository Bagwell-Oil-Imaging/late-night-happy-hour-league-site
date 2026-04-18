/**
 * @file BylawsModal.tsx
 * @module components/BylawsModal
 *
 * Modal that displays the active league bylaws document fetched live from Firestore.
 * The document is retrieved via `useActiveDocument('bylaws', '2025-2026')` and supports
 * two render modes determined by `doc.source.type`:
 *
 *  - `'pdf'`  — renders an `<iframe>` pointing at `doc.source.fileUrl` with a
 *               download fallback link
 *  - `'text'` — renders HTML content from `doc.source.content` via
 *               `dangerouslySetInnerHTML` (content is admin-controlled, not user input)
 *
 * Renders a loading indicator while the Firestore query is in flight and a
 * "no document available" message when no active bylaws exist for the season.
 *
 * Keyboard shortcut: Escape closes the modal.
 * Click outside the modal content also closes it.
 */

import { useEffect } from 'react'
import { useActiveDocument } from '../hooks'
import './BylawsModal.css'

/** Props accepted by the BylawsModal component */
interface BylawsModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean
  /** Callback invoked when the user requests the modal to close */
  onClose: () => void
}

/**
 * BylawsModal — displays the active bylaws document from Firestore.
 *
 * The modal locks body scroll while open and restores it on unmount.
 * Content rendering adapts to the document's source type (PDF or HTML text).
 *
 * @param isOpen  - Whether the modal should be rendered
 * @param onClose - Handler to call when the modal should be dismissed
 */
function BylawsModal({ isOpen, onClose }: BylawsModalProps) {
  // Fetch the active bylaws document for the current season
  const { data: doc, loading } = useActiveDocument('bylaws', '2025-2026')

  // Lock body scroll while modal is open to prevent background scrolling
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  // Allow Escape key to dismiss the modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bylaws-modal-content" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <h2>{doc?.title ?? 'League Bylaws'}</h2>
          <div className="bylaws-header-actions">
            {/* Show a download link only for PDF documents */}
            {doc?.source.type === 'pdf' && doc.source.fileUrl && (
              <a
                href={doc.source.fileUrl}
                download
                className="bylaws-download-btn"
                title="Download PDF"
              >
                Download
              </a>
            )}
            <button className="modal-close-button" onClick={onClose} aria-label="Close bylaws">
              ✕
            </button>
          </div>
        </div>

        <div className="bylaws-viewer">
          {/* Loading state — Firestore query in flight */}
          {loading && (
            <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>
              Loading bylaws document…
            </p>
          )}

          {/* No document available — query resolved but no active record found */}
          {!loading && doc === null && (
            <p style={{ padding: '2rem', color: '#888', textAlign: 'center' }}>
              No bylaws document available.
            </p>
          )}

          {/* PDF source — render in an iframe with a download fallback */}
          {!loading && doc?.source.type === 'pdf' && doc.source.fileUrl && (
            <>
              <iframe
                src={doc.source.fileUrl}
                title={doc.title}
                className="bylaws-iframe"
              />
              <div className="bylaws-fallback">
                <p>Your browser cannot display PDFs inline.</p>
                <a
                  href={doc.source.fileUrl}
                  download
                  className="bylaws-download-btn"
                >
                  Download PDF
                </a>
              </div>
            </>
          )}

          {/*
           * Text/HTML source — admin-controlled content rendered as HTML.
           * Content originates from authenticated admin users only, so
           * dangerouslySetInnerHTML is acceptable here.
           */}
          {!loading && doc?.source.type === 'text' && (
            <div
              className="bylaws-text-content"
              dangerouslySetInnerHTML={{ __html: doc.source.content ?? '' }}
            />
          )}
        </div>

      </div>
    </div>
  )
}

export default BylawsModal
