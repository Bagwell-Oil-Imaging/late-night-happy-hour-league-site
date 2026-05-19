# Requirements: Replace Formspree with Google Forms Embed

**Branch:** `refactor/contact-google-forms`
**Motivation:** Cut the Formspree third-party dependency entirely. The contact form is low-volume (a few submissions per season) and does not need a custom-styled form. A Google Forms iframe embed delivers the same outcome with zero external service dependency and zero env var.

---

## Background

The Contact page (`src/pages/ContactPage.tsx`) currently renders a fully custom HTML form with six fields (name, email, phone, experience, group size, message) and async submission logic that POSTs to Formspree. Formspree forwards submissions to `bowllatenighthappyhour@gmail.com`.

The custom form requires:
- `VITE_FORMSPREE_ID` env var
- ~200 lines of React state, submit handler, and UI state machine (idle / submitting / success / error)
- Form-specific CSS

None of this complexity is warranted for a contact form that rarely gets used.

---

## Pre-Work (Manual — Must Be Done Before Implementation)

Before running decompose/execute, the Google Form must exist:

1. Go to [forms.google.com](https://forms.google.com) and create a new form
2. Add fields matching the current form:
   - Name (Short answer)
   - Email (Short answer)
   - Phone (Short answer)
   - Bowling experience (Multiple choice or dropdown: Never, Recreational, League)
   - Group size (Multiple choice or dropdown: Just me, 2, 3, 4+)
   - Message / anything else (Paragraph)
3. Set response destination: Responses tab → Link to Sheets, or just leave responses in Forms
4. Set notification: Responses tab → Get email notifications for new responses (send to `bowllatenighthappyhour@gmail.com`)
5. Click **Send** → embed icon (`< >`) → copy the full `<iframe>` src URL
6. Paste that URL into this doc under **Google Form Embed URL** below before running decompose

**Google Form Embed URL:**
`https://docs.google.com/forms/d/e/1FAIpQLSexNSK5RYx5bN1GbwLcjFwQidHfNz8KguspWBHX6ZT8eJo0YA/viewform?embedded=true`

**Google Form iframe attributes (from Google's embed code):**
- `width="640"` — override to `100%` in implementation
- `height="1357"` — use this as the fixed height
- `frameborder="0"` — set via CSS (`border: none`)
- `marginheight="0" marginwidth="0"` — deprecated attrs, omit in implementation

---

## Scope

### Remove

| Item | File |
|------|------|
| All form state (`FormData`, `FormStatus`, `useState`, submit handler) | `src/pages/ContactPage.tsx` |
| Formspree POST logic and `FORMSPREE_URL` constant | `src/pages/ContactPage.tsx` |
| Form JSX (all `<form>`, `<input>`, `<select>`, `<textarea>`, `<button>` elements) | `src/pages/ContactPage.tsx` |
| Form-specific CSS (inputs, selects, textareas, buttons, status states) | `src/pages/ContactPage.css` |
| `VITE_FORMSPREE_ID` | `.env.example` |

### Add

| Item | File |
|------|------|
| `<iframe>` embed pointing to the Google Form URL | `src/pages/ContactPage.tsx` |
| iframe CSS (width 100%, min-height, border: none) | `src/pages/ContactPage.css` |
| Hardcoded Google Form embed URL constant | `src/pages/ContactPage.tsx` |

### Keep Unchanged

- League info sidebar (team format, obligations, dues summary) — pure static content, no changes needed
- Page layout and outer CSS structure
- `mailto:` link as a plain text fallback alongside the embed (not a code fallback — just visible contact info)

---

## Implementation Notes

- The Google Form embed URL is **not a secret** — hardcode it as a constant in `ContactPage.tsx`. No env var needed.
- Remove the `FormData` interface, `EMPTY_FORM` constant, all `useState` hooks, and the `handleSubmit` function entirely.
- The page becomes a near-static layout: info sidebar + iframe. No async logic.
- Set `loading="lazy"` on the iframe.
- Set a fixed height (e.g. `800px`) or use a tall `min-height` — Google Forms iframes do not auto-resize.

---

## Files to Change

| File | Change Type |
|------|-------------|
| `src/pages/ContactPage.tsx` | Rewrite — remove form logic, add iframe |
| `src/pages/ContactPage.css` | Edit — remove form CSS, add iframe CSS |
| `.env.example` | Edit — remove `VITE_FORMSPREE_ID` block |

---

## Documentation to Update

| Doc | Update |
|-----|--------|
| `docs/features/contact.md` | Rewrite intent, key behaviors, conditional paths, external dependencies, notes |
| `docs/diagrams/features/contact/flowchart.md` | Mark stale — diagram reflects old Formspree flow |
| `docs/features.md` | Set contact row diagram status → `stale` |
| `CHANGELOG.md` | Add entry: replaced Formspree with Google Forms iframe embed |
| `docs/adr/007-google-forms-over-formspree.md` | New ADR — document the decision and rejected alternatives |
| `docs/adr/index.md` | Add ADR-007 row |

### ADR-007 Content Requirements

The ADR must document:

**Decision:** Replace Formspree with a Google Forms iframe embed for the contact form.

**Rejected Alternatives** (all must be in the ADR so they are never re-evaluated):
- **Keep Formspree** — third-party dependency with a free tier submission limit; adds an env var and an external service to maintain
- **Custom serverless endpoint** — overkill for a low-volume contact form; adds backend complexity with no benefit over Google Forms
- **EmailJS** — same class of dependency as Formspree; trades one third-party for another
- **Redirect to Google Form URL** — user leaves the site; worse UX than an iframe
- **Mailto link only** — no structured data capture; submissions are unstructured email threads

**Consequences:**
- Zero external service dependencies for the contact form
- No env var required (`VITE_FORMSPREE_ID` removed)
- Form styling is controlled by Google, not the site theme
- Form fields are managed in Google Forms UI, not in code
- Submissions land directly in Google Forms responses + email notification

---

## Acceptance Criteria

- [ ] Contact page loads with the league info sidebar and a Google Forms iframe
- [ ] The iframe renders the Google Form without errors
- [ ] A form submission in the iframe delivers an email notification to `bowllatenighthappyhour@gmail.com`
- [ ] `VITE_FORMSPREE_ID` is gone from `.env.example` and is not referenced anywhere in the codebase
- [ ] No Formspree URLs remain in the codebase
- [ ] `ContactPage.tsx` has no form state, submit handler, or async logic
- [ ] `docs/adr/007-google-forms-over-formspree.md` exists with all required sections including Rejected Alternatives
- [ ] `docs/adr/index.md` has the ADR-007 row
- [ ] Docs updated per the table above
