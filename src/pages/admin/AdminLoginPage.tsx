/**
 * @module AdminLoginPage
 * @description Firebase Auth email/password login page for the admin panel.
 *
 * This page is publicly accessible at /admin/login. It intentionally does NOT
 * expose a "create account" link — admin accounts are provisioned manually
 * through the Firebase Console.
 *
 * On success, the user is redirected to /admin (the admin dashboard root).
 * On failure, a generic "Invalid credentials" message is shown to avoid
 * leaking information about whether the email exists.
 */

import { useState, type FormEvent } from 'react'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../../firebase'
import './AdminLoginPage.css'

/**
 * AdminLoginPage component.
 *
 * Renders a centered login card with an email/password form. Calls
 * `signInWithEmailAndPassword` from Firebase Auth. Successful auth triggers
 * a navigation to `/admin`; failed auth displays an error message without
 * revealing specific auth failure details.
 *
 * @returns JSX element representing the full-page login form.
 */
function AdminLoginPage() {
  /** Controlled input value for the email field. */
  const [email, setEmail] = useState('')

  /** Controlled input value for the password field. */
  const [password, setPassword] = useState('')

  /**
   * Error message shown beneath the form. Null means no error is displayed.
   * Always uses a generic message to avoid exposing auth internals.
   */
  const [error, setError] = useState<string | null>(null)

  /** Whether a sign-in request is currently in flight. Disables the submit button. */
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  /**
   * Handles form submission.
   *
   * Calls Firebase `signInWithEmailAndPassword`. On success, navigates to
   * `/admin`. On any failure, displays a generic error message so that
   * neither the email address existence nor password correctness is revealed
   * to a potential attacker.
   *
   * @param e - The form submit event; default is prevented to avoid page reload.
   */
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signInWithEmailAndPassword(auth, email, password)
      // Auth succeeded — navigate to the admin dashboard root.
      navigate('/admin', { replace: true })
    } catch {
      // Intentionally generic: do not log or expose the Firebase error code
      // (e.g., "user-not-found" vs "wrong-password") to prevent account enumeration.
      setError('Invalid credentials. Please check your email and password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        {/* Site brand / context header */}
        <div className="admin-login-header">
          <h1 className="admin-login-title">Admin</h1>
          <p className="admin-login-subtitle">Late Night Happy Hour League</p>
        </div>

        {/* Email/password form */}
        <form className="admin-login-form" onSubmit={handleSubmit} noValidate>
          <div className="admin-login-field">
            <label htmlFor="admin-email" className="admin-login-label">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              className="admin-login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="admin@example.com"
              disabled={loading}
            />
          </div>

          <div className="admin-login-field">
            <label htmlFor="admin-password" className="admin-login-label">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              className="admin-login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {/* Error message — only rendered when an auth attempt has failed */}
          {error && (
            <p className="admin-login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="admin-login-button"
            disabled={loading || !email || !password}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminLoginPage
