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

## API Surface

- `POST /api/cad/step-imports/debug-parse` parses an uploaded STEP payload and returns parser diagnostics without creating durable import records.
- `POST /api/cad/step-imports` creates an import run, snapshot, assembly nodes, part definitions, part instances, warnings, and initial mapping proposals.
- `GET /api/cad/import-runs` lists import runs, with query handling in `src/cad/routes/cadRouteQueries.ts`.
- `GET /api/cad/import-runs/:importRunId` returns one import run with its snapshot and warnings.
- `GET /api/cad/snapshots` lists CAD snapshots.
- `GET /api/cad/snapshots/:snapshotId` returns snapshot metadata plus counts and parser summary fields.
- `GET /api/cad/snapshots/:snapshotId/tree` returns the imported hierarchy; `groupInstances=true` groups repeated instances.
- `GET /api/cad/snapshots/:snapshotId/mappings` returns snapshot mapping proposals, optionally grouped by instance.
- `GET /api/cad/snapshots/:snapshotId/hierarchy-review` returns hierarchy review issues and inferred structure decisions.
- `GET /api/cad/snapshots/:snapshotId/part-match-proposals` proposes matches between imported CAD parts and existing platform parts.
- `POST /api/cad/snapshots/:snapshotId/hierarchy-review/apply` applies hierarchy review decisions.
- `POST /api/cad/snapshots/:snapshotId/mappings/apply` confirms, rejects, or revises snapshot mappings.
- `POST /api/cad/snapshots/:snapshotId/finalize` marks a snapshot finalized after hierarchy validation, unless unresolved issues are explicitly allowed.
- `GET /api/cad/snapshots/:snapshotId/diff` compares the snapshot to the previous comparable CAD snapshot.
- `POST /api/cad/mapping-rules` creates a reusable mapping rule for future imports.
- `PATCH /api/cad/mapping-rules/:id` updates an existing mapping rule.

## STEP Export Guidance

- Export from the master assembly.
- Preserve assembly hierarchy.
- Avoid flattened STEP exports.
- Use meaningful assembly and part names.
- Prefer names such as `SUB - Shooter`, `MECH - Shooter - Flywheel`, `ASM - Shooter - Flywheel`, and `PRT - Shooter - Flywheel - Spacer`.

If a file is flattened or uses generic names, Mission Control imports what it can, generates warnings, and requires manual review.

## Parser Boundary

The MVP uses `StepParserClient` with a lightweight STEP text assembly parser by default. It reads the ISO-10303-21 text graph for `PRODUCT`, `PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE`, `PRODUCT_DEFINITION`, and `NEXT_ASSEMBLY_USAGE_OCCURRENCE` entities, then emits normalized assembly nodes, part definitions, and part instances.

This parser intentionally does not parse geometry, mass properties, or shape-level diffs. A future Python/Open CASCADE worker can replace or supplement it behind the same interface.

Parser modes:

- `CAD_STEP_PARSER_MODE=auto` is the default. JSON fixtures are accepted when the upload body starts as JSON; normal `.step` and `.stp` text uses the STEP assembly graph parser.
- `CAD_STEP_PARSER_MODE=step_text` forces the STEP text assembly parser and is recommended for real STEP testing.
- `CAD_STEP_PARSER_MODE=json_fixture` is for tests that feed normalized JSON fixtures.
- `CAD_STEP_PARSER_MODE=placeholder` is explicit test/demo mode only, never production. It returns visibly fake names such as `PLACEHOLDER PARSER RESULT - NOT REAL CAD`, emits an `ERROR` warning with `step_parser_placeholder_used`, and must not be treated as uploaded CAD evidence. Production startup refuses this mode.

Upload responses and import run summaries include parser diagnostics: configured parser mode, actual parser version, placeholder-used flag, STEP entity counts, product counts, `NEXT_ASSEMBLY_USAGE_OCCURRENCE` counts, root names, top-level assembly names, and the first detected assembly names. If the STEP text parser cannot recover a graph, it returns the flat or failed parse result with warnings; it does not fall back to placeholder output.

Do not parse large native CAD geometry inside the main request path.

## Persistence

Generic CAD import records are Prisma-backed by default through `CAD_STORE_DRIVER=prisma`. Tests and local compatibility flows can opt into `CAD_STORE_DRIVER=runtime`. The store selection is centralized in `src/cad/cadStoreFactory.ts`, while legacy runtime state remains available for isolated tests and local smoke paths.

Snapshots are historical evidence. Do not rewrite old snapshots when mappings change. Use snapshot mappings for one-off decisions and create/supersede mapping rules for future-import behavior.

Finalized snapshots keep their historical parser diagnostics, warning records, tree, and mapping review decisions. New uploads should create new import runs and snapshots rather than mutating previous evidence.

## Upload Size

STEP uploads default to a 250 MiB server-side limit. Deployments can override this with `CAD_STEP_UPLOAD_MAX_BYTES` when teams need a smaller or larger cap.

## Current Limits

- No browser geometry viewer.
- No mass property or material extraction beyond parser-provided metadata.
- No shape-level geometry diffing.
- No automatic subsystem, mechanism, manufacturing, or QA task creation.
- Onshape sync remains future-compatible scaffolding and should eventually emit the same normalized CAD graph as STEP.
