# ADR-007: Google Forms Over Formspree for Contact Form
**Status:** Accepted
**Date:** 2026-05-19

## Context
The Contact page used a custom React form (~200 lines of state, handlers, and JSX) that
POSTed submissions to Formspree, a third-party form backend service. Formspree forwarded
submissions to the league email address. This introduced an external service dependency,
a required env var (VITE_FORMSPREE_ID), and a free-tier submission limit (50/month).
For a bowling league contact form receiving a handful of submissions per season, this
complexity was not justified.

## Decision
Replace the custom Formspree-backed form with a Google Forms iframe embed. The form is
hosted on Google Forms, embedded via `<iframe>` in the existing contact panel, and
delivers submissions directly to the league Gmail account via Google's built-in email
notification. The Google Form embed URL is hardcoded as a constant — it is not a secret
and requires no env var.

## Rejected Alternatives
- **Keep Formspree** — Third-party dependency with a 50 submission/month free tier limit;
  requires an env var and an external account to maintain; adds operational surface area
  for a feature that is used a few times per season.
- **Custom serverless endpoint** — Overkill for a low-volume contact form; adds backend
  complexity, credential management, and maintenance burden with no benefit over Google
  Forms.
- **EmailJS** — Same class of dependency as Formspree; trades one third-party service for
  another without reducing complexity or the env var requirement.
- **Redirect to Google Form URL** — Opens a new tab and takes the user off the site;
  worse UX than an inline iframe embed.
- **Mailto link only** — No structured data capture; submissions arrive as unstructured
  email threads with no consistent field layout.

## Consequences
- Zero external service dependencies for the contact form
- No env var required (`VITE_FORMSPREE_ID` removed from the project entirely)
- Form field layout and styling are controlled by Google, not the site theme
- Form fields are managed in the Google Forms UI, not in code
- Submissions land in Google Forms responses with email notification to the league Gmail
- ContactPage.tsx is simplified from ~280 lines to ~60 lines (no React state or async logic)

## Revisit When
- The league needs custom styling that must match the site theme precisely
- Submission volume requires server-side processing or CRM integration
