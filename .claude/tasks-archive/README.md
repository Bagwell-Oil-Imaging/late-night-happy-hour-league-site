# Task Archive

This directory stores completed GSD task sets, archived automatically by `hooks/archive-completed-tasks.sh` before each new `/gsd:decompose` run.

## Naming Convention

```
<NNN>-<branch-name>/
  REQUIREMENTS.md   # Copy of the source requirements doc
  TASKS.md          # Completed TASKS.md with dependency graph and final statuses
  phase-1/          # Phase subdirectories with individual sub-task specs
  phase-2/
  ...
```

- `NNN` — Zero-padded sequential number (001, 002, 003, ...)
- `branch-name` — Git branch name with slashes replaced by hyphens

## When Archives Are Created

The hook fires on every `/gsd:decompose` invocation:
- If `.claude/tasks/TASKS.md` exists and **all tasks are complete** → archives and clears for new decomposition
- If **incomplete tasks exist** → blocks decomposition and lists pending tasks (must resolve first)
- If no TASKS.md exists → passes through silently (first-time use)
