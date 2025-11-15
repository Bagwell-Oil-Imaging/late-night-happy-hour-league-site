import announcementsData from '../data/announcements.json'
import type { Announcement } from '../types'
import './Announcements.css'

function Announcements() {
  const announcements = announcementsData as Announcement[]

  // Sort by date (most recent first) and limit to 5
  const recentAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return '⚠️'
      case 'normal':
        return '📢'
      case 'low':
        return 'ℹ️'
      default:
        return '📢'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'reminder':
        return '#4a9eff'
      case 'event':
        return '#d4af37'
      case 'info':
        return '#6b9b7f'
      default:
        return '#4a9eff'
    }
  }

  return (
    <div className="announcements-container" id="announcements">
      <h2 className="section-title">Announcements</h2>
      <div className="announcements-list">
        {recentAnnouncements.map((announcement) => (
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
    </div>
  )
}

export default Announcements
