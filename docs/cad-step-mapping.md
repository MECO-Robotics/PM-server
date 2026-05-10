# STEP CAD Mapping MVP

Mission Control treats STEP uploads as repeatable CAD iterations. STEP parsing detects structure; Mission Control mapping rules decide what that structure means.

## Workflow

1. Upload a `.step` or `.stp` export from the robot master assembly.
2. The parser adapter emits a normalized assembly and part graph.
3. The backend creates a durable `CadImportRun` and historical `CadSnapshot`.
4. Detected `CadAssemblyNode`, `CadPartDefinition`, and `CadPartInstance` records are stored for that snapshot.
5. Active `CadMappingRule` records create `CadSnapshotMapping` proposals.
6. Students review the tree and mappings, then confirm snapshot-only or future-import mappings.
7. Future STEP uploads compare against the previous snapshot and reuse active rules.

## STEP Export Guidance

- Export from the master assembly.
- Preserve assembly hierarchy.
- Avoid flattened STEP exports.
- Use meaningful assembly and part names.
- Prefer names such as `SUB - Shooter`, `MECH - Shooter - Flywheel`, `ASM - Shooter - Flywheel`, and `PRT - Shooter - Flywheel - Spacer`.

If a file is flattened or uses generic names, Mission Control imports what it can, generates warnings, and requires manual review.

## Parser Boundary

The MVP uses `StepParserClient` with a mock/local parser adapter for smoke flows. Real STEP parsing should be added behind the same interface, likely as a Python/Open CASCADE worker that emits normalized JSON. Do not parse large native CAD files inside the main request path.

## Persistence

Generic CAD import records are Prisma-backed by default through `CAD_STORE_DRIVER=prisma`. Tests and local compatibility flows can opt into `CAD_STORE_DRIVER=runtime`.

Snapshots are historical evidence. Do not rewrite old snapshots when mappings change. Use snapshot mappings for one-off decisions and create/supersede mapping rules for future-import behavior.

## Upload Size

STEP uploads default to a 250 MiB server-side limit. Deployments can override this with `CAD_STEP_UPLOAD_MAX_BYTES` when teams need a smaller or larger cap.

## Current Limits

- No browser geometry viewer.
- No mass property or material extraction beyond parser-provided metadata.
- No shape-level geometry diffing.
- No automatic subsystem, mechanism, manufacturing, or QA task creation.
- Onshape sync remains future-compatible scaffolding and should eventually emit the same normalized CAD graph as STEP.
