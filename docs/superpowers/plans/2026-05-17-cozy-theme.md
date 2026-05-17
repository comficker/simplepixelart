# Cozy Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `cozy` theme (warm cream/peach Stardew-ish palette, rounded corners, soft shadows, Fraunces serif) as the new default theme, while leaving all retro themes byte-identical.

**Architecture:** Three tasks. (1) Register the theme in `useTheme.ts` and switch `DEFAULT_THEME`. (2) Add a `[data-theme="cozy"]` palette block, Fraunces `@import`, and cozy body font in `main.css`. (3) Append a scoped component-softening block at the end of `main.css` for rounded corners, soft shadows, focus rings, and tool-rail surface.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Pinia, TypeScript, plain CSS in `app/assets/css/main.css`. Package manager: `bun`. No test framework — verification by `bun dev` + manual visual check.

**Spec:** [`docs/superpowers/specs/2026-05-17-cozy-theme-design.md`](../specs/2026-05-17-cozy-theme-design.md)

**Run during work:**
- Dev server: `cd simplepixelart/simplepixelart_web && bun dev` → opens at `http://0.0.0.0:3000`
- Build / type-check: `bun run build`

**Working directory for all paths:** `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web`

**Conventions:**
- Source root: `app/` (Nuxt 4)
- Existing retro themes (`gameboy`, `arcade`, `nes`, `synthwave`, `light`, `dark`) MUST stay byte-identical — verify with `git diff` before commit
- Commit per task; do not push (per repo convention)

---

## File Structure

| File | Change |
|---|---|
| `app/composables/useTheme.ts` | Insert `cozy` as the first entry of `THEMES`; change `DEFAULT_THEME` to `'cozy'` |
| `app/assets/css/main.css` | Add Google Fonts `@import` near the top; add `[data-theme="cozy"]` palette + body font block; extend the CRT scanlines disable list; append a scoped component-soften block at end-of-file |

No new files. No template changes. No store changes.

---

## Task 1: Register `cozy` theme + switch default

**Files:**
- Modify: `app/composables/useTheme.ts`

This task adds the theme metadata and changes the default. The theme is "live" but visually identical to `gameboy` because the CSS palette block lands in Task 2.

- [ ] **Step 1: Add `cozy` entry as the first theme**

Open `app/composables/useTheme.ts`. The `THEMES` array (line 3) currently starts with `gameboy`. Replace the array's opening lines so `cozy` becomes the first entry:

Change:

```typescript
export const THEMES = [
  {
    id: 'gameboy',
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
```

to:

```typescript
export const THEMES = [
  {
    id: 'cozy',
    name: 'Cozy',
    colors: ['#f5e6d3', '#d4c4a8', '#e8a87c', '#a8b89a'],
  },
  {
    id: 'gameboy',
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
```

Keep every other entry (`arcade`, `nes`, `synthwave`, `light`, `dark`) unchanged.

- [ ] **Step 2: Change `DEFAULT_THEME` to `'cozy'`**

Find:

```typescript
const DEFAULT_THEME: ThemeId = 'gameboy'
```

Change to:

```typescript
const DEFAULT_THEME: ThemeId = 'cozy'
```

- [ ] **Step 3: Build (TS check)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build. The literal-union `ThemeId` is generated from `THEMES[number]['id']`, so adding `cozy` automatically widens it — `DEFAULT_THEME: ThemeId = 'cozy'` typechecks.

- [ ] **Step 4: Dev boot sanity**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: Nuxt boots without errors. The page still renders (CSS for cozy doesn't exist yet → `[data-theme="cozy"]` falls through to retro-default cascade — fine for this commit).

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/composables/useTheme.ts
git commit -m "feat(theme): register cozy theme + switch default

Adds cozy as first picker entry and the new default. Existing user
cookies (gameboy/arcade/...) are preserved — only fresh sessions
inherit cozy. CSS palette block lands in the next task."
```

---

## Task 2: Cozy palette + Fraunces font

**Files:**
- Modify: `app/assets/css/main.css`

This task adds the visual identity: palette block, Google Fonts import, body font, and CRT scanlines opt-out.

- [ ] **Step 1: Add Google Fonts `@import` at the very top of the file**

Open `/Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web/app/assets/css/main.css`. The current top of the file reads:

```css
@import "tailwindcss";

@config "../../../tailwind.config.js";
```

Insert the Fraunces import immediately after the Tailwind imports (before the `@theme inline` block at line 5):

```css
@import "tailwindcss";

@config "../../../tailwind.config.js";

@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');
```

`opsz` axis gives Fraunces vintage warmth at large sizes; 3 weights (400/500/600) cover body, emphasis, headings. `display=swap` avoids FOIT.

- [ ] **Step 2: Add `[data-theme="cozy"]` palette block**

In `main.css`, find the end of the last existing theme block — the `[data-theme="dark"]` block (currently ends around line 103, closing `}`). Insert the cozy block immediately AFTER that closing `}` and BEFORE the `.container` rule (line 105).

Add:

```css
[data-theme="cozy"] {
    --background: #f5e6d3;
    --foreground: #4a3a2a;
    --border: #d4c4a8;
    --primary: #e8a87c;
    --primary-foreground: #4a3a2a;
    --secondary: #a8b89a;
    --secondary-foreground: #4a3a2a;
    --shadow-px: #c4a888;
    --shadow: 0 2px 6px rgba(74, 58, 42, 0.12);
    --shadow-hover: 0 4px 12px rgba(74, 58, 42, 0.15);
    --radius: 8px;
    --muted: #8a7a5e;
    --surface: #ede0c8;
    --surface-2: #e0d2b8;
}

