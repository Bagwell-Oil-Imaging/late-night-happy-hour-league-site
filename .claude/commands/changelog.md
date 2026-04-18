# Update Changelog

Review recent changes and update CHANGELOG.md appropriately.

## Steps

1. Run `git diff --name-only` and `git diff --cached --name-only` to see current uncommitted changes
2. Run `git log --oneline -20` to see recent commits for context
3. Read the current `CHANGELOG.md`
4. Determine which changes need changelog entries by analyzing:
   - New files or features added
   - Modifications to existing functionality
   - Bug fixes
   - Removed code or features
   - Security-related changes
   - Deprecations
5. Add entries under `[Unreleased]` using the correct categories:
   - **Added** - New features
   - **Changed** - Changes to existing functionality
   - **Deprecated** - Features marked for future removal
   - **Removed** - Features that were deleted
   - **Fixed** - Bug fixes
   - **Security** - Vulnerability fixes
6. Each entry should be:
   - A concise, human-readable sentence
   - Starting with a verb (Add, Update, Fix, Remove, etc.)
   - Describing the change from a user/developer perspective
7. If the user provides a version number via $ARGUMENTS, create a new version section:
   - Move all `[Unreleased]` entries into a new `[X.Y.Z] - YYYY-MM-DD` section
   - Add a fresh empty `[Unreleased]` section above it
8. Report what was added to the changelog
