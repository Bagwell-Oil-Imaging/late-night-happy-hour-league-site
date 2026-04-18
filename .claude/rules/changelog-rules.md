---
description: "Keep a Changelog format enforcement and version cutting rules"
paths: ["CHANGELOG.md"]
---

# CHANGELOG.md Update Rules

## Format: Keep a Changelog 1.1.0

- All entries go under `## [Unreleased]` until a version is tagged
- Use EXACTLY these categories (in this order, only include categories that have entries):
  - `### Added` - New features, files, capabilities
  - `### Changed` - Modifications to existing functionality
  - `### Deprecated` - Features marked for future removal
  - `### Removed` - Deleted features or files
  - `### Fixed` - Bug fixes
  - `### Security` - Vulnerability fixes

## Entry Format

- One bullet per change: `- Verb-first concise description`
- Good: `- Add GDT initialization in protected mode entry`
- Bad: `- Updated the GDT stuff` (vague, past tense)
- Group related sub-changes under a single bullet with sub-items if needed
- Never duplicate existing entries; amend them if the scope expands

## Version Cutting

When the user runs `/changelog <version>`:
1. Create `## [X.Y.Z] - YYYY-MM-DD` below `## [Unreleased]`
2. Move all unreleased entries into the new version section
3. Leave `## [Unreleased]` empty but present
4. Add comparison links at the bottom if a repository URL exists

## Semantic Versioning

- **MAJOR (X)**: Breaking changes, incompatible API changes
- **MINOR (Y)**: New features, backward-compatible additions
- **PATCH (Z)**: Bug fixes, documentation-only changes
