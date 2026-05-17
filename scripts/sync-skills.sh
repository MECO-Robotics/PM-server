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

echo "Syncing skills from: $SKILLS_REPO"

cleanup

if ! git clone --depth 1 "$SKILLS_REPO" "$TMP_DIR"; then
  fail "failed to clone shared skills repo: $SKILLS_REPO"
fi

if [ ! -d "$TMP_DIR/skills" ]; then
  fail "shared repo does not contain a skills/ directory."
fi

rm -rf skills
cp -R "$TMP_DIR/skills" ./skills

cleanup
trap - EXIT

echo "Synced skills/ successfully."
