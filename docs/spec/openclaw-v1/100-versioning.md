# 100 — Spec Versioning

> **Since:** `1.0.0-alpha.1`
> **Status:** stable
> **Schema:** [`schemas/version.schema.json`](schemas/version.schema.json)

How the OpenClaw spec evolves without breaking pipelines that target older versions. Versioning is the contract between **spec authors** (who add or change sections) and **pipeline authors** (whose work depends on a specific version remaining stable).

---

## Why this section matters

A coding agent reads the spec at version `1.2.0`, produces a conformant pipeline, and ships it. Six months later, the spec is at `1.4.0`. The pipeline must still load, run, and pass conformance — *as if the spec were still at `1.2.0`*. Without disciplined versioning, every spec change forces every pipeline to re-validate, re-test, and possibly re-build. That's the path platforms die on.

Versioning solves three concrete problems:

1. **Backward compatibility.** Pipelines targeting `1.2.0` must continue working when the runtime advances to `1.4.0`.
2. **Forward compatibility (limited).** A runtime on `1.4.0` can opportunistically run pipelines targeting `1.5.0` *if* the changes are additive only.
3. **Predictable migration.** When breaking changes are absolutely necessary (rare), pipelines have a known path to migrate, with codemod tooling and a deprecation window.

## Versioning scheme

Spec version follows **semver** with a documented mapping to spec changes:

```
<major>.<minor>.<patch>[-<prerelease>]
```

| Component | What it captures | Example trigger |
|---|---|---|
| **Major** | Breaking changes that require pipelines to migrate | A required field changes type; an enum value is removed |
| **Minor** | Additive changes; backward compatible | A new optional field; a new error category; a new hook point |
| **Patch** | Clarifications, examples, typo fixes; non-normative | Better wording in a section; new example |
| **Prerelease** | `-alpha.N`, `-beta.N`, `-rc.N` while sections are in flux | `1.0.0-alpha.1` (current) |

**Major version bumps are extremely rare.** v1 is committed to never bumping major within v1; if the spec needs a breaking change, it becomes v2 (a separate spec line, with co-existence and migration tools). The v1 line strives for indefinite minor-only growth.

## What's covered by the version

Every artifact below carries a `spec_version` field stamping the version it conforms to:

- **Pipeline manifest** — `pipeline-manifest.json#/spec_version`
- **Agent manifest** — `architecture.json#/spec_version`
- **Memory entry** — frontmatter `spec_version`
- **Tool reference** — `tools/<id>.json#/spec_version`
- **Trigger** — `triggers/<id>.json#/spec_version`
- **Config doc** — `config/<id>/manifest.json#/spec_version` and version envelopes
- **Eval suite** — `eval/tasks.json#/spec_version`
- **Checkpoint** — `Checkpoint#/spec_version`
- **Decision-log entry** — every entry's `spec_version` field
- **Dashboard manifest** — `dashboard/manifest.json#/spec_version`

The runtime reads `spec_version` and applies version-aware logic (default values, validators, behavior). This is how the same runtime serves multiple spec versions concurrently.

## Compatibility rules

### Backward compatibility (REQUIRED for minor and patch)

A minor or patch version bump MUST satisfy:

