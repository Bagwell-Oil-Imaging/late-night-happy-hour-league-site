/**
 * @module AdminLoginPage
 * @description Firebase Auth passwordless email-link login page for the admin panel.
 *
 * Flow:
 *  1. User enters their email and clicks "Send sign-in link".
 *  2. Firebase sends a magic link to that address; the page shows a "check your
 *     email" confirmation.
 *  3. When the user clicks the link, Firebase redirects back to this same page.
 *  4. The page detects the sign-in link in the URL, retrieves the stored email
 *     from localStorage, completes sign-in, and checks the result against the
 *     VITE_ADMIN_EMAILS allowlist.
 *  5. Allowed emails are redirected to /admin; others are signed out immediately.
 *
 * This page is publicly accessible at /admin/login. Admin emails are controlled
 * via the VITE_ADMIN_EMAILS environment variable (comma-separated).
 */

import { useState, useEffect, type FormEvent } from 'react'
import {
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
} from 'firebase/auth'
import { useNavigate } from 'react-router-dom'
import { auth } from '../../firebase'
import './AdminLoginPage.css'

/** localStorage key used to persist the email across the redirect. */
const EMAIL_STORAGE_KEY = 'adminSignInEmail'

/**
 * Allowlisted admin emails from the environment variable.
 * Falls back to an empty array if not configured, which blocks all sign-ins.
 */
const ALLOWED_EMAILS: string[] = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim().toLowerCase())
  .filter(Boolean)

/**
 * AdminLoginPage component.
 *
 * Handles both phases of Firebase passwordless email-link authentication:
 * sending the link and completing sign-in after the redirect.
 *
 * @returns JSX element representing the full-page login form.
 */
function AdminLoginPage() {
  /** Controlled email input value. */
  const [email, setEmail] = useState('')

  /** True while an async Firebase operation is in flight. */
  const [loading, setLoading] = useState(false)

  /** True after the sign-in link has been sent; shows the confirmation message. */
  const [linkSent, setLinkSent] = useState(false)

  /**
   * Error message shown beneath the form. Null means no error is displayed.
   * Uses generic messages to avoid leaking auth internals.
   */
  const [error, setError] = useState<string | null>(null)

  /**
   * When the user returns from the email link, we may need to prompt them to
   * re-enter their email if localStorage was cleared (e.g. different device).
   */
  const [needsEmail, setNeedsEmail] = useState(false)

  const navigate = useNavigate()

  /**
   * On mount, check whether the current URL is a Firebase sign-in link.
   * If so, attempt to complete the sign-in automatically using the stored email.
   */
  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return

    const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY)
    if (!storedEmail) {
      // User opened the link on a different device — ask for their email.
      setNeedsEmail(true)
      return
    }

    completeSignIn(storedEmail)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Completes the passwordless sign-in using the email link in the current URL.
   * After sign-in, verifies the email is in the allowlist. Non-allowed emails
   * are signed out immediately.
   *
   * @param signingInEmail - The email address to complete sign-in for.
   */
  async function completeSignIn(signingInEmail: string) {
    setLoading(true)
    setError(null)

    try {
      const result = await signInWithEmailLink(auth, signingInEmail, window.location.href)
      localStorage.removeItem(EMAIL_STORAGE_KEY)

      const normalizedEmail = result.user.email?.toLowerCase() ?? ''

      if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(normalizedEmail)) {
        // Email is not on the allowlist — revoke the session immediately.
        await signOut(auth)
        setError('This email address is not authorised to access the admin panel.')
        setLoading(false)
        return
      }

      // Strip the sign-in link params from the URL before navigating.
      window.history.replaceState({}, document.title, '/admin/login')
      navigate('/admin', { replace: true })
    } catch {
      setError('Sign-in failed. The link may have expired — please request a new one.')
      setLoading(false)
    }
  }

  /**
   * Handles the email submission form when the user needs to re-enter their
   * email after returning on a different device.
   *
   * @param e - The form submit event.
   */
  async function handleEmailConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    await completeSignIn(email)
  }

  /**
   * Sends a Firebase passwordless sign-in link to the entered email address.
   * Saves the email to localStorage so it can be retrieved after the redirect.
   *
   * @param e - The form submit event.
   */
  async function handleSendLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const normalizedEmail = email.trim().toLowerCase()
    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      setError('This email address is not authorised to access the admin panel.')
      return
    }

    setLoading(true)

    const actionCodeSettings = {
      // URL the user is redirected back to after clicking the link.
      // Uses the current origin so it works across local dev and production.
      url: `${window.location.origin}/admin/login`,
      handleCodeInApp: true,
    }

    try {
      await sendSignInLinkToEmail(auth, normalizedEmail, actionCodeSettings)
      // Persist email so we can complete sign-in after the redirect.
      localStorage.setItem(EMAIL_STORAGE_KEY, normalizedEmail)
      setLinkSent(true)
    } catch (err) {
      const errorCode = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : null
      const errorMessage = typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : null
      console.error('[AdminLoginPage] sendSignInLinkToEmail failed:', err)
      setError(
        errorCode
          ? `Failed to send sign-in link (${errorCode}). ${errorMessage ?? 'Please check the email address and try again.'}`
          : 'Failed to send sign-in link. Please check the email address and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <h1 className="admin-login-title">Admin</h1>
          <p className="admin-login-subtitle">Late Night Happy Hour League</p>
        </div>

        {/* ── Phase 3: link sent confirmation ──────────────────────────── */}
        {linkSent && (
          <div className="admin-login-sent">
            <p className="admin-login-sent-msg">
              Check your email — a sign-in link has been sent to <strong>{email}</strong>.
            </p>
            <p className="admin-login-sent-hint">
              Click the link in that email to finish signing in. You can close this tab.
            </p>
            <button
              className="admin-login-resend"
              onClick={() => setLinkSent(false)}
            >
              Send to a different email
            </button>
          </div>
        )}

        {/* ── Phase 2: re-enter email (different device) ───────────────── */}
        {!linkSent && needsEmail && (
          <form className="admin-login-form" onSubmit={handleEmailConfirm} noValidate>
            <p className="admin-login-hint">
              Enter the email address you used to request the sign-in link.
            </p>
            <div className="admin-login-field">
              <label htmlFor="admin-email" className="admin-login-label">Email</label>
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
            {error && <p className="admin-login-error" role="alert">{error}</p>}
            <button
              type="submit"
              className="admin-login-button"
              disabled={loading || !email}
            >
              {loading ? 'Signing in…' : 'Complete Sign In'}
            </button>
          </form>
        )}

        {/* ── Phase 1: send the link ───────────────────────────────────── */}
        {!linkSent && !needsEmail && (
          <form className="admin-login-form" onSubmit={handleSendLink} noValidate>
            <div className="admin-login-field">
              <label htmlFor="admin-email" className="admin-login-label">Email</label>
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
            {error && <p className="admin-login-error" role="alert">{error}</p>}
            <button
              type="submit"
              className="admin-login-button"
              disabled={loading || !email}
            >
              {loading ? 'Sending…' : 'Send Sign-In Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default AdminLoginPage
