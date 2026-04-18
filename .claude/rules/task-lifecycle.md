# Task Lifecycle Rule

**Globs:** `.claude/tasks/**`, `REQUIREMENTS-*.md`

This rule provides passive context about the GSD task decomposition lifecycle,
archive conventions, and naming schemes. It loads automatically whenever task
files or requirements documents are touched.

---

## Requirements File Naming Convention

Requirements documents that feed into `/gsd:decompose` follow a branch-based
naming scheme:

```
REQUIREMENTS-<branch-name>.md
```

- The `<branch-name>` portion matches the git feature branch (with slashes
  replaced by hyphens if present in the branch name).
- Example: branch `feature/testing-automation` produces
  `REQUIREMENTS-feature-testing-automation.md`.
- The requirements file lives in the **project root**, not inside `.claude/`.

## Archive Convention

When a GSD task set is fully completed and a new `/gsd:decompose` is triggered,
the `archive-completed-tasks.sh` hook automatically moves the completed tasks
into the archive directory:

```
.claude/tasks-archive/<NNN>-<branch-name>/
```

### Archive Naming Scheme

| Component | Description |
|-----------|-------------|
| `NNN` | Zero-padded sequential number (001, 002, 003, ...) |
| `<branch-name>` | Git branch name with slashes replaced by hyphens |

Examples:
- `001-feature-bagwell-assistant-mvp/` — first archive, from the `feature/bagwell-assistant-mvp` branch
- `002-feature-testing-automation/` — second archive, from the `feature/testing-automation` branch

### Archive Contents

Each archive directory contains an immutable snapshot of the completed task set:

```
<NNN>-<branch-name>/
  REQUIREMENTS.md   # Copy of the source REQUIREMENTS-<branch>.md
  TASKS.md           # The completed TASKS.md with dependency graph and status
  phase-1/           # Phase subdirectories with individual sub-task specs
  phase-2/
  ...
```

### Auto-Archive Hook Behavior

The `archive-completed-tasks.sh` hook runs as a `PreToolUse(Skill)` hook before
`/gsd:decompose`. Its behavior:

1. **No existing TASKS.md** -- Passes through silently (first-time decompose).
2. **All tasks completed** -- Archives the task set, clears `.claude/tasks/` for
   the new decomposition.
3. **Incomplete tasks found** -- **Blocks** the decompose with exit code 2 and
   lists which tasks are still pending or in-progress. The user must complete or
   manually remove tasks before re-running decompose.

## Referencing Archived Tasks

When writing retroactive tests or reviewing past work, reference archived task
sets by their archive path:

```
.claude/tasks-archive/<NNN>-<branch-name>/TASKS.md
```

- Use the archive's `TASKS.md` to find the original sub-task specs, dependency
  graph, and commit hashes for each completed sub-task.
- Use the archive's `REQUIREMENTS.md` to review the original requirements that
  drove the decomposition.
- Phase subdirectories contain the individual sub-task markdown files with
  implementation plans, file operations, and acceptance criteria.

This is especially useful when:
- Writing tests for features that were implemented in a previous task set
- Understanding the rationale behind architectural decisions made during a
  prior decomposition cycle
- Auditing the commit history for a specific feature branch
