#!/usr/bin/env bash
# =============================================================================
# archive-completed-tasks.sh
# PreToolUse(Skill) hook for auto-archiving completed GSD task sets.
#
# PURPOSE:
#   Before /gsd:decompose runs, this hook checks if there are existing completed
#   tasks in .claude/tasks/. If all tasks are completed, it moves the TASKS.md,
#   phase-N/ directories, and the source requirements document into
#   .claude/tasks-archive/<NNN>-<branch-name>/. If tasks are incomplete, it
#   blocks decompose with exit code 2.
#
# TRIGGER:
#   PreToolUse → Skill matcher — receives JSON on stdin with a "skill" field.
#   Only activates when skill name matches "gsd:decompose".
#
# EXIT CODES:
#   0 — Allow the tool to proceed (skill is not gsd:decompose, or archive succeeded,
#       or no TASKS.md exists)
#   2 — Block the tool (incomplete tasks found)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Step 1: Read JSON from stdin and check if this is a gsd:decompose skill call.
# We parse the "skill" field from the tool input JSON. If it's not gsd:decompose,
# we exit 0 immediately to let the tool proceed without interference.
# ---------------------------------------------------------------------------
INPUT=$(cat)

# Extract the skill name from the JSON input.
# The Skill tool input has a "skill" field like "gsd:decompose".
# We use sed instead of grep -P for cross-platform compatibility (grep -P is
# not available on all systems, e.g., Git Bash on Windows).
SKILL_NAME=$(echo "$INPUT" | sed -n 's/.*"skill"\s*:\s*"\([^"]*\)".*/\1/p' | head -1)

# If skill is not gsd:decompose, pass through silently
if [[ "$SKILL_NAME" != "gsd:decompose" ]]; then
    exit 0
fi

# ---------------------------------------------------------------------------
# Step 2: Check if TASKS.md exists. If not, there's nothing to archive — the
# user is running decompose for the first time on this branch. Exit 0 silently.
# ---------------------------------------------------------------------------
TASKS_DIR=".claude/tasks"
TASKS_FILE="${TASKS_DIR}/TASKS.md"

if [[ ! -f "$TASKS_FILE" ]]; then
    # No existing tasks to archive — allow decompose to proceed
    exit 0
fi

# ---------------------------------------------------------------------------
# Step 3: Scan TASKS.md for incomplete tasks. We look for status columns in the
# markdown tables that contain "pending" or "in_progress". If any are found,
# block decompose with a clear error message listing what's incomplete.
# ---------------------------------------------------------------------------

# Extract lines from the status tables that have pending or in_progress status.
# The table format is: | # | [Name](path) | status | depends | commit |
# Use grep -E (extended regex) instead of grep -P for portability
INCOMPLETE_TASKS=$(grep -E '\|\s*(pending|in_progress)\s*\|' "$TASKS_FILE" || true)

if [[ -n "$INCOMPLETE_TASKS" ]]; then
    # Build a human-readable list of incomplete tasks for the error message
    echo "BLOCKED: Cannot run /gsd:decompose — there are incomplete tasks."
    echo ""
    echo "The following tasks are not yet completed:"
    echo ""
    # Parse task names and statuses from the table rows
    echo "$INCOMPLETE_TASKS" | while IFS= read -r line; do
        # Extract the task name (link text) and status from each table row
        # Uses sed for portability instead of grep -P
        TASK_NAME=$(echo "$line" | sed -n 's/.*\[\([^]]*\)\].*/\1/p' | head -1)
        TASK_STATUS=$(echo "$line" | grep -oE '(pending|in_progress)' | head -1)
        echo "  - ${TASK_NAME} (${TASK_STATUS})"
    done
    echo ""
    echo "Complete or remove all tasks before running /gsd:decompose again."
    echo "If you want to force-archive incomplete tasks, manually move .claude/tasks/ contents."
    exit 2
fi

