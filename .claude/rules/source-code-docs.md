---
description: "Documentation sync requirements when source code files are modified"
paths: ["**/*.c", "**/*.h", "**/*.cpp", "**/*.asm", "**/*.s", "**/*.S", "**/*.py", "**/*.rs", "**/*.zig", "**/*.go", "**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx", "**/*.ld"]
---

# Source Code Documentation Sync

When modifying ANY source code file, you MUST also update the relevant root documentation files. This is non-negotiable.

## Mandatory After Every Source Code Change

1. **CHANGELOG.md** - Add an entry under `[Unreleased]` with the appropriate category (Added/Changed/Fixed/etc.)
2. **Inline docs** - Every modified function/class/module gets a complete docstring with purpose, params, returns, and side effects

## Conditional Updates (check if applicable)

| If the change...                          | Then update...        |
|-------------------------------------------|-----------------------|
| Adds/removes/modifies a build target      | `Makefile` + `README.md` (Building section) |
| Introduces a new source file or directory | `CLAUDE.md` (Project Structure) + `README.md` (Project Structure) |
| Changes build prerequisites or toolchain  | `README.md` (Prerequisites) + `CONTRIBUTING.md` (Development Setup) |
| Adds a new feature or public API          | `README.md` (features/usage) |
| Modifies security-sensitive code          | `SECURITY.md` (if it affects security posture) |
| Changes coding conventions or patterns    | `CONTRIBUTING.md` (Coding Standards) |
| Introduces a known limitation or bug      | `CLAUDE.md` (Known Issues) |
| Makes an architecture decision            | `CLAUDE.md` (Architecture Decisions) |
| Completes a planned roadmap feature       | `ROADMAP.md` (mark `[x]`) |

## Language-Specific Commenting Standards

- **TypeScript/React (.ts/.tsx)**: Use JSDoc (`/** ... */`) for all functions, components, interfaces, and type aliases. Include `@param`, `@returns`, and prop descriptions. See `react-conventions.md` and `api-conventions.md` for detailed patterns.
- **Assembly files (.asm/.s/.S)**: Comment every instruction block explaining what it does at the hardware level. Include register usage notes.
- **C/C++ files**: Use Doxygen-style comments (`/** ... */`) for all functions and structs. Include `@param`, `@return`, `@brief`, `@note`.
- **Linker scripts (.ld)**: Comment every section and memory region with its purpose and address range rationale.
