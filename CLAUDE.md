# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install       # Install dependencies (uses bun.lock)
bun dev           # Start dev server at 0.0.0.0:3000
bun run build     # Build for production (Nuxt/Nitro) + run scripts/fix-unhead-bundle.mjs
bun run generate  # Static site generation
bun run preview   # Preview production build
```

No test or lint commands are configured. The `build` script chains `nuxt build && node ./scripts/fix-unhead-bundle.mjs` — the post-step copies missing `unhead/dist/*` files into `.output/server/node_modules/` to work around a Nitro bundling gap that crashes prod runtime with `ERR_MODULE_NOT_FOUND` on `unhead/server`.

Deployment is via GitHub Actions (`.github/workflows/deploy_main.yml`) on push to `main` — SSH-deploys to a VPS at `/home/frontend/simplepixelart`: `git stash → git pull → rm -rf .output .nuxt → install bun if missing → bun install → bun run build → pm2 restart simplepixelart`.

## Architecture

**SimplePixelArt.com** — a pixel art creation and discovery platform built with Nuxt 4 (Vue 3, SSR hybrid).

### Stack
- **Nuxt 4** — source lives under `app/` (Nuxt 4 convention), not `src/`
- **Pinia** for state management (`app/stores/`)
- **TailwindCSS v4** via `@tailwindcss/vite` plugin (no PostCSS config). `tailwind.config.js` is legacy/minimal.
- **Nitro** server routes for sitemaps (`server/routes/sitemap-*.xml.ts`)
- **External API**: `https://touch.ninosaur.com` — all data (art, users, tags, collections) comes from here. Configurable via `NUXT_PUBLIC_API`.
- **Auth**: Cookie-based Bearer tokens (`auth_token` cookie via `useStatefulCookie`), initialized in `app/plugins/auth.client.ts` and `auth.server.ts`
- **Local Nuxt module**: `modules/custom-icons-standalone/` — Vite plugin that inlines icon CSS. Note: not currently registered in `nuxt.config.ts` `modules`.

### Key Directories
- `app/pages/` — file-based routes. Detail pages use the `[id_string].vue` dynamic param convention (e.g. `art/[id_string].vue`, `arts/[id_string].vue`, `creator/[id_string].vue`, `work/[collection].vue`)
- `app/components/` — auto-imported; `ui/` for generic UI (Tooltip, DropdownMenu, etc.), `editor/` for editor-specific (Palette), `partial/` for Header/Footer, `item/` for Card/List
- `app/stores/` — `editor.store.ts` (~580 lines, canvas/editor state, undo/redo, auto-save), `auth.store.ts` (session/token)
- `app/composables/` — `useCustomFetch.ts` exports **`useNativeFetch`** (promise-based `$fetch`) and **`useAuthFetch`** (reactive `useFetch`); both inject the Bearer token and base URL. Also `useCustomSeoMeta`, `useStorage`, `useStatefulCookie`.
- `app/helper/` — pure utility modules: `canvas.ts` (~820 lines, heavy image processing/pixel rendering), `color.ts`, `utils.ts`, `animate.ts`, `constants.ts`, `parser.ts`
- `app/types/index.ts` — shared TypeScript interfaces (`EditorData`, `SharedPage`, `Layer`, `User`, `APIResponse<T>`, etc.)

### Editor State (`editor.store.ts`)
The main pixel art editor is the most complex part of the app:
- `editorData` holds the full canvas state (layers, palette, size)
- `virtualLayer` is a temporary rendering layer for real-time drawing preview
- `history` array with index enables undo/redo
- `currentTool` tracks active brush mode
- Mirror mode (horizontal/vertical) is supported
- Debounced auto-save logic is built into the store

### Canvas Rendering (`helper/canvas.ts`)
This is the heaviest module (~28KB). It handles:
- Layer-to-pixel-map conversion
- DataURL-to-grid analysis with threshold-based sampling
- Color processing with memory pooling
- Image crop detection with erosion algorithms

### API Pattern
All API calls go through `useNativeFetch` / `useAuthFetch` (from `app/composables/useCustomFetch.ts`), which inject the auth Bearer token from the `auth_token` cookie and route to `runtimeConfig.public.api` (default `touch.ninosaur.com`). Response shape is `APIResponse<T>` with pagination. Use `useAuthFetch` in SSR-aware page-level calls; `useNativeFetch` for imperative calls (e.g. inside store actions).

### SEO
- `useCustomSeoMeta` composable handles OG/Twitter meta injection per page
- JSON-LD structured data is added globally in `nuxt.config.ts`
- Dynamic XML sitemaps are generated via Nitro server routes in `server/routes/`
- `strictNullChecks` is disabled in tsconfig
