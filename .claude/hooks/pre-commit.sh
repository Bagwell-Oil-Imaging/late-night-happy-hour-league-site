#!/usr/bin/env bash
# =============================================================================
# Hook: pre-commit.sh
# Event: PreToolUse (Bash) — matched when the command contains "git commit"
# Purpose: Validate documentation sync, catch secrets, and enforce quality
#          standards before Claude Code creates any commit.
#
# Checks (in order):
#   1. Secrets scan     - Block commits containing hardcoded credentials
#   2. Placeholder scan - Block commits with TBD/TODO/FIXME in docs
#   3. Doc sync         - Warn if source changed but docs didn't
#   4. Structure sync   - Warn if CLAUDE.md and README.md trees diverge
#   5. Changelog check  - Warn if no [Unreleased] entry for source changes
#
# Behavior:
#   - BLOCK (exit 2): Secrets found, placeholder text in docs
#   - WARN  (exit 0): Doc sync issues print warnings but allow commit
#
# Configuration:
#   - BLOCK_ON_DOC_DRIFT: Set to "true" to block commits when docs are stale
#   - SOURCE_EXTENSIONS: File extensions considered "source code"
#   - DOC_FILES: Documentation files to check for sync
# =============================================================================

# ─── Gate: Only run when the Bash command is a git commit ────────────────────

# Read the tool input from stdin (JSON with tool_name and tool_input fields).
INPUT=$(cat 2>/dev/null)

# Extract the command from the JSON input.
COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# Only run checks if this is a git commit command.
case "$COMMAND" in
    *"git commit"*) ;;
    *) exit 0 ;;
esac

# Skip if the commit command includes --no-verify (user explicitly bypassing).
case "$COMMAND" in
    *"--no-verify"*) exit 0 ;;
esac

# ─── Configuration ───────────────────────────────────────────────────────────

# Set to "true" to block commits when documentation is out of sync.
# Default is "false" (warn only) to avoid friction during early development.
BLOCK_ON_DOC_DRIFT="false"

# File extensions that count as "source code" (triggers doc sync checks).
SOURCE_EXTENSIONS="c h asm s S cpp hpp cc cxx py rs zig go js ts jsx tsx rb java kt swift"

# Documentation files to check for staleness.
DOC_FILES="README.md CHANGELOG.md CONTRIBUTING.md SECURITY.md"

# CLAUDE.md location (may be at root or in .claude/).
if [ -f "CLAUDE.md" ]; then
    CLAUDE_MD="CLAUDE.md"
elif [ -f ".claude/CLAUDE.md" ]; then
    CLAUDE_MD=".claude/CLAUDE.md"
else
    CLAUDE_MD=""
fi

# High-confidence secret patterns (shared with scan-secrets.sh).
SECRET_PATTERNS=(
    "AKIA[0-9A-Z]{16}"
    "-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----"
    "ghp_[0-9a-zA-Z]{36}"
    "gho_[0-9a-zA-Z]{36}"
    "ghs_[0-9a-zA-Z]{36}"
    "ghr_[0-9a-zA-Z]{36}"
    "glpat-[0-9a-zA-Z_-]{20,}"
    "sk-[0-9a-zA-Z]{32,}"
    "sk-ant-[0-9a-zA-Z_-]{80,}"
    "xoxb-[0-9]{10,}-[0-9a-zA-Z]{20,}"
    "xoxp-[0-9]{10,}-[0-9a-zA-Z]{20,}"
    "SG\.[0-9a-zA-Z_-]{22}\.[0-9a-zA-Z_-]{43}"
    "AIza[0-9A-Za-z_-]{35}"
)

# ─── Helper Functions ────────────────────────────────────────────────────────

# Check if a file extension is in the source extensions list.
is_source_file() {
    local file="$1"
    local ext="${file##*.}"
    local ext_lower
    ext_lower=$(echo "$ext" | tr '[:upper:]' '[:lower:]')
    for src_ext in $SOURCE_EXTENSIONS; do
        if [ "$ext_lower" = "$src_ext" ]; then
            return 0
        fi
    done
    return 1
}

# ─── Get Staged Files ────────────────────────────────────────────────────────

# Get the list of staged files (added, modified, or renamed — not deleted).
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)

if [ -z "$STAGED_FILES" ]; then
    exit 0
fi

# Categorize staged files.
SOURCE_CHANGED=false
DOCS_CHANGED=false
CHANGELOG_CHANGED=false

for file in $STAGED_FILES; do
    if is_source_file "$file"; then
        SOURCE_CHANGED=true
    fi

    base=$(basename "$file")
    for doc in $DOC_FILES; do
        if [ "$base" = "$doc" ]; then
            DOCS_CHANGED=true
        fi
    done

    if [ "$base" = "CHANGELOG.md" ]; then
        CHANGELOG_CHANGED=true
    fi

    if [ "$file" = "$CLAUDE_MD" ]; then
        DOCS_CHANGED=true
    fi
done

BLOCKED=false
WARNINGS=""

# ─── Check 1: Secrets Scan ──────────────────────────────────────────────────

