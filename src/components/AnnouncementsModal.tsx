import { useEffect } from 'react'
import type { Announcement } from '../types'
import './AnnouncementsModal.css'

interface AnnouncementsModalProps {
  announcements: Announcement[]
  isOpen: boolean
  onClose: () => void
}

function AnnouncementsModal({ announcements, isOpen, onClose }: AnnouncementsModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const sortedAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

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
          {sortedAnnouncements.map((announcement) => (
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
