import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
import AdminLoginPage from './pages/admin/AdminLoginPage'
import RequireAuth from './components/admin/RequireAuth'
import AdminLayout from './components/admin/AdminLayout'
import announcementsData from './data/announcements.json'
import type { Announcement } from './types'

/**
 * App root component.
 *
 * Renders two distinct route trees:
 *   1. Public site routes — wrapped in the shared Header/Footer shell.
 *   2. Admin routes — use a completely separate layout shell and are
 *      protected by the `RequireAuth` guard (except `/admin/login`).
 *
 * Admin routes intentionally bypass the public Header and Footer so the
 * admin UI is visually isolated from the public-facing site.
 *
 * @returns The top-level JSX rendered into `#root`.
 */
function App() {
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [showBylaws, setShowBylaws] = useState(false)
  const announcements = announcementsData as Announcement[]

  return (
    <Routes>
      {/* ── Admin route tree — bypasses public Header/Footer ────────────── */}

      {/*
       * /admin/login — public; must be OUTSIDE RequireAuth so unauthenticated
       * users can reach it without being redirected back into a guard loop.
       */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/*
       * /admin/* — all sub-routes are gated by RequireAuth.
       * RequireAuth renders a spinner while Firebase resolves the auth state,
       * then either redirects to /admin/login or renders <Outlet /> (AdminLayout).
       */}
      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminLayout />}>
          {/* Default index: redirect immediately to /admin/announcements */}
          <Route index element={<Navigate to="/admin/announcements" replace />} />

          {/*
           * Placeholder panel routes — replaced by real CRUD components in
           * phase-5/sub-task-2 (Announcements, Events, Carousel) and
           * phase-5/sub-task-3 (Documents).
           */}
          <Route
            path="announcements"
            element={<div className="admin-placeholder">Announcements Admin (coming soon)</div>}
          />
          <Route
            path="events"
            element={<div className="admin-placeholder">Events Admin (coming soon)</div>}
          />
          <Route
            path="carousel"
            element={<div className="admin-placeholder">Carousel Admin (coming soon)</div>}
          />
          <Route
            path="documents"
            element={<div className="admin-placeholder">Documents Admin (coming soon)</div>}
          />
        </Route>
      </Route>

      {/* ── Public site route tree — wrapped in Header / Footer shell ───── */}
      <Route
        path="/*"
        element={
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
        }
      />
    </Routes>
  )
}

export default App
