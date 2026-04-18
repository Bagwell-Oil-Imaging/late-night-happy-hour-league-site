import { useEffect } from 'react'
import './BylawsModal.css'

interface BylawsModalProps {
  isOpen: boolean
  onClose: () => void
}

function BylawsModal({ isOpen, onClose }: BylawsModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset'
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const pdfUrl = '/Bowling League Rules 2025.pdf'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bylaws-modal-content" onClick={e => e.stopPropagation()}>

        <div className="modal-header">
          <h2>League Bylaws</h2>
          <div className="bylaws-header-actions">
            <a
              href={pdfUrl}
              download="Bowling League Rules 2025.pdf"
              className="bylaws-download-btn"
              title="Download PDF"
            >
              Download
            </a>
            <button className="modal-close-button" onClick={onClose} aria-label="Close bylaws">
              ✕
            </button>
          </div>
        </div>

        <div className="bylaws-viewer">
          <iframe
            src={pdfUrl}
            title="Bowling League Bylaws"
            className="bylaws-iframe"
          />
          <div className="bylaws-fallback">
            <p>Your browser cannot display PDFs inline.</p>
            <a href={pdfUrl} download="Bowling League Rules 2025.pdf" className="bylaws-download-btn">
              Download PDF
            </a>
          </div>
        </div>

      </div>
    </div>
  )
}

export default BylawsModal
