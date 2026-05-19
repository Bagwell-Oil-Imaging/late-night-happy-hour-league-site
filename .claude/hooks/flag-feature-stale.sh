#!/usr/bin/env bash
# =============================================================================
# Hook: flag-feature-stale.sh
# Event: PostToolUse (Edit|Write)
# Purpose: After a source file is edited, find which features list that file
#          in their Key Source Paths column, notify Claude, and write "stale"
#          into any diagram columns that currently hold a live link.
#
# Behavior:
#   - Extracts the edited file path from the tool input JSON (stdin)
#   - Only runs for files under src/, scripts/, or api/
#   - Skips silently if docs/features.md doesn't exist yet
#   - Matches by filename basename against Key Source Paths column ($5)
#   - Updates diagram columns Flow ($7), Seq ($8), Component ($9), Class ($10)
#     in matching rows: replaces any markdown link [text](path) with "stale"
#   - Always exits 0 (informational only, never blocks the edit)
#
# features.md column layout (pipe-delimited, 1-indexed in awk):
#   $1=''  $2=#  $3=Feature  $4=Description  $5=KeySourcePaths
#   $6=Tier  $7=Flow  $8=Seq  $9=Component  $10=Class  $11=''
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

FILE_BASENAME=$(basename "$FILE_PATH")

# ── 1. Notify Claude which features are affected ──────────────────────────────

MATCHING_LINES=$(grep -n "| " "$FEATURES_FILE" \
    | grep "$FILE_BASENAME" \
    | grep -v "| Feature |" \
    | grep -v "| # |")

if [ -n "$MATCHING_LINES" ]; then
    echo "FEATURE-REGISTRY: '$FILE_BASENAME' is listed in the following features:"
    while IFS= read -r line; do
        FEATURE_NAME=$(echo "$line" | awk -F'|' '{
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", $3)
            print $3
        }')
        if [ -n "$FEATURE_NAME" ] && [ "$FEATURE_NAME" != "Feature" ] && [ "$FEATURE_NAME" != "#" ]; then
            echo "  → $FEATURE_NAME"
        fi
    done <<< "$MATCHING_LINES"
    echo "  If this change modifies feature behavior, update the spec and run /generate-diagrams."
fi

# ── 2. Write "stale" into diagram link columns for matching rows ───────────────
# For each row where Key Source Paths ($5) contains the edited filename,
# replace any markdown link in Flow ($7), Seq ($8), Component ($9), Class ($10)
# with " stale ". Columns containing "—", "needed", "blocked", or "stale"
# are left unchanged — only live links ([text](path)) are marked stale.

awk -F'|' -v OFS='|' -v basename="$FILE_BASENAME" '
NF > 8 && $5 ~ basename && $3 !~ /[[:space:]]Feature[[:space:]]/ && $2 !~ /[[:space:]]#[[:space:]]/ {
    for (i = 7; i <= 10; i++) {
        trimmed = $i
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", trimmed)
        if (trimmed ~ /^\[/) {
            $i = " stale "
        }
    }
}
{ print }
' "$FEATURES_FILE" > "${FEATURES_FILE}.tmp" && mv "${FEATURES_FILE}.tmp" "$FEATURES_FILE"

exit 0
