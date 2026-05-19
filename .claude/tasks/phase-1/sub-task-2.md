---
id: "phase-1/sub-task-2"
title: "Clean up ContactPage.css — remove form CSS, add iframe styles"
phase: 1
task: 2
status: pending
depends_on: ["phase-1/sub-task-1"]
blocks: ["phase-2/sub-task-2"]
branch: "refactor/contact-google-forms"
commit_prefix: "refactor(phase-1/task-2)"
estimated_files: 1
---

# Phase 1 / Sub-Task 2: Clean up ContactPage.css — remove form CSS, add iframe styles

## Summary

Remove all CSS blocks that styled the now-deleted custom form elements and add a single `.contact-iframe` rule for the Google Forms embed. The page layout, info sidebar, and form panel wrapper styles are kept intact.

## Implementation Plan

1. **Delete form-specific CSS blocks** — Remove the following sections entirely:
   - `/* ── Form elements ── */` section: `.contact-form`, `.form-row`, `.form-group`, `.form-label`, `.required`, `.form-input`, `.form-select`, `.form-textarea`, focus states, placeholder states, select option styles
   - `/* ── Submit button ── */` section: `.btn-submit` and its hover/disabled variants
   - `/* ── Secondary button ── */` section: `.btn-secondary` and its hover variant
   - `/* ── Status states ── */` section: `.form-error`, `.form-hint`, `.form-hint code`
   - `/* ── Success state ── */` section: `.form-success`, `.success-icon`, `.success-heading`, `.success-body`

2. **Keep all sidebar and layout CSS** — The following blocks survive unchanged:
   - `.contact-page`, `.contact-intro`
   - `.contact-layout` (grid layout)
   - `.contact-info` and all `.info-card*` variants
   - `.info-card-title`, `.email-link`, `.email-icon`
   - `.info-list`, `.info-list li`, `.info-bullet`
   - `.info-card-dues`, `.dues-disclaimer`
   - `.info-card-bylaws`, `.bylaws-note`, `.inline-link`
   - `.contact-form-panel`, `.form-panel-title`
   - All `@media` responsive blocks (update any responsive rules that referenced removed classes)

3. **Add iframe rule** — After `.form-panel-title`, add:
   ```css
   /* ── Google Forms embed ──────────────────────────────────────────────────── */
   .contact-iframe {
     width: 100%;
     height: 1357px;
     border: none;
     display: block;
   }
   ```

4. **Clean up responsive blocks** — In the `@media (max-width: 560px)` block, remove the `.form-row` and `.btn-submit` rules since those classes no longer exist. Keep `.contact-form-panel` padding override.

## File Operations

### Edit
- `src/pages/ContactPage.css` — Remove ~160 lines of form/button/status CSS; add 6-line `.contact-iframe` rule

## Dependencies

### Depends On
- `phase-1/sub-task-1` — Must know which CSS classes remain in the JSX before pruning

### Blocks
- `phase-2/sub-task-2` — Feature doc should reflect final CSS state

## Acceptance Criteria

- [ ] `.contact-iframe` rule exists with `width: 100%`, `height: 1357px`, `border: none`, `display: block`
- [ ] No `.form-input`, `.form-select`, `.form-textarea`, `.btn-submit`, `.btn-secondary`, `.form-success`, `.form-error` rules remain
- [ ] `.contact-form-panel` and `.form-panel-title` rules are retained
- [ ] All `@media` breakpoints still compile without referencing removed classes
- [ ] No unused CSS rules remain for classes that no longer exist in the JSX

## Commit Convention

`refactor(phase-1/task-2): remove form CSS and add contact-iframe styles`
