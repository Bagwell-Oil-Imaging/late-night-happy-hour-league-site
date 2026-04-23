---
id: "phase-5/sub-task-1"
title: "Auth Login + Route Guard + Admin Layout"
phase: 5
task: 1
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: ["phase-5/sub-task-2", "phase-5/sub-task-3"]
branch: "feature/firebase-firestore-migration"
commit_prefix: "feat(phase-5/task-1)"
estimated_files: 5
---

# Phase 5 / Sub-Task 1: Auth Login + Route Guard + Admin Layout

## Summary

Implements Firebase Auth–gated admin access. A `/admin/login` route accepts email/password
credentials and authenticates against Firebase Auth. A `RequireAuth` route guard component
wraps all admin sub-routes and redirects unauthenticated users to `/admin/login`. An `AdminLayout`
component provides a consistent shell (nav, logout button) shared across all admin panels.

## Implementation Plan

1. **Create `src/pages/admin/AdminLoginPage.tsx`**:
   - Email + password form
   - Calls `signInWithEmailAndPassword(auth, email, password)` from `firebase/auth`
   - On success: redirect to `/admin`
   - On failure: display error message ("Invalid credentials" — do not expose specifics)
   - No "Create Account" link — admin accounts are provisioned manually in Firebase Console

2. **Create `src/components/admin/RequireAuth.tsx`**:
   - Uses `onAuthStateChanged(auth, callback)` to subscribe to auth state
   - If `user == null`: redirect to `/admin/login` via `<Navigate to="/admin/login" replace />`
   - If `user != null`: render `<Outlet />` (children)
   - Shows a loading spinner while auth state is being resolved (avoids flash of login page)

3. **Create `src/components/admin/AdminLayout.tsx`**:
   - Top nav with links to each admin panel: Announcements, Events, Carousel, Documents
   - Logout button calling `signOut(auth)` → redirects to `/admin/login`
   - Renders `<Outlet />` for panel content

4. **Register admin routes in `src/App.tsx`**:
   ```
   /admin/login → AdminLoginPage (public)
   /admin → RequireAuth → AdminLayout → (default: redirect to /admin/announcements)
   /admin/announcements → AnnouncementsAdmin
   /admin/events → EventsAdmin
   /admin/carousel → CarouselAdmin
   /admin/documents → DocumentsAdmin
   ```
   The panel components themselves are created in sub-tasks 2 and 3 — stub them as empty
   placeholder components here.

5. **Create CSS files** for `AdminLoginPage` and `AdminLayout` with minimal styling consistent
   with the existing site design.

## File Operations

### Add
- `src/pages/admin/AdminLoginPage.tsx` — Email/password login form
- `src/pages/admin/AdminLoginPage.css` — Login page styles
- `src/components/admin/RequireAuth.tsx` — Auth guard for admin routes
- `src/components/admin/AdminLayout.tsx` — Admin shell with nav and logout
- `src/components/admin/AdminLayout.css` — Admin layout styles

### Edit
- `src/App.tsx` — Register `/admin` route tree with `RequireAuth` and `AdminLayout`

## Dependencies

### Depends On
- `phase-1/sub-task-1` — `src/firebase.ts` must export `auth`

### Blocks
- `phase-5/sub-task-2` — CRUD panels use `AdminLayout` and `RequireAuth`
- `phase-5/sub-task-3` — Documents panel uses same layout

## Acceptance Criteria

- [ ] `/admin/login` renders an email/password form
- [ ] Successful login redirects to `/admin`
- [ ] Failed login shows an error message without exposing auth details
- [ ] Navigating to any `/admin/*` route while unauthenticated redirects to `/admin/login`
- [ ] `AdminLayout` renders nav links and a working logout button
- [ ] Logout redirects to `/admin/login`
- [ ] Loading spinner shown during auth state resolution (no flash of login page for authenticated users)
- [ ] `npm run build` passes

## Commit Convention

`feat(phase-5/task-1): add Firebase Auth login, route guard, and admin layout`
