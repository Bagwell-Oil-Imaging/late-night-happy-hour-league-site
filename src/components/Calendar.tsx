/**
 * @file Calendar.tsx
 * @module components/Calendar
 *
 * Displays all league events in a chronological list fetched live from Firestore.
 * Supports multi-day events via the `endDate` field and all-day events via `allDay`.
 *
 * Behavior:
 * - Shows a loading placeholder while Firestore data is in flight
 * - Renders a date range (e.g. "Sep 5 – Sep 7") for multi-day events
 * - Omits the time line for all-day events
 * - The `useEvents` hook returns events sorted by date ascending
 */

import { useEvents } from '../hooks'
import './Calendar.css'

/**
 * Formats an ISO date string into a short weekday + date label.
 *
 * @param dateString - ISO date string (e.g. "2025-09-05")
 * @returns Formatted string like "Fri, Sep 5"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T12:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats an ISO date string (which may include a time component) into a
 * human-readable time string.
 *
 * @param dateString - ISO date string (e.g. "2025-09-05T18:30:00")
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
 * Builds a human-readable date label that handles single-day and multi-day events.
 *
 * @param startDate - ISO start date string
 * @param endDate   - Optional ISO end date string (present for multi-day events)
 * @returns A date string or range string, e.g. "Fri, Sep 5" or "Fri, Sep 5 – Sun, Sep 7"
 */
function buildDateLabel(startDate: string, endDate: string | null): string {
  const start = formatDate(startDate)
  if (!endDate) return start
  return `${start} – ${formatDate(endDate)}`
}

/**
 * Calendar component — chronological list of all league events.
 *
 * Fetches event data live from Firestore. Shows a loading indicator while data
 * is in flight. Each event card displays the event type, date (or date range),
 * time (unless all-day), and location.
 */
function Calendar() {
  const { data: events, loading } = useEvents()

  return (
    <div className="calendar-container">
      <h2 className="section-title">Calendar</h2>

      {/* Loading state */}
      {loading && (
        <div className="calendar-events">
          <div className="calendar-event regular" style={{ opacity: 0.5 }}>
            <p style={{ margin: 0, color: '#888' }}>Loading events…</p>
          </div>
        </div>
      )}

      {/* Loaded state */}
      {!loading && (
        <div className="calendar-events">
          {events.length === 0 && (
            <p className="no-data-message">No events scheduled.</p>
          )}
          {events.map((event) => (
            <div key={event.id} className={`calendar-event ${event.type}`}>
              <div className="event-date">
                {/* Show abbreviated weekday above the full date */}
                <div className="date-day">
                  {formatDate(event.date).split(',')[0]}
                </div>
                <div className="date-full">
                  {buildDateLabel(event.date, event.endDate)}
                </div>
              </div>
              <div className="event-details">
                <h3>{event.title}</h3>
                {/* Omit time line for all-day events */}
                {!event.allDay && (
                  <p className="event-time">{formatTime(event.date)}</p>
                )}
                <p className="event-location">{event.location}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Calendar
