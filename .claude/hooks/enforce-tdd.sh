#!/usr/bin/env bash
# =============================================================================
# Hook: enforce-tdd.sh
# Event: PreToolUse (Edit|Write)
# Purpose: Enforce Test-Driven Development by warning when source files are
#          edited without a corresponding test file existing in the project.
#
# Behavior:
#   - Extracts the file path from the tool input (JSON on stdin)
#   - Skips non-source files (docs, configs, test files themselves)
#   - Searches for a matching test file using common naming conventions
#   - Warns (exit 0) if no test file is found — does NOT block the edit
#
# Configuration:
#   - SOURCE_EXTENSIONS: File extensions considered "source code"
#   - TEST_DIRS: Directories where test files commonly live
#   - SKIP_PATTERNS: Regex patterns for files to skip (tests, configs, docs)
#
# To customize per-stack: Only modify the Configuration section below.
# =============================================================================

# ─── Configuration ───────────────────────────────────────────────────────────
# File extensions that are considered source code (space-separated).
# Add or remove extensions when adopting a specific tech stack.
SOURCE_EXTENSIONS="c h cpp hpp cc cxx asm s py rs go js ts jsx tsx java cs rb swift kt"

# Directories where test files are commonly found (space-separated).
# These are searched in addition to the source file's own directory.
TEST_DIRS="tests test spec __tests__ test_suite"

# Regex pattern for files to SKIP (already test files, configs, docs, etc.).
# Files matching this pattern are not checked for a test companion.
SKIP_PATTERNS="(test_|_test\.|\.test\.|\.spec\.|_spec\.|tests/|test/|spec/|__tests__/|\.md$|\.txt$|\.json$|\.yaml$|\.yml$|\.toml$|\.cfg$|\.ini$|\.xml$|Makefile|CMakeLists|\.cmake$|\.gitignore$|\.env)"
# ─────────────────────────────────────────────────────────────────────────────

# Read the tool input from stdin (JSON with tool_name and tool_input fields).
INPUT=$(cat 2>/dev/null)

# Extract the file_path from the JSON input.
# Uses grep/sed for portability (no jq dependency).
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# If we couldn't extract a file path, skip the check.
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Get just the filename and extension.
FILENAME=$(basename "$FILE_PATH")
EXTENSION="${FILENAME##*.}"

# Check if this is a source file (by extension).
IS_SOURCE="false"
for ext in $SOURCE_EXTENSIONS; do
    if [ "$EXTENSION" = "$ext" ]; then
        IS_SOURCE="true"
        break
    fi
done

# If not a source file, skip the check.
if [ "$IS_SOURCE" = "false" ]; then
    exit 0
fi

# If the file matches skip patterns (it's already a test file, config, etc.), skip.
if echo "$FILE_PATH" | grep -qEi "$SKIP_PATTERNS"; then
    exit 0
fi

# Extract the base name without extension for test file searching.
BASENAME="${FILENAME%.*}"

# Build a list of test file patterns to search for.
# Common conventions across languages:
#   test_foo.ext, foo_test.ext, foo.test.ext, foo.spec.ext,
#   test_foo.ext in tests/ directory, etc.
TEST_PATTERNS=(
    "test_${BASENAME}.*"
    "${BASENAME}_test.*"
    "${BASENAME}.test.*"
    "${BASENAME}.spec.*"
    "${BASENAME}_spec.*"
    "Test${BASENAME}.*"
    "${BASENAME}Test.*"
    "${BASENAME}Tests.*"
)

# Search for test files in the project.
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
FOUND_TEST=""

for pattern in "${TEST_PATTERNS[@]}"; do
    # Search in common test directories and the source file's directory.
    RESULT=$(find "$PROJECT_ROOT" -name "$pattern" -type f 2>/dev/null | head -1)
    if [ -n "$RESULT" ]; then
        FOUND_TEST="$RESULT"
        break
    fi
done

# If no test file was found, warn the developer and suggest the correct path.
if [ -z "$FOUND_TEST" ]; then
    # Compute the suggested test file path using the __tests__/ mirror convention.
    # For a source file at src/lib/foo.ts, the test should be at src/__tests__/lib/foo.test.ts.
    SUGGESTED_PATH=""
    # Check if the file path contains a src/ directory (standard project layout).
    if echo "$FILE_PATH" | grep -q "src/"; then
        # Extract the relative path after "src/" (e.g., "lib/foo.ts" from "src/lib/foo.ts").
        REL_PATH=$(echo "$FILE_PATH" | sed 's|.*src/||')
        # Strip the file extension and append .test.<ext> to build the mirror path.
        REL_DIR=$(dirname "$REL_PATH")
        REL_BASE="${REL_PATH##*/}"
        REL_BASE_NO_EXT="${REL_BASE%.*}"
        REL_EXT="${REL_BASE##*.}"
        # Build the suggested test path: src/__tests__/<relative-dir>/<name>.test.<ext>
        if [ "$REL_DIR" = "." ]; then
            SUGGESTED_PATH="src/__tests__/${REL_BASE_NO_EXT}.test.${REL_EXT}"
        else
            SUGGESTED_PATH="src/__tests__/${REL_DIR}/${REL_BASE_NO_EXT}.test.${REL_EXT}"
        fi
    fi

    # Build the warning message with the suggested path if available.
    if [ -n "$SUGGESTED_PATH" ]; then
        echo "TDD REMINDER: No test file found for '${FILENAME}'. Create a test at: ${SUGGESTED_PATH}"
    else
        echo "TDD REMINDER: No test file found for '${FILENAME}'. Consider writing tests first (test_${BASENAME}.*, ${BASENAME}_test.*, ${BASENAME}.test.*, or ${BASENAME}.spec.*)."
    fi
fi

# Always exit 0 — warn only, never block. TDD is encouraged, not enforced by gate.
exit 0
