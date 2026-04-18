/**
 * @module AdminLayout
 * @description Shared admin panel shell with top navigation and logout button.
 *
 * All authenticated admin sub-routes render inside this layout. It provides:
 *   - A persistent top navigation bar with links to every admin panel.
 *   - A logout button that calls Firebase `signOut` and redirects to /admin/login.
 *   - An `<Outlet />` placeholder where the active panel's content is rendered.
 *
 * This component is only reachable through the `RequireAuth` route guard, so
 * it can safely assume the current user is authenticated.
 */

import { useNavigate, NavLink, Outlet } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import './AdminLayout.css'

/**
 * AdminLayout component.
 *
 * Renders the persistent admin shell (top-nav + content area). The `<Outlet />`
 * renders whichever admin panel is currently active based on the URL.
 *
 * Logout flow:
 *   1. Call `signOut(auth)` to clear the Firebase session.
 *   2. Navigate to `/admin/login` (replace so back-button doesn't return to admin).
 *   3. `RequireAuth` will independently confirm the session is gone.
 *
 * @returns JSX element representing the admin shell layout.
 */
function AdminLayout() {
  const navigate = useNavigate()

  /**
   * Signs the current user out of Firebase Auth and redirects to the login page.
   *
   * Using `replace: true` prevents the authenticated admin route from appearing
   * in the browser history stack after logout, so the back button doesn't attempt
   * to return to a protected page.
   *
   * @returns Promise<void> — fire-and-forget; errors are logged to console but
   *   not surfaced to the user since they would still be redirected to login.
   */
  async function handleLogout() {
    try {
      await signOut(auth)
    } catch (err) {
      // Non-fatal: if signOut fails, Firebase will eventually expire the session.
      // We still navigate to the login page.
      console.error('[AdminLayout] signOut error:', err)
    } finally {
      navigate('/admin/login', { replace: true })
    }
  }

  return (
    <div className="admin-layout">
      {/* ── Top navigation bar ─────────────────────────────────────────── */}
      <nav className="admin-nav" aria-label="Admin navigation">
        {/* Brand / back-to-dashboard link */}
        <div className="admin-nav-brand">
          <NavLink to="/admin" end className="admin-nav-brand-link">
            Admin
          </NavLink>
        </div>

        {/* Panel navigation links */}
        <ul className="admin-nav-links" role="list">
          <li>
            <NavLink
              to="/admin/announcements"
              className={({ isActive }) =>
                ['admin-nav-link', isActive ? 'admin-nav-link--active' : ''].join(' ').trim()
              }
            >
              Announcements
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/admin/events"
              className={({ isActive }) =>
                ['admin-nav-link', isActive ? 'admin-nav-link--active' : ''].join(' ').trim()
              }
            >
              Events
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/admin/carousel"
              className={({ isActive }) =>
                ['admin-nav-link', isActive ? 'admin-nav-link--active' : ''].join(' ').trim()
              }
            >
              Carousel
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/admin/documents"
              className={({ isActive }) =>
                ['admin-nav-link', isActive ? 'admin-nav-link--active' : ''].join(' ').trim()
              }
            >
              Documents
            </NavLink>
          </li>
        </ul>

        {/* Logout action — always visible on the right */}
        <button
          type="button"
          className="admin-nav-logout"
          onClick={handleLogout}
          aria-label="Sign out of admin"
        >
          Sign Out
        </button>
      </nav>

      {/* ── Panel content area ─────────────────────────────────────────── */}
      {/* <Outlet /> is replaced at runtime by whichever admin panel is active */}
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  )
}

export default AdminLayout