[data-theme="cozy"] body {
    font-family: "Fraunces", "Proto Mono", Georgia, serif;
    font-optical-sizing: auto;
}
```

Notes:
- `--shadow-px` stays a solid color (`#c4a888`) because existing CSS uses it as both `box-shadow` color AND `border-color`. Setting it to `rgba(...,0.12)` would break borders.
- `--shadow`, `--shadow-hover`, `--radius` are NEW vars consumed only by cozy-scoped rules in Task 3. Retro themes do not define them — their existing hardcoded shadows keep working.

- [ ] **Step 3: Extend the CRT scanlines disable list to include cozy**

Find the existing rule (around line 139):

```css
[data-theme="light"] body::before,
[data-theme="dark"] body::before {
    display: none;
}
```

Add `[data-theme="cozy"]` selector:

```css
[data-theme="light"] body::before,
[data-theme="dark"] body::before,
[data-theme="cozy"] body::before {
    display: none;
}
```

- [ ] **Step 4: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build.

- [ ] **Step 5: Dev boot + visual smoke**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: Nuxt boots. In a browser (you can't verify from this command, but if Nuxt boots structurally, the CSS parses):

- Clear `theme` cookie → reload → background turns cream, text turns brown, buttons turn peach.
- Fraunces serif visible (check DevTools Network → fonts.gstatic.com 200).
- No CRT scanlines overlay on cozy.
- Switch to gameboy via header picker → retro look intact.

If buttons / widgets still have sharp pixel corners and hard shadows, that's expected — Task 3 adds the rounding.

- [ ] **Step 6: Verify retro themes byte-identical**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && git diff app/assets/css/main.css | head -60
```

Expected: the diff shows only:
- The `@import url(...Fraunces...)` line added near top.
- The `[data-theme="cozy"] { ... }` block added after `[data-theme="dark"]`.
- The `[data-theme="cozy"] body { ... }` block.
- The new selector added to the scanlines `display: none` rule.

NO lines should appear as modified in the gameboy / arcade / nes / synthwave / light / dark blocks. If they are, restore them.

- [ ] **Step 7: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/assets/css/main.css
git commit -m "style(theme): add cozy palette + Fraunces font + disable CRT on cozy

Cream/peach Stardew-ish palette under [data-theme=\"cozy\"]. Body
font set to Fraunces serif (with Proto Mono / Georgia / serif
fallback). New CSS vars --shadow, --shadow-hover, --radius are
defined only inside the cozy block — retro themes untouched."
```

---

## Task 3: Scoped component softening

**Files:**
- Modify: `app/assets/css/main.css` (append at end-of-file)

This task rounds corners, applies soft shadows, adds hover lift, peach focus ring on inputs, cream surface for tool rail. All rules are scoped to `[data-theme="cozy"]` — retro themes ignore them.

- [ ] **Step 1: Append the cozy component override block**

Open `main.css`. Find the absolute end of the file (after the `.tools.tools-rail` override block that was previously added). After the last existing rule's closing `}`, append:

```css
/* === Cozy theme component softening (must follow all default rules) === */
[data-theme="cozy"] .widget,
[data-theme="cozy"] .btn,
[data-theme="cozy"] .toolbar-btn,
[data-theme="cozy"] .publish-toolbar-btn,
[data-theme="cozy"] .share-modal,
[data-theme="cozy"] .resize-input,
[data-theme="cozy"] .canvas-container,
[data-theme="cozy"] .mini-map {
    border-radius: var(--radius);
}

[data-theme="cozy"] .btn,
[data-theme="cozy"] .share-modal,
[data-theme="cozy"] .publish-link {
    box-shadow: var(--shadow);
    transition: transform 200ms ease, box-shadow 200ms ease;
}

[data-theme="cozy"] .btn:hover,
[data-theme="cozy"] .toolbar-btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-hover);
}

[data-theme="cozy"] .btn:active,
[data-theme="cozy"] .toolbar-btn:active {
    transform: translateY(0);
    box-shadow: var(--shadow);
}

[data-theme="cozy"] .square,
[data-theme="cozy"] .tools .inside {
    border-radius: 6px;
}

[data-theme="cozy"] input,
[data-theme="cozy"] textarea {
    border-radius: var(--radius);
    border: 1px solid var(--border);
}

[data-theme="cozy"] input:focus,
[data-theme="cozy"] textarea:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(232, 168, 124, 0.2);
}

[data-theme="cozy"] .tool-rail {
    background: var(--surface);
    border-radius: var(--radius);
    padding: 4px;
}

[data-theme="cozy"] .item.active {
    background: var(--primary);
    color: var(--primary-foreground);
    border-radius: var(--radius);
}

[data-theme="cozy"] .toolbar-info {
    font-variant-numeric: tabular-nums;
}

[data-theme="cozy"] .canvas-container {
    overflow: hidden;
}
```

Specificity is 0,2,0 on every rule — outranks any 0,1,0 default selector regardless of source order, so the block is safe to append at file end.

- [ ] **Step 2: Build**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build
```

Expected: clean build.

- [ ] **Step 3: Dev boot + visual smoke**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && (bun dev 2>&1 & PID=$!; sleep 8; kill $PID 2>/dev/null; wait 2>/dev/null) | tail -15
```

Expected: Nuxt boots. In a browser (manual verification):

- Cozy theme: buttons have 8px corners, soft shadows, hover lift, peach focus ring on inputs, cream tool-rail bg.
- Mini-map + canvas-container have rounded corners.
- Toolbar `WxH` text uses tabular numbers (digits align vertically).
- Switch to gameboy → pixel shadows, sharp corners, monospace returns — retro intact.

- [ ] **Step 4: Verify retro themes still byte-identical**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && grep -A 5 "data-theme=\"gameboy\"" app/assets/css/main.css | head -15
```

Confirm: `[data-theme="gameboy"]` block unchanged (4-color LCD palette intact, no inserted lines).

- [ ] **Step 5: Commit**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add app/assets/css/main.css
git commit -m "style(theme): scoped cozy component softening — rounding + soft shadow

Rounds widgets, buttons, modals, inputs, mini-map under cozy theme.
Adds hover lift + peach focus ring. Tool rail gets cream surface.
Toolbar numeric info uses tabular-nums to prevent digit shifting
under Fraunces. All rules scoped to [data-theme=\"cozy\"] — retro
themes unaffected."
```

---

## Task 4: Full manual smoke + perf/visual verification

**Files:** verification only.

- [ ] **Step 1: Build clean**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web && bun run build 2>&1 | tail -8
```

Expected: `✨ Build complete!`.

- [ ] **Step 2: Full manual walkthrough**

Boot `bun dev`. Open `http://localhost:3000/`. Walk through spec testing plan:

1. Clear `theme` cookie (DevTools → Application → Cookies → remove `theme`). Reload. Default theme is `cozy` — cream background, peach buttons, sage accents, brown text, Fraunces serif loaded (DevTools Network → fonts.gstatic.com fetch, 200).
2. Toolbar buttons: rounded 8px corners, soft shadow, hover lifts (translateY -1px).
3. Widgets and modals: rounded corners.
4. Canvas + mini-map have rounded corners; internal pixel grid renders correctly at sizes 16, 32, 64, 128.
5. Editor (`/editor`): tool rail has cream `--surface` background, rounded corners.
6. Theme picker (Header): `Cozy` appears first in dropdown with the 4-color swatch.
7. Switch to `gameboy`: green LCD palette, Proto Mono font, chunky pixel shadows, CRT scanlines visible.
8. Switch to `nes`, `arcade`, `synthwave`, `light`, `dark`: each renders as before.
9. Switch back to `cozy`: cookie persists across reload.
10. Publish modal / login prompt: rounded + soft under cozy; pixel-y under retro.
11. Resize inputs (canvas, iso cell): rounded with peach focus ring under cozy; sharp under retro.

- [ ] **Step 3: Address any deviation**

Common failure modes:
- Cookie still has old theme → user sees retro, not cozy. Clear cookie.
- Fraunces not loading → check DevTools Network for fonts.gstatic.com 200; if blocked, verify `@import` URL is correct.
- Buttons not rounded → cascade order issue; verify cozy override block sits at end-of-file.
- Retro themes look different → cozy override leaked. Run `git diff main..HEAD app/assets/css/main.css` and look for any rule NOT scoped under `[data-theme="cozy"]`.

Fix as `fix(theme): ...` commits.

- [ ] **Step 4: Final commit (only if Step 3 produced fixes)**

```bash
cd /Users/hoanganhlam/projects/ninosaur/simplepixelart/simplepixelart_web
git add -A
git commit -m "fix(theme): address cozy smoke-test findings"
```

If nothing failed, this task ends without a commit.

---

## Self-Review Notes

- **Spec coverage** — Theme registration (Task 1), palette + font + scanlines opt-out (Task 2), component softening (Task 3), manual verification (Task 4). All spec sections covered.
- **Placeholder scan** — every step has complete code or exact commands. No "TODO" / "appropriate" / "as needed" phrasing.
- **Type consistency** — `ThemeId` is generated from `THEMES`, so adding `cozy` widens the union. `DEFAULT_THEME` reassignment typechecks. CSS class names (`.btn`, `.widget`, `.toolbar-btn`, `.publish-toolbar-btn`, `.share-modal`, `.publish-link`, `.resize-input`, `.canvas-container`, `.mini-map`, `.square`, `.tools .inside`, `.item`, `.tool-rail`, `.toolbar-info`) are all verified against existing CSS rules in `main.css`.
