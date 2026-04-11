#!/bin/bash
# autopush.sh — stage, commit, and push in one shot
# Usage:  ./autopush.sh "your commit message"
#         ./autopush.sh              (falls back to a timestamped message)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail   # exit on error, undefined var, or pipe failure

# ── Config ────────────────────────────────────────────────────────────────────
BRANCH="main"
REMOTE="origin"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [ -z "$REPO_ROOT" ]; then
  echo "❌  Not inside a git repository."
  exit 1
fi

cd "$REPO_ROOT"

if ! git remote get-url "$REMOTE" &>/dev/null; then
  echo "❌  Remote '$REMOTE' not found. Run: git remote add $REMOTE <url>"
  exit 1
fi

# ── Commit message ────────────────────────────────────────────────────────────
if [ $# -ge 1 ] && [ -n "$1" ]; then
  MSG="$1"
else
  MSG="chore: autopush $(date '+%Y-%m-%d %H:%M')"
fi

# ── Check for changes ─────────────────────────────────────────────────────────
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "✅  Nothing to commit — working tree is clean."
  exit 0
fi

# ── Stage all tracked + new files (excludes .gitignored) ─────────────────────
git add -A

# Show a compact diff summary before committing
echo ""
echo "── Staged changes ───────────────────────────────────────────────────────"
git diff --cached --stat
echo ""

# ── Commit ────────────────────────────────────────────────────────────────────
git commit -m "$MSG"

# ── Push ──────────────────────────────────────────────────────────────────────
echo ""
echo "── Pushing to $REMOTE/$BRANCH ───────────────────────────────────────────"
git push "$REMOTE" "$BRANCH"

echo ""
echo "✅  Pushed: \"$MSG\""
echo "   $(git log --oneline -1)"
