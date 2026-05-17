---
name: github-project-management
description: Use when managing Mission Control GitHub Projects, backlog intake, issue triage, project fields, draft items, promotion workflows, or duplicate cleanup for MECO-Robotics work.
---

# GitHub Project Management

Mission Control backlog work should enter GitHub Projects deliberately. Keep intake, triage, and official backlog promotion separate so unreviewed work does not pollute the active board.

## Workflow

- Confirm the target org, project number, and repo before changing anything. Default Mission Control context is `MECO-Robotics`, Project `1`, and the `meco-mission-control-*` repos.
- Prefer GitHub ProjectV2 APIs through the GitHub connector or `gh api graphql`; use REST only where it is the clearest supported endpoint.
- Discover project fields by name at runtime. Do not hardcode field IDs, option IDs, or item IDs into source files or docs.
- Treat project items, GitHub issues, and draft project items as different objects. Preserve links between them when promoting or normalizing work.
- Before creating or promoting work, search for duplicates by title, repo, subsystem/area, labels, linked project items, and nearby source references.
- Use the backlog staging ground for loose ideas, TODO migrations, vague issues, and unowned project items. Promote only after review and explicit approval.
- Keep all GitHub tokens server-side or in local CLI auth. Never expose tokens in frontend code, screenshots, logs, markdown, or copied API payloads.

## Triage Rules

- Proposed or unclear work belongs in staging, not the active backlog.
- Unassigned open issues with backlog-like wording should be linked or migrated into staging before cleanup.
- Draft project items without clear ownership should be treated as intake candidates until normalized.
- Duplicate candidates should block automatic promotion; leave a reviewer-visible note instead of merging silently.
- Rejected items should remain auditable unless the user explicitly asks for deletion.

## Normalized Issue Shape

Use this structure before promotion:

```markdown
## Problem
## Desired Outcome
## Scope
## Out of Scope
## Acceptance Criteria
- [ ] ...
## Implementation Notes
## QA / Validation
## Related Items
```

Title format:

```text
[area] concise imperative task title
```

## Verification

- For API or service changes, validate platform routes, GitHub service tests, and missing-token behavior.
- For UI changes, validate the Backlog Intake view renders source filters, duplicate warnings, and promotion links.
- For live GitHub mutations, report the created issue URL, project item id, field updates attempted, and fields skipped because they were absent.
