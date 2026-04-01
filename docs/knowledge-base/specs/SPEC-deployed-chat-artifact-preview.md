# SPEC: Deployed Chat Artifact Preview

[[000-INDEX|← Index]] | [[SPEC-deployed-chat-files-and-artifacts-workspace]] | [[008-agent-builder-ui]]

## Status

implemented

## Summary

The deployed-agent Files workspace now distinguishes deliverable types instead of treating every text-like file the same. This slice adds artifact classification, optional session/turn metadata, rendered HTML and markdown previews, and an output-oriented gallery view so operators can inspect what the agent produced without opening files one by one.

## Related Notes

- [[000-INDEX]] — indexes the artifact-preview contract for future workspace work
- [[004-api-reference]] — documents the extended file payload with `artifact_type` and output metadata
- [[008-agent-builder-ui]] — owns the Files panel artifact badges, gallery view, and rich previews
- [[011-key-flows]] — describes how operators inspect generated deliverables from deployed chat
- [[SPEC-deployed-chat-files-and-artifacts-workspace]] — foundational bounded workspace list/read/download contract this slice extends

## Specification

### Artifact Classification Contract

Workspace list and read responses continue to return the existing `preview_kind` field for backwards compatibility, and now also return:

- `artifact_type` — one of `webpage`, `document`, `data`, `code`, `image`, `archive`, or `other`
- `source_conversation_id` — session identifier inferred from `sessions/<conversation_id>/...` paths when applicable
- `source_conversation_turn` — optional turn identifier loaded from session metadata when available
- `output_label` — optional operator-facing label for the output
- `source_description` — optional description of why the artifact exists or what produced it

Classification is deterministic from path extension, MIME type, and the already-computed preview kind:

- HTML is classified as `webpage`
- Markdown, plain text, logs, and PDFs are classified as `document`
- JSON, YAML, CSV, and XML are classified as `data`
- Source files and scripts are classified as `code`
- Images remain `image`
- Archives such as `zip` and `tar.gz` are classified as `archive`
- Unrecognized binaries fall back to `other`

### Optional Artifact Metadata

When a file lives inside `~/.openclaw/workspace/sessions/<conversation_id>/`, the backend looks for `~/.openclaw/workspace/sessions/<conversation_id>/.openclaw-artifacts.json`.

Supported manifest shape:

```json
{
  "files": {
    "reports/daily.md": {
      "source_conversation_turn": "turn-7",
      "output_label": "Daily report",
      "source_description": "Generated from the revenue summary tool output"
    }
  }
}
```

If the manifest is absent or malformed, the backend fails closed to type-only classification and still returns the inferred `source_conversation_id`.

### Files Panel UX

- The existing Files list remains the default browse mode.
- Operators can switch to a `Gallery` mode that groups files by `artifact_type`.
- File rows and gallery cards show artifact badges so output categories are scannable at a glance.
- Rich previews are added without removing the previous preview and download affordances:
  - HTML files render in a sandboxed `iframe` via `srcDoc`, with a `Source` toggle for raw markup
  - Markdown files render as formatted content
  - Image files still render inline and additionally expose a thumbnail strip/grid when multiple images exist
  - PDF and binary files remain download-first in this slice

### Scope Limits

This slice does not add:

- persistent file editing or write-back mutations
- inline PDF rendering
- guaranteed turn metadata for every artifact without upstream manifest writers
- artifact revision history or cross-session registries

## Implementation Notes

- Backend artifact classification and metadata resolution live in `ruh-backend/src/workspaceFiles.ts` so list/read/download contracts stay consistent.
- The optional metadata file is session-scoped and browser-safe; it exposes only bounded descriptive fields.
- Frontend grouping and preview helpers live in `agent-builder-ui/lib/openclaw/files-workspace.ts` so Files-panel presentation logic stays deterministic and testable.

## Test Plan

- Backend unit: classify preview kinds and artifact types deterministically
- Backend route wiring: file read/list routes continue returning bounded safe payloads with the new fields
- Frontend helper tests: grouping, artifact labels, and rich-preview detection stay stable
- Frontend compile signal: the Files panel consumes the extended payload shape without introducing new builder-specific type errors
