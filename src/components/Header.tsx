import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import HamburgerMenu from './HamburgerMenu'
import { useSeasonYear } from '../context/SeasonContext'
import './Header.css'

interface HeaderProps {
  onOpenAnnouncements: () => void
  announcementsCount: number
  onOpenBylaws: () => void
}

/**
 * Site-wide sticky header.
 *
 * Layout: logo | inline nav (Standings, Schedule, Teams, Bowlers, Announcements) |
 *         Join the League CTA | hamburger dropdown (all nav links + Bylaws).
 *
 * The inline nav is hidden on mobile — the hamburger dropdown covers those routes.
 * Announcements lives only in the inline nav (not the dropdown).
 * Standings, Schedule, Teams, and Bowlers appear in both locations.
 */
function Header({ onOpenAnnouncements, announcementsCount, onOpenBylaws }: HeaderProps) {
  const currentSeasonYear = useSeasonYear()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapperRef = useRef<HTMLDivElement>(null)

  const closeMenu = () => setMenuOpen(false)
  const toggleMenu = () => setMenuOpen(prev => !prev)

  /** Close on Escape key press. */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  /** Close when clicking outside the menu wrapper. */
  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuWrapperRef.current && !menuWrapperRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const handleAnnouncementsClick = () => {
    onOpenAnnouncements()
    closeMenu()
  }

  const handleBylawsClick = () => {
    onOpenBylaws()
    closeMenu()
  }

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/" className="logo" onClick={closeMenu}>
          <img src="/images/logos/Late_Night_Happy_Hour_Logo.png" alt="Late Night Happy Hour Logo" className="logo-image" />
          <div className="logo-text">
            <h1>Late Night Happy Hour</h1>
            <p className="subtitle">Bowling League • Thursday Nights</p>
            <p className="season-indicator">Season {currentSeasonYear}</p>
          </div>
        </Link>

        {/* Inline nav — hidden on mobile, visible on desktop */}
        <nav className="nav">
          <Link to="/standings" className="nav-link">Standings</Link>
          <Link to="/schedule" className="nav-link">Schedule</Link>
          <Link to="/teams" className="nav-link">Teams</Link>
          <Link to="/bowlers" className="nav-link">Bowlers</Link>
          <button
            className="nav-link announcements-button"
            onClick={handleAnnouncementsClick}
            aria-label={`Announcements${announcementsCount > 0 ? ` (${announcementsCount})` : ''}`}
          >
            <span className="announcements-icon">📢</span>
            <span>Announcements</span>
            {announcementsCount > 0 && (
              <span className="announcements-badge">{announcementsCount}</span>
            )}
          </button>
        </nav>

        <div className="header-actions">
          <Link to="/contact" className="nav-link nav-link-contact" onClick={closeMenu}>Join the League</Link>

          <div className="menu-wrapper" ref={menuWrapperRef}>
            <HamburgerMenu isOpen={menuOpen} onToggle={toggleMenu} />

            {menuOpen && (
              <nav className="nav-dropdown" role="menu" aria-label="Site navigation">
                <Link to="/standings" className="dropdown-link" onClick={closeMenu} role="menuitem">Standings</Link>
                <Link to="/schedule" className="dropdown-link" onClick={closeMenu} role="menuitem">Schedule</Link>
                <Link to="/matchups" className="dropdown-link" onClick={closeMenu} role="menuitem">Matchups</Link>
                <Link to="/teams" className="dropdown-link" onClick={closeMenu} role="menuitem">Teams</Link>
                <Link to="/lanes" className="dropdown-link" onClick={closeMenu} role="menuitem">Lanes</Link>
                <Link to="/bowlers" className="dropdown-link" onClick={closeMenu} role="menuitem">Bowlers</Link>
                <Link to="/history" className="dropdown-link" onClick={closeMenu} role="menuitem">History</Link>
                <div className="dropdown-divider" role="separator" />
                <button className="dropdown-link" onClick={handleBylawsClick} role="menuitem">Bylaws</button>
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
