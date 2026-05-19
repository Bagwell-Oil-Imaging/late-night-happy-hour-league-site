#!/usr/bin/env bash
# =============================================================================
# Hook: flag-feature-stale.sh
# Event: PostToolUse (Edit|Write)
# Purpose: After a source file is edited, grep docs/features.md to find which
#          feature rows list that file in their Key Source Paths column. If any
#          match, output a warning so Claude can surface it to the user.
#
# Behavior:
#   - Extracts the edited file path from the tool input JSON (stdin)
#   - Only runs for files under src/, scripts/, or api/
#   - Skips silently if docs/features.md doesn't exist yet
#   - Matches by filename (basename) — fast and sufficient for this repo
#   - Always exits 0 (informational only, never blocks the edit)
#
# Limitation: Basename matching can produce false positives if two files in
#   different directories share the same name. Acceptable for this repo's size.
# =============================================================================

# Read tool input JSON from stdin
INPUT=$(cat 2>/dev/null)

# Extract the file_path value from the JSON object
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# No file path found in this tool call — nothing to do
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# Only process source files; skip docs, config, and hook files themselves
case "$FILE_PATH" in
    */src/*|*/scripts/*|*/api/*) ;;
    *) exit 0 ;;
esac

# Skip if the feature registry doesn't exist yet
FEATURES_FILE="docs/features.md"
if [ ! -f "$FEATURES_FILE" ]; then
    exit 0
fi

# Extract the filename for matching against Key Source Paths entries
FILE_BASENAME=$(basename "$FILE_PATH")

# Search features.md for table rows that reference this filename.
# Table rows start with | and contain pipe-delimited columns.
# Exclude the header row (which contains "Feature" as the 3rd column).
MATCHING_LINES=$(grep -n "| " "$FEATURES_FILE" \
    | grep "$FILE_BASENAME" \
    | grep -v "| Feature |" \
    | grep -v "| # |")

if [ -n "$MATCHING_LINES" ]; then
    echo "FEATURE-REGISTRY: '$FILE_BASENAME' is listed in the following features:"
    while IFS= read -r line; do
        # Extract the feature name (3rd pipe-delimited column, trimmed)
        FEATURE_NAME=$(echo "$line" | awk -F'|' '{
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", $3)
            print $3
        }')
        if [ -n "$FEATURE_NAME" ] && [ "$FEATURE_NAME" != "Feature" ] && [ "$FEATURE_NAME" != "#" ]; then
            echo "  → $FEATURE_NAME"
        fi
    done <<< "$MATCHING_LINES"
    echo "  If this change adds, removes, or restructures a feature, update docs/features.md."
fi

exit 0
