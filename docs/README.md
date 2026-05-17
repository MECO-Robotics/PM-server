# Documentation Index

Use this folder for living project documentation and historical requirements artifacts. Prefer updating an existing topic file before adding a new one.

## Living Docs

- `api-reference.md`: current backend route surface, response conventions, auth notes, and integration endpoints.
- `backend-overview.md`: runtime architecture, source layout, data model, security posture, integrations, local workflow, deployment, and documentation maintenance.
- `cad-step-mapping.md`: STEP import workflow, parser behavior, CAD persistence, mapping review, finalization, and current limits.
- `onshape-integration.md`: Onshape OAuth, document references, sync levels, budgeting, permissions, route behavior, and known limitations.

## Historical Artifacts

- `MECO_Requirements.docx`
- `MECO_Requirements_v10_clean.docx`
- `MECO_Requirements_v11.docx`
- `MECO_Requirements_v12.docx`
- `MECO_Requirements_v13.docx`
- `MECO_Requirements_v14.docx`
- `MECO_MVP_Spec_v10.docx`
- `MECO_MVP_Spec_v11.docx`
- `MECO_MVP_Spec_v12.docx`
- `MECO_MVP_Spec_v13.docx`
- `MECO_Spec_v14.docx`

## Update Rules

- Update `api-reference.md` when a route, method, auth requirement, or major response shape changes.
- Update `backend-overview.md` when source layout, runtime assumptions, environment requirements, deployment workflow, or verification commands change.
- Update `cad-step-mapping.md` when STEP parser modes, CAD store behavior, mapping rules, hierarchy review, diffing, or finalization changes.
- Update `onshape-integration.md` when Onshape OAuth, reference parsing, sync levels, request budgeting, permissions, or route behavior changes.
- Add a new Markdown file only when the topic does not fit one of the living docs and has more than five concrete points to document.
- Keep Word files as source/history snapshots, not as the only record of implemented behavior.
