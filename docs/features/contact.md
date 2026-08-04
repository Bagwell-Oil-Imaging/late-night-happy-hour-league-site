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
The iframe height is fixed per breakpoint in `ContactPage.css` — 1357px at desktop widths (≥861px), then 1440px (≤860px), 1500px (≤480px), 1560px (≤400px), 1650px (≤360px). Google Forms doesn't support iframe-resizer/postMessage, so a cross-origin iframe can never truly auto-size to its content — some fixed height is unavoidable. The embedded form reflows taller as its own iframe width narrows (question text wraps to more lines) but plateaus once the iframe is wider than ~420px, which is why the tiers above get progressively closer together at the wide end. Each height was measured directly against the live form at the effective iframe width its breakpoint's viewport range actually produces (not the viewport width itself — subtract `.main-content` and `.contact-form-panel` padding first). Re-measure and adjust all tiers if form questions are added/edited in the Google Forms UI, or if `.contact-form-panel` padding changes.
See ADR-007 for the decision record on why Formspree was replaced (and why redirecting off-site instead of embedding was explicitly rejected there).

The Team Format / League Obligations / Dues & Fees cards were extracted into `src/components/LeagueFormatInfo.tsx` (+ `LeagueFormatInfo.css`, moved out of `ContactPage.css`) so the same content can also render on the [Home Dashboard](home-dashboard.md)'s off-season landing view without duplicating it. ContactPage still owns the "Get in Touch" and bylaws-link cards directly, which were not extracted.
