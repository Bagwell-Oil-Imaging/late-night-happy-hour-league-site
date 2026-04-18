---
description: "Pre-completion documentation checklist and cross-reference map for all file changes"
paths: ["**/*"]
---

# Documentation Sync - Global Rule

## Pre-Completion Checklist

Before marking ANY task as complete, verify these documentation files are in sync:

| File | Check |
|------|-------|
| `CHANGELOG.md` | Has an `[Unreleased]` entry for every meaningful change made this session |
| `README.md` | Project Structure tree matches actual repo; build instructions are current |
| `CLAUDE.md` | Project Structure tree matches actual repo; under 1000 lines |
| `CONTRIBUTING.md` | Development setup steps match current build process |
| `SECURITY.md` | Supported versions table is current |
| `ROADMAP.md` | Milestone tasks reflect current plans; completed items moved to CHANGELOG |
| `Makefile` | All source files are included in build; help target lists all targets |

## File Cross-Reference Map

Changes to one file often require updates to others:

```
Source code changed
  -> CHANGELOG.md (always)
  -> README.md (if public-facing)
  -> CLAUDE.md (if structural/architectural)

Makefile changed
  -> CHANGELOG.md + README.md + CONTRIBUTING.md

New directory or file added
  -> CLAUDE.md (Project Structure) + README.md (Project Structure)

New feature planned or completed
  -> ROADMAP.md (add/update task status)
  -> CHANGELOG.md (when completed)

Version released
  -> CHANGELOG.md (cut version) + SECURITY.md (Supported Versions)
  -> ROADMAP.md (move completed items to Completed Milestones)
```

## Do NOT

- Leave placeholder text like "TBD" or "TODO" in documentation without flagging it to the user
- Add speculative documentation about features that don't exist yet
- Duplicate the same information across multiple files - reference/link instead
- Let Project Structure trees in CLAUDE.md and README.md diverge from each other or from reality
