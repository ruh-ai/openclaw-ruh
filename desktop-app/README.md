# Ruh Desktop

Desktop application for Ruh.ai — wraps the ruh-frontend web app using Tauri.

## Prerequisites

- Rust (install via https://rustup.rs)
- Node.js 18+
- ruh-frontend running at http://localhost:3001

## Development

```bash
# Start ruh-frontend first
cd ../ruh-frontend && npm run dev

# Then start the desktop app
cd ../desktop-app && npm install && npm run dev
```

## Build

```bash
npm run build
```

Produces installers for your platform in `src-tauri/target/release/bundle/`.

## Architecture

- **Tauri v2** wraps ruh-frontend's dev server (or built static files)
- **Secure credential storage** via tauri-plugin-store (encrypted local file)
- **Settings** stored at `~/.ruh/config.json`
- **Native menus** and keyboard shortcuts
