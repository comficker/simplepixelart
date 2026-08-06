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

## Branches & commits

- Branch from `main`: `feat/<slug>`, `fix/<slug>`, `perf/<slug>`, `ui/<slug>`,
  `refactor/<slug>`, `docs/<slug>`, `chore/<slug>`
- Commit format — Conventional Commits with a gitmoji prefix:
  `<emoji> <type>(<scope>): <subject>`

  ```
  ✨ feat(editor): single-key tool shortcuts (B/E/G/V/M/L)
  🐛 fix(editor): whole-canvas flip was off by one pixel
  ⚡ perf(editor): draw iso lattice as line families
  💄 ui(work): pin panel to viewport height
  📝 docs: add editor screenshot to README
  ```

  Emoji ↔ type: ✨ feat · 🐛 fix · ⚡ perf · 💄 ui · ♻️ refactor · 📝 docs ·
  🔧 chore · 🔒 security · 🧹 cleanup
- Subject: imperative, lowercase, ≤ 72 chars; body explains the *why*
- One logical change per commit/PR

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