SECRETS_OUTPUT=""
for file in $STAGED_FILES; do
    # Skip binary and non-text files.
    case "$file" in
        *.png|*.jpg|*.jpeg|*.gif|*.ico|*.svg|*.bmp|*.webp|*.pdf) continue ;;
        *.mp3|*.mp4|*.wav|*.avi|*.mkv) continue ;;
        *.zip|*.tar|*.gz|*.bz2|*.7z|*.rar) continue ;;
        *.exe|*.dll|*.so|*.dylib|*.o|*.obj|*.bin) continue ;;
        *.woff|*.woff2|*.ttf|*.eot|*.lock) continue ;;
    esac

    # Check the staged content (not the working tree version).
    CONTENT=$(git show ":$file" 2>/dev/null)
    if [ -z "$CONTENT" ]; then
        continue
    fi

    for pattern in "${SECRET_PATTERNS[@]}"; do
        MATCHES=$(echo "$CONTENT" | grep -nEi "$pattern" 2>/dev/null)
        if [ -n "$MATCHES" ]; then
            BLOCKED=true
            while IFS= read -r match; do
                LINE_NUM="${match%%:*}"
                SECRETS_OUTPUT="${SECRETS_OUTPUT}\n  BLOCKED: Possible secret in ${file}:${LINE_NUM}"
            done <<< "$MATCHES"
        fi
    done
done

# ─── Check 2: Placeholder Text in Documentation ─────────────────────────────

for file in $STAGED_FILES; do
    base=$(basename "$file")
    case "$base" in
        README.md|CHANGELOG.md|CONTRIBUTING.md|SECURITY.md|CLAUDE.md) ;;
        *) continue ;;
    esac

    CONTENT=$(git show ":$file" 2>/dev/null)
    if [ -z "$CONTENT" ]; then
        continue
    fi

    PLACEHOLDER_MATCHES=$(echo "$CONTENT" | grep -nEi '(^|\s)(TBD|TODO|FIXME|HACK|XXX|PLACEHOLDER|your-.*-here|<INSERT|CHANGEME)(\s|$|[:.!,])' 2>/dev/null)
    if [ -n "$PLACEHOLDER_MATCHES" ]; then
        BLOCKED=true
        while IFS= read -r match; do
            LINE_NUM="${match%%:*}"
            SECRETS_OUTPUT="${SECRETS_OUTPUT}\n  BLOCKED: Placeholder text in ${file}:${LINE_NUM}"
        done <<< "$PLACEHOLDER_MATCHES"
    fi
done

# ─── Check 3: Documentation Sync ────────────────────────────────────────────

if [ "$SOURCE_CHANGED" = true ] && [ "$DOCS_CHANGED" = false ]; then
    MSG="Source code changed but no documentation files were updated."
    if [ "$BLOCK_ON_DOC_DRIFT" = "true" ]; then
        BLOCKED=true
        SECRETS_OUTPUT="${SECRETS_OUTPUT}\n  BLOCKED: ${MSG}"
    else
        WARNINGS="${WARNINGS}\n  WARNING: ${MSG} Consider running /document or /changelog."
    fi
fi

# ─── Check 4: Project Structure Tree Sync ────────────────────────────────────

if [ -n "$CLAUDE_MD" ] && [ -f "README.md" ]; then
    CLAUDE_TREE=$(sed -n '/^```$/,/^```$/p' "$CLAUDE_MD" 2>/dev/null | head -60)
    README_TREE=$(sed -n '/^```$/,/^```$/p' README.md 2>/dev/null | head -60)

    if [ -n "$CLAUDE_TREE" ] && [ -n "$README_TREE" ]; then
        CLAUDE_ENTRIES=$(echo "$CLAUDE_TREE" | sed 's/#.*//' | sed 's/[[:space:]]*$//' | grep -v '^```$' | grep -v '^$' | sort)
        README_ENTRIES=$(echo "$README_TREE" | sed 's/#.*//' | sed 's/[[:space:]]*$//' | grep -v '^```$' | grep -v '^$' | sort)

        if [ "$CLAUDE_ENTRIES" != "$README_ENTRIES" ]; then
            WARNINGS="${WARNINGS}\n  WARNING: Project structure trees in CLAUDE.md and README.md may be out of sync."
        fi
    fi
fi

# ─── Check 5: Changelog Entry ───────────────────────────────────────────────

if [ "$SOURCE_CHANGED" = true ] && [ "$CHANGELOG_CHANGED" = false ]; then
    MSG="Source code changed but CHANGELOG.md has no new entries."
    if [ "$BLOCK_ON_DOC_DRIFT" = "true" ]; then
        BLOCKED=true
        SECRETS_OUTPUT="${SECRETS_OUTPUT}\n  BLOCKED: ${MSG}"
    else
        WARNINGS="${WARNINGS}\n  WARNING: ${MSG} Consider running /changelog."
    fi
fi

# ─── Output Results ──────────────────────────────────────────────────────────

# Build the output message.
OUTPUT=""

if [ -n "$SECRETS_OUTPUT" ]; then
    OUTPUT="PRE-COMMIT CHECKS:${SECRETS_OUTPUT}"
fi

if [ -n "$WARNINGS" ]; then
    if [ -n "$OUTPUT" ]; then
        OUTPUT="${OUTPUT}${WARNINGS}"
    else
        OUTPUT="PRE-COMMIT CHECKS:${WARNINGS}"
    fi
fi

# If blocked, output to stderr and exit 2 (Claude Code PreToolUse block code).
if [ "$BLOCKED" = true ]; then
    echo -e "$OUTPUT" >&2
    echo -e "\nCommit blocked. Fix the issues above before committing." >&2
    exit 2
fi

# If warnings only, output to stdout (shown to Claude as context).
if [ -n "$OUTPUT" ]; then
    echo -e "$OUTPUT"
fi

exit 0
