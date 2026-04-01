# Desktop Application (Deprecated)

[[000-INDEX|← Index]] | [[018-ruh-app|Flutter Client App]] | [[SPEC-remove-tauri-desktop-app|Removal Spec]]

## Status
<!-- deprecated -->

## Summary

The old `desktop-app/` Tauri wrapper has been removed from the active product surface to reduce confusion. `ruh_app/` is now the only native desktop/mobile client path, and `ruh-frontend` remains the customer web app.

## Related Notes
- [[018-ruh-app]] — canonical native client path for customer org admins and members
- [[009-ruh-frontend]] — customer web surface that remains in the repo
- [[SPEC-remove-tauri-desktop-app]] — records the removal and the repo/doc cleanup contract

## Deprecation Notes

- The `desktop-app/` directory no longer exists in the repo.
- `ruh-frontend` no longer carries Tauri-only credential or settings bridges.
- Historical journal/spec references may still mention the old Tauri wrapper; treat them as historical context only.

## Replacement

Use [[018-ruh-app]] for native customer application work and [[009-ruh-frontend]] for the customer web surface.
