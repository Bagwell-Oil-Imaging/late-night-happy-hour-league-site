import { useState } from 'react'
import { Link } from 'react-router-dom'
import HamburgerMenu from './HamburgerMenu'
import './Header.css'

interface HeaderProps {
  onOpenAnnouncements: () => void
  announcementsCount: number
  onOpenBylaws: () => void
}

function Header({ onOpenAnnouncements, announcementsCount, onOpenBylaws }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const toggleMenu = () => setMenuOpen(!menuOpen)
  const closeMenu = () => setMenuOpen(false)

  const handleAnnouncementsClick = () => {
    onOpenAnnouncements()
    setMenuOpen(false)
  }

  const handleBylawsClick = () => {
    onOpenBylaws()
    setMenuOpen(false)
  }

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo" onClick={closeMenu}>
          <img src="/images/logos/Late_Night_Happy_Hour_Logo.png" alt="Late Night Happy Hour Logo" className="logo-image" />
          <div className="logo-text">
            <h1>Late Night Happy Hour</h1>
            <p className="subtitle">Bowling League • Thursday Nights</p>
          </div>
        </Link>
        <HamburgerMenu isOpen={menuOpen} onToggle={toggleMenu} />
        <nav className={`nav ${menuOpen ? 'nav-open' : ''}`}>
          <Link to="/standings" className="nav-link" onClick={closeMenu}>Standings</Link>
          <Link to="/schedule" className="nav-link" onClick={closeMenu}>Schedule</Link>
          <Link to="/matchups" className="nav-link" onClick={closeMenu}>Matchups</Link>
          <Link to="/teams" className="nav-link" onClick={closeMenu}>Teams</Link>
          <Link to="/bowlers" className="nav-link" onClick={closeMenu}>Bowlers</Link>
          <Link to="/history" className="nav-link" onClick={closeMenu}>History</Link>
          <button className="nav-link" onClick={handleBylawsClick}>Bylaws</button>
          <button
            className="nav-link announcements-button"
            onClick={handleAnnouncementsClick}
            aria-label={`Announcements (${announcementsCount})`}
          >
            <span className="announcements-icon">📢</span>
            <span>Announcements</span>
            {announcementsCount > 0 && (
              <span className="announcements-badge">{announcementsCount}</span>
            )}
          </button>
          <Link to="/contact" className="nav-link nav-link-contact" onClick={closeMenu}>Join the League</Link>
        </nav>
      </div>
    </header>
  )
}

export default Header
