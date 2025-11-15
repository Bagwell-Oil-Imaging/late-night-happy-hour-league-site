import { useState } from 'react'
import announcementsData from '../data/announcements.json'
import type { Announcement } from '../types'
import './Header.css'

function Header() {
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const announcements = announcementsData as Announcement[]

  // Sort by date (most recent first)
  const sortedAnnouncements = [...announcements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <img src="/images/logos/Late_Night_Happy_Hour_Logo.png" alt="Late Night Happy Hour Logo" className="logo-image" />
          <div className="logo-text">
            <h1>Late Night Happy Hour</h1>
            <p className="subtitle">Bowling League • Thursday Nights</p>
          </div>
        </div>
        <nav className="nav">
          <a href="#standings" className="nav-link">Standings</a>
          <a href="#schedule" className="nav-link">Schedule</a>
          <a href="#scores" className="nav-link">Scores</a>
          <div className="announcements-dropdown">
            <button
              className="nav-link announcements-button"
              onClick={() => setShowAnnouncements(!showAnnouncements)}
            >
              📢 Announcements ({announcements.length})
            </button>
            {showAnnouncements && (
              <div className="announcements-menu">
                <div className="announcements-menu-header">
                  <h3>Recent Announcements</h3>
                  <button
                    className="close-button"
                    onClick={() => setShowAnnouncements(false)}
                  >
                    ✕
                  </button>
                </div>
                <div className="announcements-menu-list">
                  {sortedAnnouncements.map((announcement) => (
                    <div key={announcement.id} className="announcement-menu-item">
                      <div className="announcement-menu-header">
                        <span className="announcement-menu-title">{announcement.title}</span>
                        <span className="announcement-menu-date">{formatDate(announcement.date)}</span>
                      </div>
                      <p className="announcement-menu-message">{announcement.message}</p>
                      <span className={`announcement-menu-type type-${announcement.type}`}>
                        {announcement.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}

export default Header
