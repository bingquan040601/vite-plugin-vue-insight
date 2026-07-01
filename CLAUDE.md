# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`vite-plugin-vue-insight` is a Vite plugin for Vue 3 that enables Alt+Shift click on page elements to highlight DOM nodes, print component state to the console, and open the corresponding source file in the editor.

## Commands

Root package (library):

```bash
# No build step — published directly as source
```

Demo app (`demo/`):

```bash
cd demo
npm run dev      # Start Vite dev server on localhost
npm run build    # Production build
npm run preview  # Preview production build
```

Publishing to npm (authenticated):

```bash
npm publish
```

## Architecture

The plugin lives in a single file: `src/vite-plugin.js` (~447 lines). It exports `vueInsightPlugin()` via `src/index.js`.

### Two-Phase Design

**Phase 1 — Build-time injection** (`transform` hook):
- Intercepts `.vue` SFC files during Vite's transform phase
- Parses each file with `@vue/compiler-sfc` to extract the `<template>` block
- Iterates over template content character-by-character, identifies HTML tag openers
- Skips component tags (PascalCase), virtual tags (`<template>`, `<slot>`, `<component>`), comments, and closing tags
- Injects `data-v-insight-file`, `data-v-insight-abspath`, `data-v-insight-line`, `data-v-insight-component` attributes into each native HTML tag
- Line numbers are computed by counting newlines in the template content and adding the base offset from the SFC

**Phase 2 — Runtime injection** (`transformIndexHtml` hook):
- Injects an inline `<script type="module">` into `index.html` (via `body-prepend`)
- No external client bundle — the entire runtime is inlined as a template literal (`inspectorClientCode`)

### Client Runtime (inline script in `inspectorClientCode`)

The injected client script is wrapped in an IIFE and handles:

| Feature | Implementation |
|---|---|
| **Activation** | `keydown`/`keyup` listeners detect `Alt+Shift` (Mac shows `⌥+Shift`) |
| **Preview highlight** | Blue border overlay (`position:fixed`, `pointer-events:none`) on hover via `requestAnimationFrame`-throttled `mousemove` |
| **Selection prevention** | `selectstart` event listener calls `preventDefault()` while inspecting |
| **Click highlight** | Red pulsing border overlay with CSS `@keyframes __v-insight-pulse` animation (lasts `highlightDuration`, default 4000ms) |
| **Editor launch** | `fetch('/__open-in-editor?file=path:line:col')` → server-side middleware; fallback: `location.href` with editor URL scheme |
| **Component state** | Reads `el.__vueParentComponent` to extract props and reactive state (refs/reactive), printed via `console.log` |
| **Shareable link** | Generates `vscode://file/...` (or `cursor://`, `webstorm://`, etc.) and copies to clipboard |

### Server Middleware (`configureServer` hook)

Handles `/__open-in-editor` requests by spawning the configured editor as a detached child process:
- `vscode` → `code -g file:line:col`
- `cursor` → `cursor -g file:line:col`
- `vscode-insiders` → `code-insiders -g file:line:col`
- `webstorm` → `webstorm --line line --column col file`

### Edge Case: File paths with colons

The `file` query parameter uses `filePath:line:col` format. On Windows, absolute paths start with `C:`, so `parts[0]` would only get `C`. This is a known limitation — the plugin currently passes the relative path (from `file` attribute) as primary and absolute path (from `abspath`) as fallback.

### Window config

`window.__VUE_INSIGHT__` is set before the IIFE runs, containing `editor`, `attrPrefix`, `modifiers`, `highlightColor`, and `highlightDuration`. The client runtime reads this to configure behavior.

## Demo

`demo/` is a standalone Vite + Vue 3 app that links the plugin locally (`file:..`). It serves as the development and manual testing environment. Run `cd demo && npm run dev` to test plugin changes.
