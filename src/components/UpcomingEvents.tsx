/**
 * @file UpcomingEvents.tsx
 * @module components/UpcomingEvents
 *
 * Displays the next 3 upcoming league events fetched live from Firestore.
 * Events that have already started (or ended, for multi-day events) are
 * filtered out. Multi-day events show an end-date range.
 *
 * The `useEvents` hook returns events sorted by date ascending, so the first
 * items in the list are always the soonest upcoming events.
 */

import { useEvents } from '../hooks'
import './UpcomingEvents.css'

/**
 * Formats an ISO date string into a long-form human-readable date.
 *
 * @param dateString - ISO date string (e.g. "2025-09-15")
 * @returns Formatted string like "September 15, 2025"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Formats an ISO date string into a human-readable time.
 *
 * @param dateString - ISO date or datetime string
 * @returns Formatted time like "6:30 PM"
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Builds a display-ready date label. For multi-day events, a range is shown.
 *
 * @param startDate - ISO start date string
 * @param endDate   - Optional ISO end date string
 * @returns A single date or a range like "September 5 – September 7, 2025"
 */
function buildDateLabel(startDate: string, endDate: string | null): string {
  if (!endDate) return formatDate(startDate)
  // Show abbreviated month for start to keep range compact
  const start = new Date(startDate + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  })
  return `${start} – ${formatDate(endDate)}`
}

/**
 * Returns a hex background color for the event type badge.
 *
 * @param type - Event type: "regular" | "tournament" | "social" | "banquet"
 * @returns CSS hex color string
 */
function getEventTypeColor(type: string): string {
  switch (type) {
    case 'tournament': return '#d4af37'
    case 'social':     return '#ff6b9d'
    case 'banquet':    return '#9b59b6'
    default:           return '#4a9eff'
  }
}

/**
 * UpcomingEvents component — shows the next 3 events from today onward.
 *
 * Fetches all events from Firestore, filters to future events only (comparing
 * against today's date at midnight), then slices to the first 3. A loading
 * placeholder is shown while data is in flight.
 */
function UpcomingEvents() {
  const { data: events, loading } = useEvents()

  // Compare against today's date at midnight so events on today's date are included
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)

  // For multi-day events, keep the event until the end date has passed
  const upcomingEvents = events
    .filter((event) => {
      const relevantDate = event.endDate ?? event.date
      return new Date(relevantDate + 'T23:59:59') >= todayMidnight
    })
    .slice(0, 3)

  return (
    <div className="upcoming-events-container">
      <h2 className="section-title">Upcoming Events</h2>

      {/* Loading state */}
      {loading && (
        <div className="events-list">
          <div className="event-card" style={{ opacity: 0.5 }}>
            <p style={{ margin: 0, color: '#888' }}>Loading events…</p>
          </div>
        </div>
      )}

      {/* Loaded state */}
      {!loading && (
        <div className="events-list">
          {upcomingEvents.length === 0 && (
            <p className="no-data-message">No upcoming events.</p>
          )}
          {upcomingEvents.map((event) => (
            <div key={event.id} className="event-card">
              <div
                className="event-type-badge"
                style={{ backgroundColor: getEventTypeColor(event.type) }}
              >
                {event.type}
              </div>
              <h3 className="event-title">{event.title}</h3>
              <p className="event-description">{event.description}</p>
              <div className="event-info">
                <div className="info-item">
                  <span className="info-label">Date:</span>
                  <span className="info-value">{buildDateLabel(event.date, event.endDate)}</span>
                </div>
                {/* Only show time row for non-all-day events */}
                {!event.allDay && (
                  <div className="info-item">
                    <span className="info-label">Time:</span>
                    <span className="info-value">{formatTime(event.date)}</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="info-label">Location:</span>
                  <span className="info-value">{event.location}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default UpcomingEvents