1. **No required field added** to any existing schema. New fields are optional with sensible defaults (or pipelines targeting older versions don't see them).
2. **No required field removed** or renamed. Removing means migration; renaming = remove + add, which is two breaking changes.
3. **No enum value removed.** Adding values is fine (and is what most minor bumps do — new error categories, new decision types). Removing forces pipelines to remap.
4. **No semantic change to existing field meanings.** A field that meant "X" at `1.2.0` cannot mean "Y" at `1.3.0`.
5. **No tighter validation.** A pattern that accepted a string at `1.2.0` cannot reject the same string at `1.3.0`.

When the spec author wants to make any of these changes, the answer is: don't, find another way, or escalate to v2.

### Forward compatibility (BEST-EFFORT)

A runtime at `1.4.0` SHOULD opportunistically support pipelines targeting `1.5.0` by:

- Tolerating unknown fields (additive). A `1.5.0` pipeline manifest with a new optional field that the `1.4.0` runtime doesn't recognize is loaded with a warning, the unknown field ignored.
- Tolerating unknown enum values. A `1.5.0` pipeline declaring a new error category `quota_overrun` that `1.4.0` doesn't know is treated as `unknown` (per [014](014-error-taxonomy.md)) with a warning.
- Refusing to run pipelines that depend on missing semantics. If `1.5.0` introduces a new required behavior (which is a breaking change and shouldn't happen within v1), the older runtime detects and refuses.

Forward compat is best-effort because the runtime can never know what semantic changes a future minor brings — it can only handle additive shape changes.

### Strict mode

Pipelines may opt into **strict spec_version matching**:

```json
{ "spec_version": "1.4.0", "spec_version_match": "exact" }
```

In strict mode, a `1.5.0` runtime refuses to load a `1.4.0` pipeline (and vice versa). Used by pipelines with rigid certification requirements (compliance, audit-locked deployments). Most pipelines use the default loose mode.

## Section-level versioning

Every spec section carries a `Since:` annotation in its frontmatter:

```markdown
> **Since:** `1.0.0-alpha.1`
```

Sections introduced in later versions (e.g., a hypothetical `016-rate-limit-pools` introduced at `1.3.0`) carry their introduction version. Pipelines targeting `1.2.0` ignore those sections; pipelines targeting `1.3.0+` use them.

### Section deprecation

When a section becomes obsolete, it does NOT get deleted. It moves to `999-deprecated/<original-number>.md` with a deprecation notice:

```markdown
# DEPRECATED — XXX section title

> **Deprecated since:** `1.X.0`
> **Replaced by:** [new-section-number](../new-section.md) (or "no replacement; concept is no longer needed")
> **Removal scheduled for:** v2 (the next major)

Original content preserved verbatim below.
```

The runtime continues to honor deprecated sections until the next major version. Pipelines targeting the version where the section was deprecated see a warning at load; pipelines targeting earlier versions see no change.

## Cross-schema `$ref` resolution

Many spec sections reference shapes defined in other schemas (`pipeline-manifest.schema.json` references `orchestrator.schema.json`, etc.). The runtime resolves these references via a fixed protocol. Without these rules, two implementations could resolve the same `$ref` to different objects — silently breaking composition.

### Reference URI grammar

```
<ref> ::= <local-ref> | <relative-ref> | <canonical-ref>

<local-ref>      ::= "#/$defs/" <name>                  -- within the same schema file
<relative-ref>   ::= <filename> "#/$defs/" <name>       -- e.g., "memory.schema.json#/$defs/MemoryAuthority"
<canonical-ref>  ::= "openclaw-v1:" <schema-id>          -- e.g., "openclaw-v1:RevealSchema"
```

`<local-ref>` and `<relative-ref>` are always permitted. `<canonical-ref>` requires the spec version it targets to be supported by the runtime (per [supported-version-range](#strict-mode)).

### Resolution order

When the runtime sees a `$ref`, it resolves in this order, stopping at first hit:

1. **Local lookup** — if the ref starts with `#/`, resolve within the current schema's `$defs`. Fails immediately if not found.
2. **Pipeline-local schemas** — if the ref is a relative filename (e.g., `schemas/takeoff-reading.schema.json`), look in the pipeline's own `schemas/` directory.
3. **Canonical platform schemas** — if the ref is a relative filename matching a platform schema name (`memory.schema.json`, `orchestrator.schema.json`, etc.), or a `<canonical-ref>`, resolve against the runtime's bundled spec version.
4. **Registry lookup** — for `<canonical-ref>` only: the runtime maintains a registry mapping schema-ids to canonical schema objects. Future versions may serve this from a CDN; v1 ships the registry as a compiled artifact.

The runtime **never** fetches `$ref`s over HTTP at runtime. All schemas resolve against bundled or pipeline-local files. This prevents supply-chain attacks via mutated remote schemas.

### Version pinning

Every cross-schema `$ref` is pinned to a single spec version. Resolution rules:

- A pipeline targeting `spec_version: "1.0.0"` resolves all canonical refs against the v1.0.0 schema bundle.
- Pipelines targeting an older version against a newer runtime use the runtime's *backward-compatibility schema bundle* — the runtime keeps every minor version's bundle accessible.
- Mixing canonical refs across spec versions in a single pipeline is forbidden. The conformance suite (see [101](101-conformance.md)) checks for cross-version refs and fails them.

### Cache invalidation

Schemas are immutable per `(spec_version, schema-id)`. Once `1.0.0:memory.schema.json#/$defs/MemoryAuthority` resolves to a particular shape, that shape never changes. Patches that modify `1.0.0:memory.schema.json` would violate the immutability rule and trigger a major version bump per [versioning](#what's-covered-by-the-version).

Pipeline-local schemas (in the pipeline's own `schemas/` directory) follow pipeline versioning, not spec versioning. They may evolve freely as long as the pipeline's `version` field bumps.

### Conformance check

The conformance suite ([101](101-conformance.md)) walks every `$ref` in the manifest and supporting schemas, asserting:

- Every ref resolves
- No ref crosses spec version boundaries
- No ref points outside the pipeline workspace + bundled platform schemas (no HTTP, no `~/`, no absolute filesystem paths)

Failures here are `manifest_invalid` per [014](014-error-taxonomy.md) — the pipeline does not load.

## Schema evolution

JSON Schema files in `schemas/` evolve with the spec. Rules:

- **Schema files are versioned alongside the spec.** A schema's `$id` is stable; the schema itself can grow optional fields.
- **Adding fields**: always allowed, must be `additionalProperties: false`-compatible (i.e., explicitly add the new field rather than relax the constraint).
- **Adding enum values**: allowed.
- **Tightening validation** (stricter regex, narrower enum, lower max): forbidden in minor/patch. Move to a new schema with a different `$id` if you need it.
- **Removing fields or values**: forbidden in minor/patch. Mark deprecated, schedule removal for the next major.

The conformance test suite (per [101](101-conformance.md)) includes schema-evolution tests that lock the existing shape: any change that violates these rules fails CI on the spec PR.

## Migration tools

When the spec moves between versions and pipelines need to migrate, the runtime ships **codemods**:

```
tools/spec-migrate/
├── 1.2.0-to-1.3.0/
│   ├── README.md
│   └── migrate.ts
├── 1.3.0-to-1.4.0/
└── ...
```

Each codemod:

- Reads a pipeline workspace (manifest + agents + dashboard)
- Reports what changes are needed
- Applies changes (in-place or to a copy)
- Updates `spec_version` strings throughout
- Recomputes checksums

For minor versions, codemods are usually no-ops or trivial (`spec_version: "1.3.0"` → `spec_version: "1.4.0"`). For major versions (rare), codemods do real work: rename fields, restructure manifests, transform schemas.

Codemods are versioned alongside the spec. A pipeline at `1.2.0` migrating to `1.4.0` runs the chain: `1.2.0-to-1.3.0`, then `1.3.0-to-1.4.0`. Each step is independently auditable.

## Spec PR workflow

When changing the spec:

1. **Identify the version impact.** Patch / minor / major? If unsure, default to the more conservative bump.
2. **Update affected sections.** Every section that materially changes gets its `Since:` updated (only for new sections; existing sections keep their original `Since:`).
3. **Update schemas.** Add fields, add enum values; never tighten or remove.
4. **Update the index.** `000-INDEX.md` reflects the new version in its frontmatter.
5. **Add a changelog entry.** `CHANGELOG.md` (in the spec directory) records the bump with rationale.
6. **Run conformance tests.** Spec evolution tests verify no breaking change snuck in.
7. **Add migration tooling** if any artifact authoring guidance changes (even for minor bumps; the codemod may be a no-op).
8. **Bump the version** in `000-INDEX.md` and tag a release.

The spec PR template (deferred to v1.1) automates steps 6-8.

## Pipeline lifecycle across versions

A pipeline's `spec_version` is fixed at *generation time*. The architect produces a pipeline targeting the spec version available when it ran. The pipeline ships with that version stamp.

When the runtime advances to a newer spec version, the pipeline:

1. **Loads** unchanged at its target version (backward-compat guarantee)
2. **Runs** unchanged (same behavior the architect designed for)
3. **Optionally migrates** when the operator chooses to: run codemods, regenerate the pipeline manifest, re-run eval suite, ship at the new version

Pipelines do NOT auto-upgrade. Migration is explicit, observable, and reversible.

## v1 → v2 (hypothetical)

If the spec ever needs a major bump, here's the process:

- **`v2/` directory** lives alongside `v1/`, with its own INDEX, sections, and schemas
- Both runtimes can co-exist; pipelines target one or the other explicitly
- v1 pipelines continue running indefinitely; new pipelines may target v2
- Migration tooling produces v2 versions of v1 pipelines (best-effort; some manual work expected)
- v1 enters **maintenance mode**: only critical bug-fix patches; no new features
- After a documented sunset window (typically 18-24 months), v1 reaches end-of-life

This contract gives v1 customers (ECC) certainty: their pipeline keeps working through v2's emergence. Whatever changes v2 brings, ECC's commitment is to v1 until they choose to migrate.

## Anti-example — common defects

**Adding a required field in a minor bump:**

```json
// 1.3.0 schema
{
  "required": ["id", "type", "title", "tier", "lane", "source_identity", "status", "new_required_field"]
  // ❌ "new_required_field" wasn't required at 1.2.0; pipelines break on load
}
```

The conformance test fails the spec PR. The fix: make it optional with a default, OR escalate to v2.

**Removing an enum value in a minor bump:**

```json
// 1.3.0 — error.schema.json
"enum": ["context_too_long", "rate_limit", "auth_error", /* dropped: "model_refusal" */]
// ❌ pipelines targeting 1.2.0 may classify errors as "model_refusal"
```

The conformance test fails. The fix: keep the enum value, mark it deprecated in markdown with a `Deprecated since: 1.3.0` annotation, schedule for v2 removal.

**Renaming a field "for clarity" in a minor bump:**

```json
// 1.3.0
{ "memory_lanes_writers": [...] }   // was "memory_authority" at 1.2.0
// ❌ rename is remove + add; pipelines break
```

Don't. Add a new field, alias the old one as a synonym for one major cycle, deprecate. Or escalate to v2.

## Cross-references

- [[002-agent-manifest]] — every manifest carries `spec_version`
- [[011-pipeline-manifest]] — pipeline-level `spec_version` plus `spec_version_match` mode
- [[101-conformance]] — schema-evolution tests that gate spec PRs

## Open questions for v1 evolution

- Forward compat for new hooks: when a new hook point is added in a minor, older pipelines never fire it (they wouldn't know to). Is that fire-and-forget enough, or should the spec require a registration declaration that older runtimes warn-and-skip on? **Tentative**: the latter — `custom_hooks[]` already requires declaration, and adding a canonical hook in a minor extends the canonical list (handlers registered for it on older runtimes are no-ops with a warning).
- The codemod toolchain is described but not yet implemented. v1 patches will assume codemods are no-ops; the first real codemod arrives whenever the first minor bump introduces a non-trivial migration. **Tentative**: prioritize tooling at v1.1.
- Versioning for custom artifacts (custom panels, custom tool kinds, custom hooks): do they version with the spec or independently? **Tentative**: independently — a pipeline can advance its custom panels' versions without touching `spec_version`. The spec governs the *interface*; the implementation versions on its own.
