# Desktop Application

[[000-INDEX|← Index]] | [[014-auth-system|Auth System]] | [[016-marketplace|Marketplace]]

## Status
<!-- implemented (scaffolded, requires Rust toolchain to build) -->

## Summary

Tauri v2 desktop application wrapping ruh-frontend. Provides native credential storage, configurable backend URL, system notifications, and cross-platform builds (macOS, Windows, Linux).

## Related Notes
- [[014-auth-system]] — Auth tokens stored securely via Tauri plugin-store
- [[016-marketplace]] — End users browse marketplace from desktop app
- [[009-ruh-frontend]] — The web app wrapped by Tauri

## Architecture

```
desktop-app/
  src-tauri/
    tauri.conf.json     # Window config, plugins, build settings
    src/
      lib.rs            # Tauri app setup, plugin registration
      main.rs           # Entry point
      commands/
        auth.rs         # Credential storage (plugin-store)
        settings.rs     # Backend URL + preferences (~/.ruh/config.json)
```

In dev mode, Tauri's webview points to `http://localhost:3001` (ruh-frontend dev server).

## Native Features

| Feature | Implementation |
|---------|---------------|
| Secure credentials | tauri-plugin-store (encrypted local file) |
| Backend URL config | `~/.ruh/config.json` via Rust fs |
| System notifications | tauri-plugin-notification |
| Auto-updater | tauri-plugin-updater (endpoint TBD) |

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `store_credentials` | Save access + refresh tokens |
| `get_credentials` | Retrieve stored tokens |
| `clear_credentials` | Delete stored tokens |
| `get_settings` | Read app settings |
| `update_settings` | Write app settings |

## Frontend Integration

ruh-frontend detects Tauri via `window.__TAURI__`:

| File | Purpose |
|------|---------|
| `ruh-frontend/lib/platform.ts` | `isTauri()` detection |
| `ruh-frontend/lib/desktop/credentials.ts` | Tauri commands with web cookie fallback |
| `ruh-frontend/lib/desktop/settings.ts` | Tauri settings with localStorage fallback |
| `ruh-frontend/app/settings/page.tsx` | Preferences UI (backend URL, theme, auto-connect) |

## Build Targets

- macOS ARM (aarch64-apple-darwin)
- macOS Intel (x86_64-apple-darwin)
- Windows (x86_64-pc-windows-msvc)
- Linux (x86_64-unknown-linux-gnu)

## Prerequisites

- Rust toolchain (rustup.rs)
- Node.js 18+
- ruh-frontend running at localhost:3001

## Key Files

| File | Purpose |
|------|---------|
| `desktop-app/src-tauri/tauri.conf.json` | App config |
| `desktop-app/src-tauri/Cargo.toml` | Rust dependencies |
| `desktop-app/src-tauri/src/lib.rs` | App setup |
| `desktop-app/src-tauri/src/commands/` | Native commands |
| `desktop-app/package.json` | Node deps + scripts |
