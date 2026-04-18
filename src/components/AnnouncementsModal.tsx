/**
 * @file AnnouncementsModal.tsx
 * @module components/AnnouncementsModal
 *
 * Full-screen modal overlay that lists all active announcements fetched from
 * Firestore. The `useAnnouncements` hook handles expiry filtering and sort order
 * (pinned first, then by priority, then by date descending), so no additional
 * sorting logic is needed here.
 *
 * Keyboard shortcut: Escape closes the modal.
 * Click outside the modal content also closes it.
 */

import { useEffect } from 'react'
import { useAnnouncements } from '../hooks'
import './AnnouncementsModal.css'

/** Props accepted by the AnnouncementsModal component */
interface AnnouncementsModalProps {
  /** Controls whether the modal is visible */
  isOpen: boolean
  /** Callback invoked when the user requests the modal to close */
  onClose: () => void
}

/**
 * Formats an ISO date string into a human-readable short date.
 *
 * @param dateString - ISO date string (e.g. "2025-09-15")
 * @returns Formatted string like "Sep 15, 2025"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * AnnouncementsModal — displays all active announcements in a scrollable modal.
 *
 * Fetches announcement data live from Firestore. The modal locks body scroll
 * while open and restores it on unmount. An Escape key listener is also
 * registered while the modal is open.
 *
 * @param isOpen  - Whether the modal should be rendered
 * @param onClose - Handler to call when the modal should be dismissed
 */
function AnnouncementsModal({ isOpen, onClose }: AnnouncementsModalProps) {
  // Fetch all active (non-expired) announcements from Firestore
  const { data: announcements, loading } = useAnnouncements()

  // Lock body scroll while the modal is open to prevent background scrolling
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Announcements</h2>
          <button
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close announcements"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Loading state */}
          {loading && (
            <p style={{ color: '#888', textAlign: 'center' }}>Loading announcements…</p>
          )}

          {/* Empty state */}
          {!loading && announcements.length === 0 && (
            <p style={{ color: '#888', textAlign: 'center' }}>No announcements at this time.</p>
          )}

          {/* Announcement list — hook already returns sorted, non-expired items */}
          {!loading && announcements.map((announcement) => (
            <div key={announcement.id} className="announcement-item">
              <div className="announcement-header">
                <h3 className="announcement-title">{announcement.title}</h3>
                <span className="announcement-date">{formatDate(announcement.date)}</span>
              </div>
              <p className="announcement-message">{announcement.message}</p>
              <span className={`announcement-type type-${announcement.type}`}>
                {announcement.type}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AnnouncementsModal
