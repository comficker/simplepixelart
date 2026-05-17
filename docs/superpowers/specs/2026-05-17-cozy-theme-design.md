# Cozy Theme — Default UI Restyle

**Date:** 2026-05-17
**Scope:** SimplePixelArt web (`simplepixelart/simplepixelart_web`) — site-wide theming
**Goal:** Add a new `cozy` theme (warm cream / peach, Stardew-ish) as the default, with rounded corners, soft shadows, and the Fraunces serif typeface — without disturbing the existing retro themes.

## Problem

Current default theme is `gameboy` (4-color LCD green, monospace pixel font, chunky pixel shadows). Existing retro themes (`arcade`, `nes`, `synthwave`) cover the same aesthetic family. The site has no "soft / cozy" aesthetic option, which is a popular indie-game UI direction (Stardew Valley, Animal Crossing). User wants the editor to feel warmer and friendlier by default.

## Out of scope

- Logo / brand artwork
- Mobile-specific cozy refinements
- Animation easing curves polish
- Component rewrites (Widget, Square, etc. stay structurally identical)
- Forced migration of existing users (theme cookies preserved)

## Approach

Scoped overrides. Add one `[data-theme="cozy"]` palette block, register it in `useTheme.ts`, switch `DEFAULT_THEME` to `cozy`, append ~50 lines of scoped CSS overrides for `.btn`, `.widget`, `.toolbar-btn`, `.share-modal`, inputs, etc. Existing retro themes stay byte-identical.

## Decisions (from brainstorm)

| Topic | Decision |
|---|---|
| Theme strategy | Add `cozy` + switch `DEFAULT_THEME` to `cozy` (existing user cookies preserved) |
| Palette tone | Warm cream / peach (Stardew-ish) |
| Visual tweaks | Rounded corners, soft shadows, Fraunces serif font |
| CRT scanlines on cozy | Off (matches light/dark behavior) |
| Approach | Scoped overrides only — no `:root` var refactor that could leak into retro themes |

## File touchpoints

| File | Change |
|---|---|
| `app/composables/useTheme.ts` | Add `cozy` entry at the top of `THEMES`; set `DEFAULT_THEME = 'cozy'` |
| `app/assets/css/main.css` | Add Google Fonts import; add `[data-theme="cozy"]` palette block + body font; add `[data-theme="cozy"]` body::before scanlines disable; append component soften block at end |

No new files. No `<template>` changes.

## Theme registration

In `app/composables/useTheme.ts`:

```typescript
export const THEMES = [
  {
    id: 'cozy',
    name: 'Cozy',
    colors: ['#f5e6d3', '#d4c4a8', '#e8a87c', '#a8b89a'],
  },
  // ... existing gameboy / arcade / nes / synthwave / light / dark entries unchanged below
] as const

const DEFAULT_THEME: ThemeId = 'cozy'  // was 'gameboy'
```

Migration: existing visitors keep their cookie value (gameboy / arcade / …). Only new sessions inherit cozy.

## Palette + base tokens (CSS)

Add to `app/assets/css/main.css` immediately after the last existing theme block (after `[data-theme="dark"]`, before the CRT scanlines comment around line 122):

```css
[data-theme="cozy"] {
    --background: #f5e6d3;             /* cream */
    --foreground: #4a3a2a;             /* warm brown ink */
    --border: #d4c4a8;                 /* dusty beige */
    --primary: #e8a87c;                /* peach */
    --primary-foreground: #4a3a2a;
    --secondary: #a8b89a;              /* sage */
    --secondary-foreground: #4a3a2a;
    --shadow-px: #c4a888;              /* soft brown solid (still used as border-color elsewhere) */
    --shadow: 0 2px 6px rgba(74, 58, 42, 0.12);
    --shadow-hover: 0 4px 12px rgba(74, 58, 42, 0.15);
    --radius: 8px;
    --muted: #8a7a5e;                  /* dusty brown */
    --surface: #ede0c8;                /* cream darker */
    --surface-2: #e0d2b8;              /* cream deeper */
}

[data-theme="cozy"] body {
    font-family: "Fraunces", "Proto Mono", Georgia, serif;
    font-optical-sizing: auto;
}
```

