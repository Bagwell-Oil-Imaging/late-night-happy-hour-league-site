---
id: "phase-2/sub-task-2"
title: "Update feature docs, mark diagram stale, and update CHANGELOG"
phase: 2
task: 2
status: pending
depends_on: ["phase-1/sub-task-1", "phase-1/sub-task-2"]
blocks: []
branch: "refactor/contact-google-forms"
commit_prefix: "docs(phase-2/task-2)"
estimated_files: 4
---

# Phase 2 / Sub-Task 2: Update feature docs, mark diagram stale, and update CHANGELOG

## Summary

Bring all documentation in sync with the new Google Forms implementation. Four files need updating: the feature spec, the diagram file (mark stale), the features registry, and the changelog.

## Implementation Plan

1. **Rewrite `docs/features/contact.md`** — Replace the entire file content with:

   ```markdown
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
   ```

2. **Mark `docs/diagrams/features/contact/flowchart.md` as stale** — Add a stale notice at the top of the file, below the frontmatter:
   ```markdown
   > **STALE** — This diagram reflects the old Formspree form flow. Regenerate with `/generate-diagrams` after the refactor is complete.
   ```

3. **Update `docs/features.md`** — Find the contact row and change the diagram status column from `current` to `stale`:
   - Before: `| [flowchart](diagrams/features/contact/flowchart.md) | current |`
   - After: `| [flowchart](diagrams/features/contact/flowchart.md) | stale |`

4. **Update `CHANGELOG.md`** — Add an entry under the current unreleased section (or create one if absent). Entry:
   ```
   ### Changed
   - Contact page: replaced Formspree form with Google Forms iframe embed; removed VITE_FORMSPREE_ID env var dependency (ADR-007)
   ```

## File Operations

### Edit
- `docs/features/contact.md` — Rewrite to reflect Google Forms embed (remove Formspree references)
- `docs/diagrams/features/contact/flowchart.md` — Add stale notice at top of file
- `docs/features.md` — Update contact row diagram status to `stale`
- `CHANGELOG.md` — Add changelog entry for this refactor

## Dependencies

### Depends On
- `phase-1/sub-task-1` — Feature doc must reflect the final page behavior
- `phase-1/sub-task-2` — CSS cleanup must be complete before documenting final state

### Blocks
— (none)

## Acceptance Criteria

- [ ] `docs/features/contact.md` contains no references to Formspree, `VITE_FORMSPREE_ID`, or form state machine
- [ ] `docs/features/contact.md` External Dependencies section lists Google Forms and notes no env vars required
- [ ] `docs/diagrams/features/contact/flowchart.md` has a visible stale notice
- [ ] `docs/features.md` contact row diagram status is `stale`
- [ ] `CHANGELOG.md` has an entry describing the Formspree → Google Forms change

## Commit Convention

`docs(phase-2/task-2): update contact feature docs and mark diagram stale`
