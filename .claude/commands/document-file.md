# Document a Specific File

Thoroughly document the file specified by the user: $ARGUMENTS

## Steps

1. Read the target file completely
2. For every function, class, method, and module in the file:
   - Add or update docstrings with: purpose, parameters (with types), return values, exceptions, and side effects
   - Add inline comments for any non-obvious code blocks
   - Explain the "why" behind complex logic
3. Add a file-level header comment/docstring if one doesn't exist, describing:
   - The file's purpose and responsibility
   - Key dependencies or relationships to other files
   - Usage examples if applicable
4. If the file introduces or modifies public APIs:
   - Update `README.md` accordingly
5. If the file represents a meaningful change:
   - Add an entry to `CHANGELOG.md` under `[Unreleased]`
6. Report a summary of all documentation added/updated
