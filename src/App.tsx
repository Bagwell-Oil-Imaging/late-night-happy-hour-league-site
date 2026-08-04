import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import Header from './components/Header'
import Footer from './components/Footer'
import AnnouncementsModal from './components/AnnouncementsModal'
import BylawsModal from './components/BylawsModal'
import QRCodeModal from './components/QRCodeModal'
import HomePage from './pages/HomePage'
import StandingsPage from './pages/StandingsPage'
import MatchupsPage from './pages/MatchupsPage'
import TeamsPage from './pages/TeamsPage'
import BowlersPage from './pages/BowlersPage'
import HistoryPage from './pages/HistoryPage'
import ContactPage from './pages/ContactPage'
import SchedulePage from './pages/SchedulePage'
import LanesPage from './pages/LanesPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import RequireAuth from './components/admin/RequireAuth'
import AdminLayout from './components/admin/AdminLayout'
import AnnouncementsAdmin from './pages/admin/AnnouncementsAdmin'
import EventsAdmin from './pages/admin/EventsAdmin'
import CarouselAdmin from './pages/admin/CarouselAdmin'
import DocumentsAdmin from './pages/admin/DocumentsAdmin'
import SettingsAdmin from './pages/admin/SettingsAdmin'
import DataCorrectionAdmin from './pages/admin/DataCorrectionAdmin'
import { SeasonProvider } from './context/SeasonContext'
import { useAnnouncements } from './hooks'

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
  const [showQrCode, setShowQrCode] = useState(false)
  // Fetch live announcement count from Firestore for the Header badge
  const { data: announcements } = useAnnouncements()

  return (
    <SeasonProvider>
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
          <Route path="announcements" element={<AnnouncementsAdmin />} />
          <Route path="events" element={<EventsAdmin />} />
          <Route path="carousel" element={<CarouselAdmin />} />
          <Route path="documents" element={<DocumentsAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
          <Route path="data-correction" element={<DataCorrectionAdmin />} />
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
              onOpenQrCode={() => setShowQrCode(true)}
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
                <Route path="/lanes" element={<LanesPage />} />
              </Routes>
            </main>
            <Footer />
            <BylawsModal isOpen={showBylaws} onClose={() => setShowBylaws(false)} />
            <QRCodeModal isOpen={showQrCode} onClose={() => setShowQrCode(false)} />
            <AnnouncementsModal
              isOpen={showAnnouncements}
              onClose={() => setShowAnnouncements(false)}
            />
          </div>
        }
      />
    </Routes>
    </SeasonProvider>
  )
}

export default App
