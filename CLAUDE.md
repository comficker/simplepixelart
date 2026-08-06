# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install       # Install dependencies (uses bun.lock)
bun dev           # Start dev server at 0.0.0.0:3000
bun run build     # Build for production (Nuxt/Nitro) + run scripts/fix-unhead-bundle.mjs
bun run generate  # Static site generation
bun run preview   # Preview production build

bun run scripts/build-pack.ts --tileset <id_string>   # Build a distributable asset pack → ./packs/<slug>/
```

`scripts/build-pack.ts` turns a published tileset into a distributable folder (packed PNG, Godot
`.tres`, Tiled `.tsx`, JSON, palette, cover, README/LICENSE/CREDITS). It renders the sheet with
`sharp` but lays it out via `app/helper/sheet-layout.ts` — the same helper the editor uses — so the
offline PNG is identical to the in-browser download. Tilesets are private by default in the API;
pass `--token <jwt>` for anything not `status=public`.

No test or lint commands are configured. The `build` script chains `nuxt build && node ./scripts/fix-unhead-bundle.mjs` — the post-step copies missing `unhead/dist/*` files into `.output/server/node_modules/` to work around a Nitro bundling gap that crashes prod runtime with `ERR_MODULE_NOT_FOUND` on `unhead/server`.

## Architecture

**SimplePixelArt.com** — a pixel art creation and discovery platform built with Nuxt 4 (Vue 3, SSR hybrid).

### Stack
- **Nuxt 4** — source lives under `app/` (Nuxt 4 convention), not `src/`
- **Pinia** for state management (`app/stores/`)
- **Pure CSS** design system in `app/assets/css/main.css` (no Tailwind at runtime; a minimal preflight replaces it)
- **Nitro** server routes for sitemaps (`server/routes/sitemap-*.xml.ts`)
- **External API**: `https://touch.ninosaur.com` — all data (art, users, tags, collections) comes from here. Configurable via `NUXT_PUBLIC_API`. The backend is a separate hosted service and is not part of this repository.
- **Auth**: Cookie-based Bearer tokens (`auth_token` cookie via `useStatefulCookie`), initialized in `app/plugins/auth.client.ts` and `auth.server.ts`
- **Local Nuxt module**: `modules/custom-icons-standalone/` — auto-registered via Nuxt's `modules/` directory convention. It scans `.vue` files for `icon-<name>` classes and generates `app/assets/css/icons.css` (gitignored, rebuilt on every dev/build) with `mask-image` rules pointing at `public/icons/<name>.svg`. To add an icon: drop the SVG into `public/icons/` and use `class="icon icon-<name>"`.

### Key Directories
- `app/pages/` — file-based routes. Detail pages use the `[id_string].vue` dynamic param convention (e.g. `art/[id_string].vue`, `arts/[id_string].vue`, `creator/[id_string].vue`, `work/[collection].vue`)
- `app/components/` — auto-imported; `ui/` for generic UI (Tooltip, DropdownMenu, Modal, etc.), `editor/` for editor-specific (Palette, Timeline, TilesetStrip), `partial/` for Header/Footer, `item/` for Card/List
- `app/stores/` — `editor.store.ts` (canvas/editor state, multi-board workspace, undo/redo, auto-save), `auth.store.ts` (session/token)
- `app/composables/` — `useCustomFetch.ts` exports **`useNativeFetch`** (promise-based `$fetch`) and **`useAuthFetch`** (reactive `useFetch`); both inject the Bearer token and base URL. Also `useCustomSeoMeta`, `useLocalTilesets`, `useStatefulCookie`.
- `app/helper/` — pure utility modules: `canvas.ts` (image processing/pixel rendering), `color.ts`, `utils.ts`, `anim-export.ts` (GIF/spritesheet), `sheet-layout.ts`, `workspaceSnapshot.ts` (IndexedDB multi-board snapshot), `constants.ts`
- `app/types/index.ts` — shared TypeScript interfaces (`EditorData`, `SharedPage`, `Layer`, `User`, `APIResponse<T>`, etc.)

### Editor State (`editor.store.ts`)
The main pixel art editor is the most complex part of the app:
- `editorData` holds the full canvas state (layers, palette, size); `boards[]` + `activeBoardId` drive the multi-board infinite-canvas workspace
- `virtualLayer` is a temporary rendering layer for real-time drawing preview
- `history` array with index enables undo/redo
- Mirror mode (horizontal/vertical), animation frames, and iso (dimetric) grid mode are supported
- Debounced auto-save: guests persist to localStorage/IndexedDB; signed-in users save to the cloud. Guest work migrates to the cloud on sign-in.

### Canvas Rendering (`helper/canvas.ts`)
The heaviest helper module. It handles layer-to-pixel-map conversion, image-to-grid analysis with
threshold-based sampling, color processing, crop detection, and iso lattice path building.

### API Pattern
All API calls go through `useNativeFetch` / `useAuthFetch` (from `app/composables/useCustomFetch.ts`), which inject the auth Bearer token from the `auth_token` cookie and route to `runtimeConfig.public.api`. Response shape is `APIResponse<T>` with pagination. Use `useAuthFetch` in SSR-aware page-level calls; `useNativeFetch` for imperative calls (e.g. inside store actions).

### SEO
- `useCustomSeoMeta` composable handles OG/Twitter meta injection per page — pass refs/getters for query-dependent values (robots/canonical) so client-side query navigation stays correct
- JSON-LD structured data is added per page and globally in `nuxt.config.ts`
- Dynamic XML sitemaps are generated via Nitro server routes in `server/routes/`
- `strictNullChecks` is disabled in tsconfig

## Conventions

- Icons: MDI-style SVGs in `public/icons/`, used via `class="icon icon-<name>"` (masks, colored by `currentColor`)
- Modals: use the shared `UiModal` component (share-overlay chrome) — don't hand-roll overlays
- One flat-panel frame for canvas tools (`.editor` / `.flat-editor` chrome in main.css); widgets sit flush with 1px dividers
- Match the package manager to the lockfile: `bun.lock` → bun

## Git workflow

This is a public open-source repo — commits and releases follow a strict convention
(also documented for contributors in [CONTRIBUTING.md](CONTRIBUTING.md)).

### Branches

`main` is always deployable — **every push to `main` auto-deploys production**.
Work on a branch, merge when done:

```
feat/<short-slug>      new feature            feat/onion-skin-opacity
fix/<short-slug>       bug fix                fix/fullscreen-pointer-events
perf/<short-slug>      performance            perf/iso-lattice-lines
ui/<short-slug>        visual/UX polish       ui/toolbar-tooltips
refactor/<short-slug>  no behavior change     refactor/palette-store
docs/<short-slug>      docs only              docs/readme-screenshot
chore/<short-slug>     build/config/deps      chore/deploy-secrets
```

Trivial single-commit changes (typo, doc line) may go straight to `main`; anything
touching editor behavior gets a branch.

### Commits — Conventional Commits + gitmoji

Format: `<emoji> <type>(<scope>): <subject>`

| Emoji | Type | Use for |
|---|---|---|
| ✨ | `feat` | new user-facing feature |
| 🐛 | `fix` | bug fix |
| ⚡ | `perf` | performance improvement |
| 💄 | `ui` | visual/UX polish, CSS |
| ♻️ | `refactor` | code change, same behavior |
| 📝 | `docs` | README/docs/comments only |
| 🔧 | `chore` | build, config, deps, CI |
| 🔒 | `security` | security fix |
| 🚑 | `hotfix` | urgent prod fix on main |
| 🧹 | `cleanup` | dead code removal |

- **Scope** = area touched: `editor`, `tileset`, `tilemap`, `palette`, `animation`,
  `convert`, `work`, `gallery`, `seo`, `deploy` (omit if truly global)
- **Subject**: imperative, lowercase, no trailing period, ≤ 72 chars
- **Body** (when non-obvious): the *why* and the user-visible effect; wrap at 72
- One logical change per commit — don't mix a feature with unrelated cleanup

Examples:

```
✨ feat(editor): single-key tool shortcuts (B/E/G/V/M/L)
🐛 fix(editor): whole-canvas flip was off by one pixel
⚡ perf(editor): draw iso lattice as line families, not per-diamond quads
💄 ui(work): pin panel to viewport height with internal scroll
📝 docs: add editor screenshot to README
```

### Releases

- **SemVer** annotated tags: `git tag -a vX.Y.Z -m "vX.Y.Z"` on `main` **after**
  the deploy for that commit is green
- **patch** = fixes/polish · **minor** = new features · **major** = breaking/redesign
- Every tag gets a GitHub Release with notes structured as:
  `## ✨ Highlights` → `## 🐛 Fixes` → `## 🧰 Internal` (skip empty sections;
  one bullet per change, user-facing wording, link PRs/issues when they exist)
- Tag pushes do NOT trigger deploy (workflow only watches branch `main`)