# ---------------------------------------------------------------------------
# Step 4: All tasks are completed. Determine the next sequential archive number
# by scanning .claude/tasks-archive/ for existing NNN-* directories.
# ---------------------------------------------------------------------------
ARCHIVE_BASE=".claude/tasks-archive"

# Ensure the archive base directory exists
mkdir -p "$ARCHIVE_BASE"

# Find the highest existing sequence number (NNN prefix).
# List directories, extract the numeric prefix, sort, and take the highest.
LAST_NUM=$(ls -1d "${ARCHIVE_BASE}/"[0-9][0-9][0-9]-* 2>/dev/null \
    | sed 's|.*/||' \
    | grep -oE '^[0-9]{3}' \
    | sort -n \
    | tail -1 || echo "000")

# Increment to get the next sequence number, zero-padded to 3 digits
NEXT_NUM=$(printf "%03d" $((10#$LAST_NUM + 1)))

# ---------------------------------------------------------------------------
# Step 5: Get the current git branch name and sanitize it for use as a
# directory name (replace slashes with hyphens).
# ---------------------------------------------------------------------------
BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "unknown-branch")

# Sanitize: replace forward slashes with hyphens for directory-safe naming
SANITIZED_BRANCH=$(echo "$BRANCH_NAME" | tr '/' '-')

# Construct the full archive directory path
ARCHIVE_DIR="${ARCHIVE_BASE}/${NEXT_NUM}-${SANITIZED_BRANCH}"

# ---------------------------------------------------------------------------
# Step 6: Create the archive directory and move task artifacts into it.
# This includes TASKS.md and all phase-N/ subdirectories.
# ---------------------------------------------------------------------------
mkdir -p "$ARCHIVE_DIR"

# Move TASKS.md into the archive
mv "$TASKS_FILE" "$ARCHIVE_DIR/TASKS.md"

# Move all phase-N/ directories into the archive.
# We use a loop to handle the case where there are no phase dirs gracefully.
for phase_dir in "${TASKS_DIR}"/phase-*/; do
    if [[ -d "$phase_dir" ]]; then
        mv "$phase_dir" "$ARCHIVE_DIR/"
    fi
done

# ---------------------------------------------------------------------------
# Step 7: Extract the source requirements document path from the archived
# TASKS.md **Source:** field and move it into the archive as REQUIREMENTS.md.
# This preserves the original requirements alongside the completed tasks and
# removes the now-completed requirements doc from the project root.
# ---------------------------------------------------------------------------
# Extract the source requirements path from the **Source:** field in TASKS.md.
# Uses grep -E for portability instead of grep -P.
SOURCE_PATH=$(grep -E '^\*\*Source:\*\*' "$ARCHIVE_DIR/TASKS.md" \
    | head -1 \
    | sed 's/\*\*Source:\*\*[[:space:]]*//' \
    | xargs || true)

if [[ -n "$SOURCE_PATH" && -f "$SOURCE_PATH" ]]; then
    # Move the source requirements into the archive as REQUIREMENTS.md.
    # Once all tasks are completed and archived, the requirements doc has served
    # its purpose — leaving it in the project root creates clutter. The archived
    # copy in tasks-archive/ preserves it for future reference.
    mv "$SOURCE_PATH" "$ARCHIVE_DIR/REQUIREMENTS.md"
    echo "Archived source requirements: ${SOURCE_PATH} -> ${ARCHIVE_DIR}/REQUIREMENTS.md"
fi

# ---------------------------------------------------------------------------
# Step 8: Output confirmation message and exit successfully.
# ---------------------------------------------------------------------------
echo ""
echo "GSD Task Archive Complete"
echo "========================="
echo "  Branch:  ${BRANCH_NAME}"
echo "  Archive: ${ARCHIVE_DIR}/"
echo "  Contents:"
ls -1 "$ARCHIVE_DIR/" | sed 's/^/    /'
echo ""
echo "The .claude/tasks/ directory is now clean for a new /gsd:decompose run."

exit 0
