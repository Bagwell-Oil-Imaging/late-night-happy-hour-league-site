import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import Header from './components/Header'
import AnnouncementsModal from './components/AnnouncementsModal'
import BylawsModal from './components/BylawsModal'
import HomePage from './pages/HomePage'
import StandingsPage from './pages/StandingsPage'
import MatchupsPage from './pages/MatchupsPage'
import TeamsPage from './pages/TeamsPage'
import BowlersPage from './pages/BowlersPage'
import HistoryPage from './pages/HistoryPage'
import ContactPage from './pages/ContactPage'
import SchedulePage from './pages/SchedulePage'
import announcementsData from './data/announcements.json'
import type { Announcement } from './types'

function App() {
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [showBylaws, setShowBylaws] = useState(false)
  const announcements = announcementsData as Announcement[]

  return (
    <div className="app">
      <Header
        onOpenAnnouncements={() => setShowAnnouncements(true)}
        announcementsCount={announcements.length}
        onOpenBylaws={() => setShowBylaws(true)}
      />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/matchups" element={<MatchupsPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/bowlers" element={<BowlersPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <span className="footer-brand">Late Night Happy Hour</span>
          <span className="footer-copy">&copy; 2025 Bowling League &mdash; Thursday Nights</span>
        </div>
      </footer>
      <BylawsModal isOpen={showBylaws} onClose={() => setShowBylaws(false)} />
      <AnnouncementsModal
        announcements={announcements}
        isOpen={showAnnouncements}
        onClose={() => setShowAnnouncements(false)}
      />
    </div>
  )
}

export default App
