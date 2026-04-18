---
description: "Guidance on when to create rules, commands, hooks, agents, and skills in .claude/"
paths: [".claude/**/*"]
---

# Claude Code Configuration Guide

## Purpose

This rule provides guidance on when to create each type of `.claude/` configuration as the project evolves. Use this to decide the right mechanism for new automation, constraints, or workflows.

## Configuration Types at a Glance

| Type | Location | Trigger | Purpose |
|------|----------|---------|---------|
| **Rules** | `.claude/rules/` | Automatic (glob match) | Passive context injection when files are touched |
| **Commands** | `.claude/commands/` | Manual (`/command-name`) | User-triggered repeatable prompts |
| **Hooks** | `.claude/settings.json` | Automatic (lifecycle event) | Shell commands that run on tool events |
| **Agents** | `.claude/agents/` | Manual (Agent tool) | Specialized Claude persona with different instructions |
| **Skills** | `.claude/skills/` | Manual (Skill tool) | Complex multi-step orchestrated workflows |

---

## Rules (`.claude/rules/*.md`)

**Create a rule when** you need Claude Code to automatically receive guidance whenever a certain file type is edited. Rules are passive — they add instructions to context but don't execute anything.

### Good use cases

- Enforcing coding standards for specific file types (e.g., assembly commenting style)
- Documentation update requirements when certain files change
- Format and structure constraints for specific documents
- File-type-specific security or quality checklists

### When NOT to use a rule

- The guidance is a one-time action the user triggers → use a **command**
- You need to execute a shell command automatically → use a **hook**
- The guidance applies to all files equally → add it to **CLAUDE.md** directly

### Naming convention

- `<topic>-rules.md` for file-specific rules (e.g., `makefile-rules.md`)
- `<topic>-always.md` for glob `*` rules that load on every file (use sparingly)

---

## Commands (`.claude/commands/*.md`)

**Create a command when** you want a repeatable, user-triggered workflow that runs a specific prompt. Commands are saved prompts optionally accepting `$ARGUMENTS`.

### Good use cases

- Batch documentation sweeps (`/document`)
- Version cutting and changelog updates (`/changelog`)
- Code generation from templates (`/new-module <name>`)
- Audit or review workflows (`/security-audit`)
- Project-specific analysis (`/check-memory-layout`)

### When NOT to use a command

- The guidance should apply automatically when files are touched → use a **rule**
- You need to run a shell script, not a prompt → use a **hook**
- The workflow requires multiple coordinated steps with branching → use a **skill**

### Naming convention

- Use kebab-case: `command-name.md`
- Start the file with a clear instruction line describing what the command does

---

## Hooks (`.claude/settings.json` → `hooks`)

**Create a hook when** you need a real shell command to execute automatically in response to a Claude Code lifecycle event (`PreToolUse`, `PostToolUse`, `Notification`, etc.). Hooks run actual code, not prompts.

### Good use cases

- Running a linter or formatter after file edits
- Validation gates that block actions if checks fail
- Sending notifications when certain events occur
- Checking documentation staleness after source code changes
- Auto-running tests after code modifications

### When NOT to use a hook

- You want to add instructions, not run code → use a **rule**
- The automation should be user-triggered → use a **command**
- The logic is complex and needs Claude's reasoning → use a **skill** or **command**

### Important notes

- Hooks execute shell commands — keep them fast and reliable
- Hook stdout/stderr feeds back to Claude as context
- A failing hook can block the action, so handle errors carefully
- Define hooks in `.claude/settings.json` under the `hooks` key

---

## Agents (`.claude/agents/*.md`)

**Create an agent when** a task benefits from a fundamentally different Claude persona, instruction set, or focus area that would conflict with or clutter the main context.

### Good use cases

- **Security reviewer** - Audits code with a security-first mindset and different priorities
- **Test writer** - Focused solely on generating comprehensive test cases
- **Documentation specialist** - Deep-dives into docs without the code-editing context
- **Architecture advisor** - Evaluates design decisions with a broader perspective
- **Performance analyzer** - Reviews code specifically for optimization opportunities

### When NOT to use an agent

- The task fits within the normal development flow → just use Claude Code directly
- You need a one-off prompt → use a **command**
- The different behavior is file-type-specific → use a **rule**

### Naming convention

- Use descriptive kebab-case: `security-reviewer.md`, `test-writer.md`
- Start the file with the agent's role and constraints

---

## Skills (`.claude/skills/*.md`)

**Create a skill when** you need a complex, multi-step orchestrated workflow that goes beyond what a single prompt command can handle. Skills can define sequences of actions, decision points, and tool usage patterns.

### Good use cases

- **New module scaffold** - Create source files, update Makefile, add tests, update all docs in one coordinated flow
- **Release process** - Run tests, cut changelog version, tag commit, update supported versions
- **Migration workflows** - Rename/move code across files with coordinated updates
- **Full feature implementation** - Guided multi-phase process from design to tests to docs

### When NOT to use a skill

- A single prompt achieves the goal → use a **command**
- The workflow is purely shell-based → use a **hook**
- The guidance is passive and file-triggered → use a **rule**

### Naming convention

- Use descriptive kebab-case: `new-module.md`, `release-process.md`
- Structure the file with clear phases/steps

---

## Decision Flowchart

```
Is it passive guidance triggered by editing files?
  YES → RULE
  NO  ↓

Does it need to run a shell command automatically?
  YES → HOOK
  NO  ↓

Is it a user-triggered action?
  YES → Is it a single prompt or simple workflow?
          YES → COMMAND
          NO  → Does it need multiple coordinated phases?
                  YES → SKILL
                  NO  → COMMAND
  NO  ↓

Does it need a different Claude persona or instruction set?
  YES → AGENT
  NO  → Add guidance directly to CLAUDE.md or a RULE
```

## Companion Updates

When creating any new `.claude/` configuration:

1. **CLAUDE.md** - Update Project Structure tree to include the new file
2. **README.md** - Update Project Structure tree to match
3. **CHANGELOG.md** - Add entry under `[Unreleased] > Added`
4. **CONTRIBUTING.md** - Update if it changes development workflow or conventions