`--shadow-px` stays solid because the existing CSS uses it as both `box-shadow` color AND `border-color` (e.g., `border: 2px solid var(--shadow-px)`). Setting it to an `rgba(...,0.12)` would break borders. Cozy keeps the var solid (`#c4a888`) and uses the new `--shadow` / `--shadow-hover` for actual shadow strings, declared only inside `[data-theme="cozy"]`.

The retro themes do NOT define `--shadow` / `--shadow-hover` / `--radius`. Existing retro CSS rules (e.g., hardcoded `box-shadow: 4px 4px 0 0 var(--shadow-px)`) keep working untouched.

## CRT scanlines disable

The existing rule (around line 139 of `main.css`):

```css
[data-theme="light"] body::before,
[data-theme="dark"] body::before {
    display: none;
}
```

Becomes:

```css
[data-theme="light"] body::before,
[data-theme="dark"] body::before,
[data-theme="cozy"] body::before {
    display: none;
}
```

## Font import

At the very top of `main.css` (after the existing `@theme inline` block, before `:root`-equivalent / `@theme` directives if any — confirm exact location in implementation), add:

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap');
```

The `opsz` axis gives Fraunces its vintage warmth at larger display sizes. Three weights (400/500/600) cover body, emphasis, headings. `display=swap` avoids FOIT.

## Scoped component overrides

Append at the END of `main.css` (after the `.tools.tools-rail` override block added earlier):

```css
/* === Cozy theme component softening === */
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

Class names verified against existing CSS (`.btn`, `.widget`, `.toolbar-btn`, `.publish-toolbar-btn`, `.share-modal`, `.publish-link`, `.resize-input`, `.canvas-container`, `.mini-map`, `.square`, `.tools .inside`, `.item`, `.tool-rail`, `.toolbar-info`).

The 2-class selector specificity (e.g., `[data-theme="cozy"] .btn` = 0,2,0) outranks any single-class default rule, regardless of source order — the override block is safe to append at file end.

## Risks

1. **Pixel art canvas corner clipping**: `.canvas-container` border-radius of 8px crops 8px of the visible canvas corner. Mitigated by `overflow: hidden` on the container so internal scroll is unaffected — the pixel grid inside doesn't lose pixels (only the chrome rounds). Manual check on small art (8×8) to confirm no visual misread.
2. **Mini-map rounded corners**: same idea; preview image clips at 8px corners. Acceptable cosmetic only.
3. **Fraunces serif glyph metrics differ from Proto Mono**: number widths could shift toolbar `WxH` text. Mitigated by `font-variant-numeric: tabular-nums` on `.toolbar-info`.
4. **Fraunces CDN load failure**: fallback to `"Proto Mono", Georgia, serif`. Acceptable degradation.
5. **Existing user cookie locks them out of cozy**: by design — respect choice. Users can switch via the theme picker in Header.
6. **Cozy overrides leaking into retro themes**: All overrides are scoped by the `[data-theme="cozy"]` attribute selector, so retro themes ignore them. Verified by reading every selector — every rule begins with `[data-theme="cozy"]`.

## Testing plan

No test framework. Manual on `bun dev`.

1. Clear cookies (DevTools → Application → Cookies → remove `theme`). Reload. Default theme is `cozy` — cream background, peach buttons, sage accents, brown text, Fraunces serif loaded (DevTools Network tab shows `fonts.gstatic.com` fetch, status 200).
2. Toolbar buttons: rounded 8px corners, soft shadow, hover lifts (translateY -1px).
3. Widgets and modals: rounded corners.
4. Canvas + mini-map have rounded corners; internal pixel grid renders correctly with no perceived pixel clipping at default canvas sizes (16, 32, 64, 128).
5. Editor (`/editor`): tool rail has cream `--surface` background, rounded corners.
6. Theme picker (Header): `Cozy` appears first in dropdown with the 4-color swatch.
7. Switch to `gameboy`: green LCD palette, pixel font (Proto Mono), chunky pixel shadows, CRT scanlines visible — retro untouched.
8. Switch to `nes`, `arcade`, `synthwave`, `light`, `dark`: each renders as before this change.
9. Switch back to `cozy`: cookie persists across reload.
10. Publish modal / login prompt: rounded + soft shadow under cozy; pixel-y under retro.
11. Resize inputs (canvas, iso cell): rounded inputs with peach focus ring under cozy; sharp under retro.
12. Tool rail: cream bg + rounded under cozy; default styling under retro.
