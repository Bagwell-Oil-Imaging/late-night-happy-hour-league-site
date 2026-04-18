/**
 * @file Announcements.tsx
 * @module components/Announcements
 *
 * Displays a list of non-expired announcements fetched from Firestore.
 * The `useAnnouncements` hook handles expiry filtering and pinned-first sorting,
 * so this component only needs to render the sorted list.
 *
 * Shows a loading skeleton while data is being fetched and renders up to 5
 * of the most relevant announcements (hook already sorts by pinned → priority → date).
 */

import { useAnnouncements } from '../hooks'
import './Announcements.css'

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
 * Returns an emoji icon representing announcement priority level.
 *
 * @param priority - Priority string: "high" | "normal" | "low"
 * @returns Emoji character appropriate for the priority
 */
function getPriorityIcon(priority: string): string {
  switch (priority) {
    case 'high':   return '⚠️'
    case 'normal': return '📢'
    case 'low':    return 'ℹ️'
    default:       return '📢'
  }
}

/**
 * Returns a hex color string for the announcement type badge background.
 *
 * @param type - Announcement type: "reminder" | "event" | "info"
 * @returns CSS hex color string
 */
function getTypeColor(type: string): string {
  switch (type) {
    case 'reminder': return '#4a9eff'
    case 'event':    return '#d4af37'
    case 'info':     return '#6b9b7f'
    default:         return '#4a9eff'
  }
}

/**
 * Announcements component — renders up to 5 active announcements.
 *
 * Data is fetched live from Firestore via `useAnnouncements`. While loading,
 * a skeleton placeholder is shown. Expired announcements are never shown
 * because the hook filters them out before returning data.
 */
function Announcements() {
  const { data: announcements, loading } = useAnnouncements()

  // Limit display to the top 5 — hook already sorted pinned → priority → date
  const displayAnnouncements = announcements.slice(0, 5)

  return (
    <div className="announcements-container" id="announcements">
      <h2 className="section-title">Announcements</h2>

      {/* Loading state — show a single skeleton card */}
      {loading && (
        <div className="announcements-list">
          <div className="announcement-card priority-normal" style={{ opacity: 0.5 }}>
            <p style={{ margin: 0, color: '#888' }}>Loading announcements…</p>
          </div>
        </div>
      )}

      {/* Loaded state — render announcement cards */}
      {!loading && (
        <div className="announcements-list">
          {displayAnnouncements.length === 0 && (
            <p className="no-data-message">No announcements at this time.</p>
          )}
          {displayAnnouncements.map((announcement) => (
            <div
              key={announcement.id}
              className={`announcement-card priority-${announcement.priority}`}
            >
              <div className="announcement-header">
                <div className="announcement-title-row">
                  <span className="announcement-icon">{getPriorityIcon(announcement.priority)}</span>
                  <h3 className="announcement-title">{announcement.title}</h3>
                </div>
                <div className="announcement-meta">
                  <span
                    className="announcement-type"
                    style={{ backgroundColor: getTypeColor(announcement.type) }}
                  >
                    {announcement.type}
                  </span>
                  <span className="announcement-date">{formatDate(announcement.date)}</span>
                </div>
              </div>
              <p className="announcement-message">{announcement.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Announcements
