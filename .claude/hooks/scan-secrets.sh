#!/usr/bin/env bash
# =============================================================================
# Hook: scan-secrets.sh
# Event: PostToolUse (Edit|Write)
# Purpose: Scan files after modification for accidentally introduced secrets,
#          API keys, tokens, passwords, and private keys.
#
# Behavior:
#   - Extracts the file path from the tool input (JSON on stdin)
#   - Skips binary files, lock files, and known safe patterns
#   - Scans file content against a list of high-confidence secret patterns
#   - Outputs warnings for any matches (exit 0 — informational only)
#
# Configuration:
#   - SKIP_EXTENSIONS: File types to skip scanning
#   - SECRET_PATTERNS: Array of grep-compatible regex patterns
#
# To customize per-stack: Add framework-specific patterns to SECRET_PATTERNS
# or add safe file types to SKIP_EXTENSIONS.
# =============================================================================

# ─── Configuration ───────────────────────────────────────────────────────────
# File extensions to skip scanning (binaries, lock files, etc.).
SKIP_EXTENSIONS="png jpg jpeg gif ico svg bmp webp mp3 mp4 wav avi mkv zip tar gz bz2 7z rar exe dll so dylib o obj bin lock woff woff2 ttf eot pdf"

# High-confidence secret patterns (grep -Ei compatible).
# Each entry is: "pattern|description"
# Only patterns with very low false-positive rates are included.
SECRET_PATTERNS=(
    "AKIA[0-9A-Z]{16}|AWS Access Key ID"
    "-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----|Private key block"
    "ghp_[0-9a-zA-Z]{36}|GitHub Personal Access Token"
    "gho_[0-9a-zA-Z]{36}|GitHub OAuth Token"
    "ghs_[0-9a-zA-Z]{36}|GitHub Server Token"
    "ghr_[0-9a-zA-Z]{36}|GitHub Refresh Token"
    "glpat-[0-9a-zA-Z_-]{20,}|GitLab Personal Access Token"
    "sk-[0-9a-zA-Z]{32,}|OpenAI / Stripe Secret Key"
    "sk-ant-[0-9a-zA-Z_-]{80,}|Anthropic API Key"
    "xoxb-[0-9]{10,}-[0-9a-zA-Z]{20,}|Slack Bot Token"
    "xoxp-[0-9]{10,}-[0-9a-zA-Z]{20,}|Slack User Token"
    "SG\.[0-9a-zA-Z_-]{22}\.[0-9a-zA-Z_-]{43}|SendGrid API Key"
    "AIza[0-9A-Za-z_-]{35}|Google API Key"
    "(password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{4,}['\"]|Hardcoded password assignment"
    "(api[_-]?key|apikey)\s*[:=]\s*['\"][^'\"]{8,}['\"]|Hardcoded API key assignment"
    "(secret|token)\s*[:=]\s*['\"][^'\"]{8,}['\"]|Hardcoded secret/token assignment"
    "(mongodb|postgres|mysql|redis|amqp)://[^:]+:[^@]+@|Database connection string with credentials"
)
# ─────────────────────────────────────────────────────────────────────────────

# Read the tool input from stdin (JSON with tool_name and tool_input fields).
INPUT=$(cat 2>/dev/null)

# Extract the file_path from the JSON input.
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')

# If we couldn't extract a file path, skip the scan.
if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# If the file doesn't exist (deleted or moved), skip the scan.
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

# Scan the file for each secret pattern.
FINDINGS=""
for entry in "${SECRET_PATTERNS[@]}"; do
    # Split entry into pattern and description.
    PATTERN="${entry%%|*}"
    DESCRIPTION="${entry##*|}"

    # Search for the pattern in the file (case-insensitive, show line numbers).
    MATCHES=$(grep -nEi "$PATTERN" "$FILE_PATH" 2>/dev/null)
    if [ -n "$MATCHES" ]; then
        # Collect findings with line numbers.
        while IFS= read -r match_line; do
            LINE_NUM="${match_line%%:*}"
            FINDINGS="${FINDINGS}\n  - Line ${LINE_NUM}: ${DESCRIPTION}"
        done <<< "$MATCHES"
    fi
done

# If any secrets were found, output a warning.
if [ -n "$FINDINGS" ]; then
    echo "SECRETS DETECTED in '$(basename "$FILE_PATH")':"
    echo -e "$FINDINGS"
    echo ""
    echo "ACTION REQUIRED: Remove secrets and use environment variables or a secrets manager instead. Ensure .env files are in .gitignore."
fi

# Always exit 0 — this is a PostToolUse hook (informational only).
exit 0
