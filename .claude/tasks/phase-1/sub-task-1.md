---
id: "phase-1/sub-task-1"
title: "Rewrite ContactPage.tsx — replace form with Google Forms iframe"
phase: 1
task: 1
status: pending
depends_on: []
blocks: ["phase-1/sub-task-2", "phase-2/sub-task-1", "phase-2/sub-task-2"]
branch: "refactor/contact-google-forms"
commit_prefix: "refactor(phase-1/task-1)"
estimated_files: 1
---

# Phase 1 / Sub-Task 1: Rewrite ContactPage.tsx — replace form with Google Forms iframe

## Summary

Remove all Formspree-dependent form logic from `ContactPage.tsx` and replace the right-hand form panel with a Google Forms iframe embed. The info sidebar (left column) is kept entirely unchanged. The page becomes a near-static layout — no React state, no async logic, no external service dependency.

## Implementation Plan

1. **Remove imports** — Delete the `useState` import (no longer needed). Keep `import './ContactPage.css'`.

2. **Remove type definitions** — Delete `FormStatus` type, `FormData` interface, and `EMPTY_FORM` constant entirely.

3. **Remove FORMSPREE_URL constant** — Delete the `FORMSPREE_URL` block (lines referencing `import.meta.env.VITE_FORMSPREE_ID`).

4. **Add GOOGLE_FORM_URL constant** — Add this at the top of the file after the CSS import:
   ```ts
   const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSexNSK5RYx5bN1GbwLcjFwQidHfNz8KguspWBHX6ZT8eJo0YA/viewform?embedded=true'
   ```

5. **Simplify the component function** — The function body becomes just a `return` statement with no hooks. Remove `const [form, ...]`, `const [status, ...]`, `const set = ...`, and the entire `handleSubmit` function.

6. **Replace the form panel JSX** — The `<div className="contact-form-panel">` currently contains a conditional success state and a `<form>`. Replace its contents with:
   ```tsx
   <div className="contact-form-panel">
     <h3 className="form-panel-title">Express Interest</h3>
     <iframe
       src={GOOGLE_FORM_URL}
       className="contact-iframe"
       title="League interest form"
       loading="lazy"
     >
       Loading…
     </iframe>
   </div>
   ```
   Do NOT use `width`, `height`, `frameborder`, `marginheight`, or `marginwidth` attributes — all sizing is handled via CSS class `contact-iframe`.

7. **Keep sidebar unchanged** — The entire `<aside className="contact-info">` block is untouched.

8. **Verify the component is a clean function** — Final shape:
   ```tsx
   import './ContactPage.css'

   const GOOGLE_FORM_URL = '...'

   function ContactPage() {
     return (
       <div className="contact-page">
         {/* header */}
         <div className="contact-layout">
           <aside className="contact-info">...</aside>
           <div className="contact-form-panel">
             <h3 className="form-panel-title">Express Interest</h3>
             <iframe src={GOOGLE_FORM_URL} className="contact-iframe" title="League interest form" loading="lazy">Loading…</iframe>
           </div>
         </div>
       </div>
     )
   }

   export default ContactPage
   ```

## File Operations

### Edit
- `src/pages/ContactPage.tsx` — Remove all form state, Formspree logic, and form JSX; add GOOGLE_FORM_URL constant and iframe embed

## Dependencies

### Depends On
— (none)

### Blocks
- `phase-1/sub-task-2` — CSS cleanup needs to know the final JSX class names in use
- `phase-2/sub-task-1` — ADR documents what was implemented
- `phase-2/sub-task-2` — Feature doc update reflects the final page behavior

## Acceptance Criteria

- [ ] `ContactPage.tsx` has no `useState`, no `FormData`, no `FormStatus`, no `EMPTY_FORM`, no `handleSubmit`, no `FORMSPREE_URL`
- [ ] `GOOGLE_FORM_URL` constant is hardcoded with the correct Google Forms embed URL
- [ ] An `<iframe>` renders in the right panel using `className="contact-iframe"` and `loading="lazy"`
- [ ] The info sidebar JSX is identical to the original
- [ ] TypeScript compiles without errors (`tsc --noEmit`)
- [ ] No reference to `formspree.io` or `VITE_FORMSPREE_ID` remains in the file

## Commit Convention

`refactor(phase-1/task-1): replace Formspree form with Google Forms iframe embed`
