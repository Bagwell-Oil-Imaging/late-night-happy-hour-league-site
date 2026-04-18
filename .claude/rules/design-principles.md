---
description: "Enforce software design principles when writing or modifying source code"
paths: ["**/*.c", "**/*.h", "**/*.cpp", "**/*.asm", "**/*.s", "**/*.S", "**/*.py", "**/*.rs", "**/*.zig", "**/*.go", "**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "**/*.ld"]
---

# Software Design Principles - Enforcement Checklist

The canonical definitions of all 15 principles live in `CONTRIBUTING.md` under "Software Design Principles." This rule provides the **actionable checklist** Claude Code applies when writing or modifying source code.

## Before Writing Code

Ask yourself:
- Is this the **simplest approach** that solves the problem? (KISS)
- Am I building something that **isn't needed yet**? (YAGNI)
- Does similar logic **already exist** elsewhere that I should reuse? (DRY)

## While Writing Code

### Structure and Responsibility
- [ ] Each function does **one thing** (SRP)
- [ ] Each file/module addresses **one concern** (SoC)
- [ ] Related functionality is **grouped together**; unrelated functionality is **separated** (High cohesion, low coupling)
- [ ] New behavior is added via **new code**, not by modifying stable existing code (OCP)

### Dependencies and Coupling
- [ ] Modules communicate through **well-defined interfaces**, not by reaching into internals (Low coupling)
- [ ] Functions only access **their own data and direct parameters**, not deeply nested structures (LoD)
- [ ] Dependencies point toward **abstractions** (function pointers, interfaces), not concrete implementations (DIP)
- [ ] Headers expose **only what consumers need** (ISP)

### Behavior and Side Effects
- [ ] Functions **either return data or perform an action**, not both (CQS)
- [ ] Pure logic is **separated from side effects** (I/O, hardware access) where feasible (Referential transparency)
- [ ] Initialization and setup routines are **safe to call more than once** where applicable (Idempotency)

### Clarity and Style
- [ ] Names are **descriptive and consistent** with existing codebase conventions (Consistency over cleverness)
- [ ] Code is **self-documenting** with comments explaining "why," not "what" (Documentation done right)
- [ ] Behavior is built from **composed components**, not deep hierarchies (Composition over inheritance)

### Robustness
- [ ] Inputs are **validated at module boundaries** (Defensive programming)
- [ ] Return values from allocations and system calls are **checked** (Defensive programming)
- [ ] Error handling is **graceful and predictable** (Robustness)

### Performance
- [ ] Optimizations are **justified by measurement**, not speculation (Avoid premature optimization)
- [ ] Clear, correct code is **preferred over clever fast code** unless profiling proves otherwise

### Testability
- [ ] Functions have **clear inputs and outputs** that are easy to test in isolation (Testability)
- [ ] Hidden global state is **avoided or minimized** (Testability + Referential transparency)

## During Code Review (Self-Check)

Before completing a task, scan the diff and verify:

1. **No copy-pasted blocks** - Extract to a shared function if duplicated (DRY)
2. **No speculative features** - Remove anything not required by the current task (YAGNI)
3. **No unnecessary complexity** - Simplify if a simpler approach works (KISS)
4. **Consistent style** - Naming, formatting, and patterns match the rest of the codebase
5. **Docs updated** - Inline comments and docstrings reflect the current code (see `source-code-docs.md`)

## Principle Quick Reference

| # | Principle | One-Line Rule |
|---|-----------|---------------|
| 1 | DRY | One representation per piece of knowledge |
| 2 | KISS | Simplest solution that works |
| 3 | YAGNI | Build only what's needed now |
| 4 | SOLID | SRP + OCP + LSP + ISP + DIP |
| 5 | SoC | One concern per module |
| 6 | Cohesion/Coupling | Related together, unrelated apart |
| 7 | Composition > Inheritance | Compose, don't inherit |
| 8 | Law of Demeter | Talk to neighbors only |
| 9 | CQS | Query or command, not both |
| 10 | Consistency | Obvious and uniform style |
| 11 | Testability | Easy to test in isolation |
| 12 | Defensive Programming | Validate at boundaries, handle errors |
| 13 | Documentation | Comments explain "why" |
| 14 | No Premature Optimization | Measure first, then optimize |
| 15 | Idempotency | Same input, same result, no surprises |
