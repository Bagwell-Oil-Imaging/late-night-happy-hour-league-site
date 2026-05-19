---
id: "phase-2/sub-task-1"
title: "Create ADR-007 and update ADR index"
phase: 2
task: 1
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: []
branch: "refactor/contact-google-forms"
commit_prefix: "docs(phase-2/task-1)"
estimated_files: 2
---

# Phase 2 / Sub-Task 1: Create ADR-007 and update ADR index

## Summary

Record the architectural decision to replace Formspree with Google Forms as ADR-007. This permanently documents the decision and all rejected alternatives so they are never re-evaluated in future sessions. The ADR index gets a new row.

## Implementation Plan

1. **Create `docs/adr/007-google-forms-over-formspree.md`** with the following content:

   ```markdown
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
   ```

2. **Update `docs/adr/index.md`** — Add a new row to the table:
   ```
   | [ADR-007](007-google-forms-over-formspree.md) | Google Forms Over Formspree for Contact Form | Accepted | 2026-05-19 | Removed Formspree dependency; contact form is now a Google Forms iframe embed |
   ```

## File Operations

### Add
- `docs/adr/007-google-forms-over-formspree.md` — New ADR with full content as specified above

### Edit
- `docs/adr/index.md` — Add ADR-007 row to the table

## Dependencies

### Depends On
- `phase-1/sub-task-1` — ADR should document what was actually implemented

### Blocks
— (none)

## Acceptance Criteria

- [ ] `docs/adr/007-google-forms-over-formspree.md` exists with Status, Date, Context, Decision, Rejected Alternatives (all 5), Consequences, and Revisit When sections
- [ ] All 5 rejected alternatives are documented with specific rejection reasons
- [ ] `docs/adr/index.md` has a row for ADR-007 with correct title, status, date, and summary

## Commit Convention

`docs(phase-2/task-1): add ADR-007 for Google Forms over Formspree decision`
