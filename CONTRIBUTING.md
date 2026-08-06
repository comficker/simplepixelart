# Contributing

Thanks for your interest in improving Simple Pixel Art!

## Getting started

```bash
bun install
bun dev        # http://localhost:3000
```

See the [README](README.md) for configuration and project layout. The editor core lives in
`app/components/PXEditor.vue` + `app/stores/editor.store.ts`; pure canvas/pixel utilities in
`app/helper/`.

## Guidelines

- **Keep PRs small and focused** — one fix or feature per PR.
- **Open an issue first** for anything large (new tools, UI overhauls, dependencies).
- **Match the existing style** — no linter/formatter is configured on purpose; read the
  surrounding code and follow its conventions (comment density, naming, CSS patterns).
- **Icons**: drop an SVG into `public/icons/` and use `class="icon icon-<name>"` — the CSS
  is generated automatically.
- **Modals**: use the shared `UiModal` component; don't hand-roll overlays.
- **Verify your change** in the browser (`bun dev`) — there is no test suite; a working
  before/after screenshot in the PR description helps a lot.

## Reporting bugs

Use the bug report issue template. Include browser/OS, steps to reproduce, and a screenshot
or screen recording when the issue is visual.
