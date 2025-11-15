import announcementsData from '../data/announcements.json'
import type { Announcement } from '../types'
import './PinnedAnnouncement.css'

function PinnedAnnouncement() {
  const announcements = announcementsData as Announcement[]

  // Get the most recent high-priority announcement, or the most recent announcement
  const pinnedAnnouncement = announcements
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .find(a => a.priority === 'high') || announcements[0]

  if (!pinnedAnnouncement) return null

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

  return (
    <div className={`pinned-announcement priority-${pinnedAnnouncement.priority}`}>
      <div className="pinned-announcement-content">
        <span className="pinned-icon">{getPriorityIcon(pinnedAnnouncement.priority)}</span>
        <div className="pinned-text">
          <strong className="pinned-title">{pinnedAnnouncement.title}:</strong>
          <span className="pinned-message">{pinnedAnnouncement.message}</span>
        </div>
      </div>
    </div>
  )
}

export default PinnedAnnouncement
