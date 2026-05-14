# cool-buddy-tauri

Tauri 2 migration workspace for `cool-buddy`.

## What is already done

- scaffolded with the latest Tauri 2 toolchain
- copied the existing Vue renderer structure into this sub-project
- added a browser-side `window.api` compatibility layer so the renderer can keep the same calling shape
- enabled Tauri bundling config and desktop plugins for dialog and opener
- switched app icons to the existing project branding assets

## Current migration boundary

This folder is ready as a Tauri shell and can build the renderer, but the heavy system runtime is still only partially migrated:

- session and provider settings are persisted with browser storage for now
- provider model loading works directly from the renderer
- SSH terminal, remote file system, and harmless-agent runtime are still placeholder implementations

## Next recommended step

Port the Electron main-process modules under `../src/main` into real Tauri commands or plugins module by module, starting with:

1. session store
2. SSH runtime
3. remote file operations
4. harmless agent runtime
