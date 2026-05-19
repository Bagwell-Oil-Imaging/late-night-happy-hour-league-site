---
feature: Contact
number: 11
source-paths:
  - src/pages/ContactPage.tsx
diagram: ../diagrams/features/contact.md
status: no diagram
---

## Intent
Provides league contact information and lets prospective members express interest in joining via a contact form.

## Key Behaviors
- View league info (team format, obligations, dues summary) in a sidebar
- Fill out and submit an interest form (name, email, phone, experience level, group size, message)
- On submit: POSTs to Formspree when VITE_FORMSPREE_ID is configured, or falls back to opening mailto:
- Success state shown after submission; form resets

## Conditional Paths
- If VITE_FORMSPREE_ID is not set, submit button opens the user's default mail client instead
- If submission fails (network error or non-OK response), error message shown with email fallback
- "Submitting…" disabled state while request is in flight

## External Dependencies
- Formspree (VITE_FORMSPREE_ID env var) — external form submission service
- mailto: bowllatenighthappyhour@gmail.com as fallback

## Known Issues
None

## Notes
No Firestore reads. Page is not fully static — it contains an interactive form with async submission logic and multiple UI states (idle, submitting, success, error).
