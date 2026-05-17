#!/usr/bin/env bash
set -euo pipefail

SKILLS_REPO="${SKILLS_REPO:-https://github.com/MECO-Robotics/mission-control-skills.git}"
TMP_DIR=".tmp-skills-sync"

fail() {
  echo "Error: $*" >&2
  exit 1
}

cleanup() {
  rm -rf "$TMP_DIR"
}

require_repo_root() {
  local repo_root
  local current_dir

  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "not a git repository. Run this script from the app repo root."
  repo_root="$(cd "$repo_root" && pwd -P)"
  current_dir="$(pwd -P)"

  if [ "$current_dir" != "$repo_root" ]; then
    fail "run this script from the repository root: $repo_root"
  fi
}

require_repo_root
trap cleanup EXIT

echo "Checking skills against: $SKILLS_REPO"

cleanup

if ! git clone --depth 1 "$SKILLS_REPO" "$TMP_DIR"; then
  fail "failed to clone shared skills repo: $SKILLS_REPO"
fi

if [ ! -d "$TMP_DIR/skills" ]; then
  fail "shared repo does not contain a skills/ directory."
fi

if [ ! -d "skills" ]; then
  echo "skills/ is missing."
  echo "Run: bash scripts/sync-skills.sh"
  exit 1
fi

set +e
DIFF_OUTPUT="$(diff -qr "$TMP_DIR/skills" skills 2>&1)"
DIFF_STATUS=$?
set -e

if [ "$DIFF_STATUS" -eq 0 ]; then
  cleanup
  trap - EXIT
  echo "skills/ is current."
  exit 0
fi

if [ "$DIFF_STATUS" -eq 1 ]; then
  echo "skills/ is stale."
  echo "$DIFF_OUTPUT"
  echo "Run: bash scripts/sync-skills.sh"
  exit 1
fi

fail "failed to compare skills/: $DIFF_OUTPUT"
