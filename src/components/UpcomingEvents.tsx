import eventsData from '../data/events.json'
import type { Event } from '../types'
import './UpcomingEvents.css'

function UpcomingEvents() {
  const events = eventsData as Event[]

  // Get next 3 upcoming events
  const now = new Date()
  const upcomingEvents = events
    .filter(event => new Date(event.date) > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 3)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const getEventTypeColor = (type: string) => {
    switch(type) {
      case 'tournament': return '#d4af37'
      case 'social': return '#ff6b9d'
      default: return '#4a9eff'
    }
  }

  return (
    <div className="upcoming-events-container">
      <h2 className="section-title">Upcoming Events</h2>
      <div className="events-list">
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
                <span className="info-value">{formatDate(event.date)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Time:</span>
                <span className="info-value">{formatTime(event.date)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Location:</span>
                <span className="info-value">{event.location}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default UpcomingEvents
