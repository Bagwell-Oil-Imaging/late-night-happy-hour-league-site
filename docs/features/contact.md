---
feature: Contact
number: 11
source-paths:
  - src/pages/ContactPage.tsx
---

## Intent
Provides league contact information and lets prospective members express interest in joining via an embedded Google Form.

## Key Behaviors
- View league info (team format, obligations, dues summary) in a sidebar
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
The iframe height is fixed at 1357px (matching the height Google provided in the embed code).
See ADR-007 for the decision record on why Formspree was replaced.
