---
description: "README.md section structure, update triggers, and style guidelines"
paths: ["README.md"]
---

# README.md Update Rules

## Purpose

README.md is the public-facing entry point for the project. Keep it accurate, concise, and useful for both new contributors and users.

## Required Sections (maintain this order)

1. **Title + Description** - One-liner about what Bagwell OS is
2. **Features** - Bullet list of implemented capabilities (update as features land)
3. **Getting Started** - Prerequisites, building, running
4. **Documentation Workflow** - Claude Code automation overview
5. **Project Structure** - Tree view of the repository (must mirror reality)
6. **Contributing** - Link to CONTRIBUTING.md
7. **Security** - Link to SECURITY.md
8. **License** - Link to LICENSE

## When to Update README.md

- A new build target is added to the Makefile
- Prerequisites or toolchain requirements change
- A user-visible feature is added or removed
- The project structure changes (new directories or key files)
- Build/run instructions change
- A new documentation command or workflow is added

## Style Guidelines

- Use code blocks with language hints for all commands (`bash`, `makefile`, etc.)
- Keep descriptions factual, not aspirational - only document what exists
- The Project Structure tree must exactly match the actual repository layout
- Use relative links for internal references: `[CONTRIBUTING.md](CONTRIBUTING.md)`
- Do NOT add badges, shields, or external images without user approval
