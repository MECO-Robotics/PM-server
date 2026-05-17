# Shared Skills Workflow

Mission Control app repos keep `skills/` as ordinary committed files. The shared source of truth is a separate `mission-control-skills` repo, and each app repo syncs a copy from that source.

In this workspace the app repos are `meco-mission-control-web`, `meco-mission-control-platform`, and `meco-mission-control-mobile`. Older shorthand may call them `mission-control-web`, `mission-control-api`, and `mission-control-mobile`.

## Why Sync-Copy Instead of Submodules

Git submodules embed another repository with separate history and a pinned commit. That adds extra clone, checkout, update, and CI handling. GitHub Actions also needs explicit submodule checkout configuration. For students, mentors, and Codex agents, a normal committed copy is easier to inspect, diff, review, and revert.

This repo intentionally does not use `.gitmodules`, `git submodule add`, or a nested Git repository under `skills/`.

## Shared Source Layout

The shared `mission-control-skills` repo should contain:

```text
skills/
  app-architecture/
  ui-review/
  api-review/
  frc-domain/
  github-project-management/
  meco-writing-style/
```

## Update Shared Source

```bash
cd mission-control-skills
git add skills
git commit -m "Update shared skills"
git push
```

## Sync Into an App Repo

```bash
cd mission-control-web
bash scripts/sync-skills.sh
git diff -- skills
git add skills
git commit -m "Sync shared skills"
git push
```

After running sync, commit the resulting `skills/` changes in the app repo.

## Override the Shared Repo

The scripts default to:

```text
https://github.com/MECO-Robotics/mission-control-skills.git
```

Use `SKILLS_REPO` to point at a fork, local test repo, or alternate remote.

```bash
SKILLS_REPO=git@github.com:MECO-Robotics/mission-control-skills.git bash scripts/sync-skills.sh
```

```powershell
$env:SKILLS_REPO = "git@github.com:MECO-Robotics/mission-control-skills.git"
.\scripts\sync-skills.ps1
```

## Check Currentness

```bash
bash scripts/check-skills-current.sh
```

The check exits `0` when local `skills/` matches the shared source and exits `1` when it is stale. It does not modify the working tree.

## Review Diffs

Always review the copied files before committing:

```bash
git status --short -- skills
git diff -- skills
```

CI runs the same staleness check on pull requests and pushes. Configure the source URL with a `SKILLS_REPO` repository variable or secret when the default is not correct. If the shared repo is private, configure access with a deploy key or token through GitHub secrets; do not hardcode credentials in scripts or workflow files.
