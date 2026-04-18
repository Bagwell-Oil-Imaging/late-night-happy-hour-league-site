#!/usr/bin/env bash
# =============================================================================
# Hook: auto-format.sh
# Event: PostToolUse (Edit|Write)
# Purpose: Automatically detect and run the appropriate code formatter on
#          files after they are modified.
#
# Behavior:
#   - Extracts the file path from the tool input (JSON on stdin)
#   - Detects available formatters by checking config files and binaries
#   - Runs the first matching formatter on the changed file
#   - Outputs what was done (or skipped) for Claude's awareness
#
# Configuration:
#   - FORMATTER_MAP: Associative array mapping extensions to formatter commands
#   - CONFIG_DETECTION: Config files that indicate which formatter to use
#
# To customize per-stack: Update FORMATTER_MAP with your project's formatters.
# =============================================================================

# ─── Configuration ───────────────────────────────────────────────────────────
# File extensions to skip formatting (non-code files).
SKIP_EXTENSIONS="md txt json yaml yml toml xml csv lock png jpg gif svg ico pdf"

# Formatter detection order. The script checks for config files first,
# then falls back to extension-based detection.
#
# Format: "config_file|command_to_check|format_command_template"
# Use {file} as a placeholder for the file path.
#
# Add your project's formatters here. Entries are checked in order;
# the first match wins.
CONFIG_FORMATTERS=(
    ".clang-format|clang-format|clang-format -i {file}"
    ".prettierrc|prettier|prettier --write {file}"
    ".prettierrc.json|prettier|prettier --write {file}"
    ".prettierrc.js|prettier|prettier --write {file}"
    "prettier.config.js|prettier|prettier --write {file}"
    "prettier.config.mjs|prettier|prettier --write {file}"
    "biome.json|biome|biome format --write {file}"
    ".editorconfig|editorconfig|"
    "rustfmt.toml|rustfmt|rustfmt {file}"
    ".rustfmt.toml|rustfmt|rustfmt {file}"
    "pyproject.toml|black|black --quiet {file}"
    ".style.yapf|yapf|yapf -i {file}"
    "setup.cfg|autopep8|autopep8 --in-place {file}"
    ".gofmt|gofmt|gofmt -w {file}"
)

# Extension-based fallback formatters (used when no config file is detected).
# Format: "extension|command_to_check|format_command_template"
EXTENSION_FORMATTERS=(
    "c|clang-format|clang-format -i {file}"
    "h|clang-format|clang-format -i {file}"
    "cpp|clang-format|clang-format -i {file}"
    "hpp|clang-format|clang-format -i {file}"
    "cc|clang-format|clang-format -i {file}"
    "cxx|clang-format|clang-format -i {file}"
    "py|black|black --quiet {file}"
    "rs|rustfmt|rustfmt {file}"
    "go|gofmt|gofmt -w {file}"
    "js|prettier|prettier --write {file}"
    "ts|prettier|prettier --write {file}"
    "jsx|prettier|prettier --write {file}"
    "tsx|prettier|prettier --write {file}"
    "css|prettier|prettier --write {file}"
    "scss|prettier|prettier --write {file}"
    "html|prettier|prettier --write {file}"
    "java|google-java-format|google-java-format --replace {file}"
    "kt|ktlint|ktlint --format {file}"
    "rb|rubocop|rubocop --autocorrect --no-color {file}"
    "swift|swift-format|swift-format --in-place {file}"
    "zig|zig|zig fmt {file}"
)
# ─────────────────────────────────────────────────────────────────────────────

# Read the tool input from stdin (JSON with tool_name and tool_input fields).
INPUT=$(cat 2>/dev/null)

# Extract the file_path from the JSON input.
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# If we couldn't extract a file path, skip formatting.
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# If the file doesn't exist, skip formatting.
if [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

# Check if the file extension is in the skip list.
EXTENSION="${FILE_PATH##*.}"
EXTENSION_LOWER=$(echo "$EXTENSION" | tr '[:upper:]' '[:lower:]')
for skip_ext in $SKIP_EXTENSIONS; do
    if [ "$EXTENSION_LOWER" = "$skip_ext" ]; then
        exit 0
    fi
done

# Find the project root (git root or current directory).
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# ─── Step 1: Try config-based formatter detection ────────────────────────────
for entry in "${CONFIG_FORMATTERS[@]}"; do
    CONFIG_FILE="${entry%%|*}"
    REMAINING="${entry#*|}"
    COMMAND_NAME="${REMAINING%%|*}"
    FORMAT_CMD="${REMAINING#*|}"

    # Check if the config file exists in the project root.
    if [ -f "${PROJECT_ROOT}/${CONFIG_FILE}" ]; then
        # Check if the formatter binary is available.
        if command -v "$COMMAND_NAME" &>/dev/null; then
            # Skip entries with no format command (e.g., editorconfig detection only).
            if [ -z "$FORMAT_CMD" ]; then
                continue
            fi
            # Replace {file} placeholder with the actual file path.
            ACTUAL_CMD="${FORMAT_CMD//\{file\}/\"$FILE_PATH\"}"
            # Run the formatter.
            eval "$ACTUAL_CMD" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo "AUTO-FORMAT: Ran '${COMMAND_NAME}' on $(basename "$FILE_PATH") (config: ${CONFIG_FILE})"
            else
                echo "AUTO-FORMAT: '${COMMAND_NAME}' failed on $(basename "$FILE_PATH") — check formatter output"
            fi
            exit 0
        fi
    fi
done

# ─── Step 2: Fall back to extension-based formatter detection ────────────────
for entry in "${EXTENSION_FORMATTERS[@]}"; do
    EXT="${entry%%|*}"
    REMAINING="${entry#*|}"
    COMMAND_NAME="${REMAINING%%|*}"
    FORMAT_CMD="${REMAINING#*|}"

    if [ "$EXTENSION_LOWER" = "$EXT" ]; then
        # Check if the formatter binary is available.
        if command -v "$COMMAND_NAME" &>/dev/null; then
            # Replace {file} placeholder with the actual file path.
            ACTUAL_CMD="${FORMAT_CMD//\{file\}/\"$FILE_PATH\"}"
            # Run the formatter.
            eval "$ACTUAL_CMD" 2>/dev/null
            if [ $? -eq 0 ]; then
                echo "AUTO-FORMAT: Ran '${COMMAND_NAME}' on $(basename "$FILE_PATH") (detected by .${EXT} extension)"
            else
                echo "AUTO-FORMAT: '${COMMAND_NAME}' failed on $(basename "$FILE_PATH") — check formatter output"
            fi
            exit 0
        fi
    fi
done

# No formatter found — exit silently. This is expected for file types without
# a configured formatter or when formatter binaries aren't installed.
exit 0
