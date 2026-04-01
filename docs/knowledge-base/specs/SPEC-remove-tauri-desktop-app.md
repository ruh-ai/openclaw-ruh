# SPEC: Remove Tauri Desktop App

[[000-INDEX|← Index]] | [[017-desktop-app|Deprecated Desktop Note]] | [[018-ruh-app|Flutter Client App]]

## Status
<!-- implemented -->

## Summary

Remove the deprecated `desktop-app/` Tauri wrapper from the repo so the active customer-client story is unambiguous: `ruh-frontend` for the web surface and `ruh_app` for the native client surface. The repo, KB, and root instructions should stop advertising Tauri as a supported path.

## Related Notes
- [[017-desktop-app]] — historical note retained as deprecated context
- [[018-ruh-app]] — canonical native client path after removal
- [[001-architecture]] — system/service map must stop presenting Tauri as a live surface

## Specification

- Delete the `desktop-app/` project from the repo.
- Remove Tauri-specific bridges from `ruh-frontend`.
- Keep customer-web settings behavior functional without native wrappers.
- Update KB/docs/instructions so `ruh_app` is the only native client path.
- Preserve a deprecated [[017-desktop-app]] note so historical backlinks remain valid.

## Implementation Notes

- `ruh-frontend/app/settings/page.tsx` now uses local browser storage directly for settings.
- `ruh-frontend/lib/platform.ts`, `ruh-frontend/lib/desktop/*`, and the Tauri type shim are removed.
- `desktop-app/` is deleted from the working tree.

## Test Plan

- `cd ruh-frontend && npx tsc --noEmit`
- Verify no live repo instructions or KB service maps present `desktop-app` as an active service.
