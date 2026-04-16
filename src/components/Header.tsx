import { useState } from 'react'
import HamburgerMenu from './HamburgerMenu'
import './Header.css'

interface HeaderProps {
  onOpenAnnouncements: () => void
  announcementsCount: number
}

function Header({ onOpenAnnouncements, announcementsCount }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleMenu = () => {
    setMenuOpen(!menuOpen)
  }

  const handleAnnouncementsClick = () => {
    onOpenAnnouncements()
    setMenuOpen(false)
  }

  const closeMenu = () => {
    setMenuOpen(false)
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
        <HamburgerMenu isOpen={menuOpen} onToggle={toggleMenu} />
        <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
          <a href="#standings" className="nav-link" onClick={closeMenu}>Standings</a>
          <a href="#schedule" className="nav-link" onClick={closeMenu}>Schedule</a>
          <a href="#scores" className="nav-link" onClick={closeMenu}>Scores</a>
          <button
            className="nav-link announcements-button"
            onClick={handleAnnouncementsClick}
          >
            📢 Announcements ({announcementsCount})
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header
