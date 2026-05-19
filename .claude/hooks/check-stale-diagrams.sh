#!/usr/bin/env bash
# =============================================================================
# Hook: check-stale-diagrams.sh
# Event: SessionStart
# Purpose: Sweep docs/features.md at the start of each session and report
#          any features with stale or ungenerated diagrams so the user
#          knows what needs attention before beginning work.
#
# Behavior:
#   - Skips silently if docs/features.md does not exist
#   - Counts feature rows containing "stale" in any diagram column
#   - Counts feature rows containing "needed" in any diagram column
#   - Prints a summary and the /generate-diagrams command to fix
#   - Always exits 0 (informational only)
# =============================================================================

FEATURES_FILE="docs/features.md"

if [ ! -f "$FEATURES_FILE" ]; then
    exit 0
fi

# Count data rows (start with "| <number>") that contain stale or needed
STALE_FEATURES=$(grep "^| [0-9]" "$FEATURES_FILE" | grep -c "stale" || true)
NEEDED_FEATURES=$(grep "^| [0-9]" "$FEATURES_FILE" | grep -c "needed" || true)

# Nothing to report — all diagrams current
if [ "$STALE_FEATURES" -eq 0 ] && [ "$NEEDED_FEATURES" -eq 0 ]; then
    exit 0
fi

echo "DIAGRAM STATUS:"
[ "$STALE_FEATURES" -gt 0 ] && echo "  $STALE_FEATURES feature(s) have stale diagrams — source changed since last generation"
[ "$NEEDED_FEATURES" -gt 0 ] && echo "  $NEEDED_FEATURES feature(s) have diagrams not yet generated"
echo "  Run /generate-diagrams <feature-name> or /generate-diagrams --all to update"

exit 0
