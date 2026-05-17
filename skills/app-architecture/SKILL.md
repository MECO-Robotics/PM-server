---
name: app-architecture
description: Use when changing Mission Control app architecture, repo boundaries, navigation structure, persistence, or cross-repo contracts.
---

# App Architecture

Mission Control is split across web, platform API, and mobile app repos. Before changing shared behavior, identify the owning repo and the consumers that depend on it.

## Workflow

- Inspect the route, schema, type, or UI surface that owns the behavior before editing.
- For contract changes, treat the platform API validation as the source of truth, then align web and mobile consumers.
- Keep changes small and cohesive; avoid broad refactors unless the task requires them.
- Preserve review and confirmation gates for project structure changes such as mechanisms, subsystems, or generated records.
- Validate in every touched repo with the repo-appropriate typecheck, test, or build command.
