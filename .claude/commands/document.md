# Document All Changes

Perform a comprehensive documentation sweep for all files changed since the last commit.

## Steps

1. Run `git diff --name-only` and `git diff --cached --name-only` to identify all changed files
2. For each changed source code file:
   - Ensure all functions, classes, and modules have complete docstrings/comments
   - Add inline comments for any complex or non-obvious logic
   - Verify type annotations are present where applicable
3. Review `README.md`:
   - Update if any public APIs, build steps, configuration, dependencies, or usage examples changed
   - Add any new sections needed for new features
4. Review `CHANGELOG.md`:
   - Add entries under `[Unreleased]` for each meaningful change
   - Use the correct category (Added, Changed, Fixed, etc.)
   - Write concise, human-readable descriptions starting with a verb
5. Review `CLAUDE.md`:
   - Update project structure if new files/directories were added
   - Update architecture decisions if relevant
   - Add any new known issues discovered
6. Review `CONTRIBUTING.md`:
   - Update if development setup, coding standards, testing requirements, or contribution process changed
7. Review `SECURITY.md`:
   - Update if security policies, supported versions, or security-related features changed
8. Summarize all documentation updates made
