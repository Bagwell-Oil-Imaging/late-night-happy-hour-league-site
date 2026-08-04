---
feature: Contact
number: 11
source-paths:
  - src/pages/ContactPage.tsx
  - src/components/LeagueFormatInfo.tsx
---

## Intent
Provides league contact information and lets prospective members express interest in joining via an embedded Google Form.

## Key Behaviors
- View league info (team format, obligations, dues summary) in a sidebar, rendered by the shared `LeagueFormatInfo` component
- Submit an interest form via an embedded Google Forms iframe
- Form submissions are delivered to the league Gmail account via Google's email notifications
- Mailto link displayed in the sidebar as a direct contact fallback

## Conditional Paths
- No conditional rendering — the page is static layout with an iframe; no loading or error states

## External Dependencies
- Google Forms (hardcoded embed URL in ContactPage.tsx) — hosts and processes form submissions
- No Firestore reads; no env vars required

## Known Issues
None

## Notes
The Google Form embed URL is hardcoded as the `GOOGLE_FORM_URL` constant in ContactPage.tsx.
Form fields and notifications are managed in the Google Forms UI, not in code.
The iframe height is fixed at 1357px at desktop widths (≥861px, matching the height Google provided in the embed code). Below 861px it switches to `78vh` (bounded `min-height: 620px` / `max-height: 1100px`) instead of a fixed pixel value: the embedded form reflows taller as its own width narrows (question text wraps to more lines), and exactly how much taller varies by device fonts/DPI, so a single guessed mobile pixel height either clipped the submit button (too short) or left a dead gap with an orphaned floating Google help icon below the form (too tall). Any form content beyond the viewport-relative height is reachable via the iframe's own native internal scroll, which is standard supported iframe behavior on touch devices.
See ADR-007 for the decision record on why Formspree was replaced.

The Team Format / League Obligations / Dues & Fees cards were extracted into `src/components/LeagueFormatInfo.tsx` (+ `LeagueFormatInfo.css`, moved out of `ContactPage.css`) so the same content can also render on the [Home Dashboard](home-dashboard.md)'s off-season landing view without duplicating it. ContactPage still owns the "Get in Touch" and bylaws-link cards directly, which were not extracted.
