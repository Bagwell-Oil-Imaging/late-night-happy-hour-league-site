---
feature: Admin Authentication
number: 12
source-paths:
  - src/pages/admin/AdminLoginPage.tsx
  - src/components/admin/RequireAuth.tsx
  - src/components/admin/AdminLayout.tsx
diagram: ../diagrams/features/admin-authentication.md
status: no diagram
---

## Intent
Gates the admin panel behind Firebase Auth to prevent unauthorized users from accessing or modifying league data.

## Key Behaviors
- Unauthenticated user visiting /admin/* is redirected to /admin/login
- Login via Firebase passwordless email-link auth (sendSignInLinkToEmail / signInWithEmailLink) — not email/password
- User submits email → Firebase sends magic link → clicking the link returns to /admin/login to complete sign-in
- Successful login redirects to /admin (root admin route, not /admin/announcements)
- Authenticated session persists across browser refreshes
- Admin emails controlled via VITE_ADMIN_EMAILS env var (comma-separated allowlist); non-allowed emails are signed out immediately after sign-in
- AdminLayout provides shared admin nav
- AdminLayout auto-signs-out after 30 minutes of idle activity (no mouse/keyboard/touch/scroll)

## Conditional Paths
- While auth state resolves (Firebase onAuthStateChanged), RequireAuth shows a loading spinner
- If sign-in fails or link is expired, error message shown on login page
- If user opens the email link on a different device (localStorage cleared), login page prompts them to re-enter their email before completing sign-in
- No redirect occurs when visiting /admin/login while already authenticated — the page renders the send-link form and the router does not auto-redirect

## External Dependencies
- Firebase Auth (email-link / passwordless provider)
- React Router for redirect logic
- VITE_ADMIN_EMAILS environment variable (allowlist)

## Known Issues
None

## Notes
RequireAuth uses Firebase onAuthStateChanged to observe auth state — renders spinner during resolution to prevent flash of login page for already-authenticated users. The email used to request the link is persisted to localStorage under the key `adminSignInEmail` and removed after a successful sign-in.
