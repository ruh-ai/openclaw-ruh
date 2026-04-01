# Ruh App Login Convenience Design

## Summary

`ruh_app` needs two small login-page ergonomics improvements for local testing and normal customer use: a password visibility toggle and a safe "Remember me" behavior. The approved direction is to improve the form without storing raw passwords on-device.

## Problem

The native login screen currently obscures the password with no reveal control and forgets the email address after logout/session expiry. The app already persists the access token for session restore, so storing the raw password would add security risk without improving the authenticated flow.

## Options

### Option 1: Show/hide password + remember email only

Recommended. Keep the existing session persistence, add an eye toggle on the password field, and store only the remembered email plus opt-in state in local preferences.

### Option 2: Show/hide password + remember raw password

Rejected. Even with secure storage, saving the raw password increases local credential exposure and is unnecessary because the app already restores sessions through the stored access token.

### Option 3: Show/hide password only

Viable but incomplete. It fixes the immediate form-friction problem while leaving repeated login after logout/session expiry more tedious than necessary.

## Design

### Storage Contract

- Add a small login-preferences service under `ruh_app/lib/services/`
- Persist only:
  - `remember_email` boolean
  - `saved_email` string
- Use `SharedPreferences`, matching existing low-sensitivity device preferences in the Flutter app
- Do not store the raw password

### Login Screen Behavior

- Add a suffix-icon button to toggle password visibility
- Add a `Remember me` checkbox under the password field
- On screen init:
  - load the remembered-email preference
  - prefill the email field if enabled
- On successful login:
  - save the email when `Remember me` is enabled
  - clear any remembered email when it is disabled

### Auth Contract

- Leave backend auth unchanged
- Leave access-token persistence unchanged
- Keep the router/bootstrap flow exactly as it is today

## Testing

- widget tests for password visibility toggle and remember-email UI behavior
- service test for the login-preferences storage contract

