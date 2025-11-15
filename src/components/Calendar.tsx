import eventsData from '../data/events.json'
import type { Event } from '../types'
import './Calendar.css'

function Calendar() {
  const events = eventsData as Event[]

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <div className="calendar-container">
      <h2 className="section-title">Calendar</h2>
      <div className="calendar-events">
        {events.map((event) => (
          <div key={event.id} className={`calendar-event ${event.type}`}>
            <div className="event-date">
              <div className="date-day">{formatDate(event.date).split(',')[0]}</div>
              <div className="date-full">{formatDate(event.date).substring(5)}</div>
            </div>
            <div className="event-details">
              <h3>{event.title}</h3>
              <p className="event-time">{formatTime(event.date)}</p>
              <p className="event-location">{event.location}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Calendar
