#!/usr/bin/env bash
# =============================================================================
# Hook: protect-branch.sh
# Event: PreToolUse (Edit|Write)
# Purpose: Prevent file modifications on protected branches (main, master).
#          Encourages feature-branch workflow.
#
# Behavior:
#   - WARN mode (default): Prints a warning but allows the edit (exit 0)
#   - BLOCK mode: Blocks the edit entirely (exit 2)
#
# Configuration:
#   - PROTECTED_BRANCHES: Space-separated list of branch names to protect
#   - BLOCK_MODE: Set to "true" to block edits, "false" to warn only
#
# To customize per-stack: Only modify the Configuration section below.
# =============================================================================

# ─── Configuration ───────────────────────────────────────────────────────────
# Branches that should be protected from direct edits.
PROTECTED_BRANCHES="main master"

# Set to "true" to block edits on protected branches (exit 2).
# Set to "false" to warn only (exit 0). Default: false (warn mode).
# Note: bypassPermissions mode in settings.local.json makes BLOCK_MODE redundant —
# keeping warn-only here prevents the hook from interfering with that mode.
BLOCK_MODE="false"
# ─────────────────────────────────────────────────────────────────────────────

# Get the current git branch name. If not in a git repo, allow the edit.
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    exit 0
fi

# Check if the current branch is in the protected list.
for branch in $PROTECTED_BRANCHES; do
    if [ "$CURRENT_BRANCH" = "$branch" ]; then
        MESSAGE="WARNING: You are on the protected branch '$CURRENT_BRANCH'. Create a feature branch before making changes (e.g., git checkout -b feature/<name>)."

        if [ "$BLOCK_MODE" = "true" ]; then
            # Exit 2 blocks the tool call. Message goes to stderr.
            echo "$MESSAGE" >&2
            exit 2
        else
            # Exit 0 allows the tool call. Message shown to Claude as context.
            echo "$MESSAGE"
            exit 0
        fi
    fi
done

# Branch is not protected — allow the edit silently.
exit 0
