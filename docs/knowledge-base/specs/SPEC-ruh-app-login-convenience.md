# SPEC: Ruh App Login Convenience

[[000-INDEX|← Index]] | [[018-ruh-app]] | [[014-auth-system]]

## Status

implemented

## Summary

The Flutter customer app should make local/native login easier without weakening auth. This spec adds a password visibility toggle plus an opt-in remembered-email flow that stores only the email on-device while leaving existing access-token session persistence unchanged.

## Related Notes

- [[018-ruh-app]] — login screen, native auth flow, and local preferences
- [[014-auth-system]] — native auth contract and token/session behavior

## Specification

### Login Form UX

- Add a suffix control on the password field to toggle between hidden and visible text
- Add a `Remember me` checkbox below the password field
- Preserve the current submit/loading/error behavior

### Device Storage

- Persist only:
  - a boolean indicating whether remembered email is enabled
  - the remembered email string
- Do not persist the raw password
- Continue storing the bearer/access token using the existing native token store

### Login Behavior

- On screen load:
  - read the remembered-email preference
  - prefill the email field only when the preference is enabled
- On successful login:
  - save the email if `Remember me` is enabled
  - clear the remembered email if `Remember me` is disabled
- Failed logins must not overwrite stored preferences

## Implementation Notes

- Add a small shared-preferences-backed login preferences service under `ruh_app/lib/services/`
- Expose that service through a Riverpod provider so widget tests can override it cleanly
- Keep the auth controller and backend auth contract unchanged beyond the new client-side preference writes

## Test Plan

- widget tests for password visibility toggle
- widget tests for remembered-email preload/save behavior
- service tests for shared-preferences persistence semantics
