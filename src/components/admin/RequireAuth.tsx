/**
 * @module RequireAuth
 * @description Route guard component that enforces Firebase Auth on admin routes.
 *
 * Wraps protected admin sub-routes. Three rendering states:
 *   1. Auth state resolving  → renders a loading spinner (prevents flash of login page)
 *   2. Unauthenticated       → redirects to /admin/login
 *   3. Authenticated         → renders the protected content via <Outlet />
 *
 * Usage in the router:
 *   <Route element={<RequireAuth />}>
 *     <Route path="/admin" element={<AdminLayout />}>…</Route>
 *   </Route>
 */

import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../../firebase'
import './RequireAuth.css'

/**
 * Possible states for the authentication resolver.
 * - `'loading'` — Firebase has not yet called the auth state callback.
 * - `'authenticated'` — A signed-in user was found.
 * - `'unauthenticated'` — The auth state resolved with no user.
 */
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

/**
 * RequireAuth component.
 *
 * Subscribes to Firebase Auth state on mount via `onAuthStateChanged`.
 * The subscription is cleaned up automatically on unmount to prevent
 * memory leaks. While the initial auth state is being resolved, a spinner
 * is shown so that a briefly-authenticated user does not see a redirect
 * flash to the login page before Firebase confirms their session.
 *
 * @returns
 *   - A full-page spinner while auth state resolves.
 *   - `<Navigate to="/admin/login" replace />` if unauthenticated.
 *   - `<Outlet />` if authenticated, rendering the wrapped child routes.
 */
function RequireAuth() {
  /**
   * Current auth resolution status.
   * Starts as 'loading' until Firebase calls back with the initial state.
   */
  const [status, setStatus] = useState<AuthStatus>('loading')

  /**
   * The resolved Firebase User object, or null if unauthenticated.
   * Only used to distinguish authenticated vs unauthenticated once loading completes.
   */
  const [_user, setUser] = useState<User | null>(null)

  useEffect(() => {
    /**
     * Subscribe to Firebase Auth state changes.
     * `onAuthStateChanged` fires once immediately with the current auth state,
     * then again on any subsequent sign-in or sign-out event.
     *
     * Returns an unsubscribe function that is called on cleanup.
     */
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setStatus(firebaseUser ? 'authenticated' : 'unauthenticated')
    })

    // Cleanup: unsubscribe from the Firebase listener when the component unmounts
    // to prevent state updates on an unmounted component.
    return unsubscribe
  }, [])

  // Phase 1 — Auth state not yet resolved: show a spinner instead of the login
  // page to prevent an authenticated user from seeing a brief redirect flash.
  if (status === 'loading') {
    return (
      <div className="require-auth-loading" aria-label="Verifying authentication…">
        <div className="require-auth-spinner" />
      </div>
    )
  }

  // Phase 2 — No authenticated user: hard redirect to the login page.
  // `replace` prevents the login page from being added to the history stack,
  // so the back button doesn't loop the user back to the protected route.
  if (status === 'unauthenticated') {
    return <Navigate to="/admin/login" replace />
  }

  // Phase 3 — Authenticated: render the child routes defined inside this guard.
  return <Outlet />
}

export default RequireAuth
