# ADR-006: Feature Registry as Documentation and Diagram Index

**Status:** Accepted
**Date:** 2026-05-18

## Context

The codebase has 22 user-facing features spread across public pages, admin panels, a data pipeline, and shared infrastructure. Documentation existed at the architectural level (ADRs) and the issue level (known-issues.md) but had no feature-level index. This created two problems:

1. When source files were edited, there was no way to know which user-facing feature was affected — making it hard to decide whether docs, diagrams, or changelog entries needed updating.
2. Mermaid diagrams (being planned) had no anchor — GitNexus names processes by implementation symbol (`BowlersPage → UseCollection`) not by user-facing feature name ("Bowler Profiles"), making generated diagrams confusing to read.

A feature registry solves both: it translates implementation paths to product vocabulary and provides the source-file-to-feature mapping needed for automated staleness detection.

## Decision

Maintain `docs/features.md` as a Markdown table mapping each user-facing feature to:
- A plain-English description
- Its primary source file(s) (`Key Source Paths`)
- A link to its Mermaid diagram once generated
- A status field (`current`, `stale`, `no diagram`, `blocked`)

Automation operates at two levels:
- **Machine rule** (`~/.claude/rules/feature-source-link.md`): when Claude edits a source file, it reads `docs/features.md`, finds matching feature rows, and reports which feature is affected.
- **Repo hook** (`.claude/hooks/flag-feature-stale.sh`): shell-level PostToolUse hook that greps `docs/features.md` for the edited filename and outputs matching feature names to Claude's context.

The feature registry is also the input to the planned `/generate-diagrams` skill — one Mermaid diagram per feature row, stored in `docs/diagrams/`.

## Rejected Alternatives

- **GitNexus processes as diagram anchors** — GitNexus names processes by implementation symbols, not product vocabulary. Diagrams anchored to `BowlersPage → UseCollection` are meaningful to developers but opaque to anyone reading docs for context.
- **ADRs as feature documentation** — ADRs capture decisions, not features. Conflating them creates ADRs that are too narrow (one per feature) or too broad (one per feature area), and they don't carry the source-path mapping needed for automation.
- **No feature registry, diagrams only** — Without a registry, diagram filenames and content have no agreed-upon anchor. Two sessions might generate different diagrams for the same feature under different names.
- **Separate YAML manifest** — A YAML file for machine parsing and a Markdown file for human reading is two files to maintain. A Markdown table is parseable enough for grep-based hooks and human-readable simultaneously.

## Consequences

- `docs/features.md` must be updated when features are added, removed, or their key source files move. The machine rule and repo hook prompt this but do not enforce it.
- The `Key Source Paths` column uses basename matching in the hook — false positives are possible if two source files share a name. Acceptable for this repo's size; revisit if the repo grows significantly.
- Diagrams in `docs/diagrams/` don't exist yet — the `Status` column starts as `no diagram` for all rows until `/generate-diagrams` is run.

## Revisit When

- The repo grows to 40+ features and the single-table format becomes hard to navigate (consider splitting by section into separate files)
- A `/generate-diagrams` skill is implemented (update this ADR to reference it)
- Basename matching causes false positives in the staleness hook (switch to relative-path matching)
