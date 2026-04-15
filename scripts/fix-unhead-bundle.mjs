#!/usr/bin/env node
// Workaround for Nitro packaging bug in Nuxt 4.2.2 + unhead 2.x:
// Nitro extracts unhead into .output/server/node_modules but skips files
// like server.mjs / parser.mjs / client.mjs, causing 500s at runtime when
// the SSR bundle imports `unhead/server`. Copy the full dist into both
// locations so runtime resolution succeeds.
import {existsSync, mkdirSync, readdirSync, copyFileSync, statSync} from 'node:fs'
import {join} from 'node:path'

const SRC_GLOBS = [
  'node_modules/.pnpm',
  'node_modules', // npm/yarn fallback
]

const DST_DIRS = [
  '.output/server/node_modules/unhead/dist',
]

function findUnheadDist() {
  // Try pnpm path first.
  const pnpmRoot = 'node_modules/.pnpm'
  if (existsSync(pnpmRoot)) {
    const matches = readdirSync(pnpmRoot).filter(d => d.startsWith('unhead@'))
    for (const m of matches) {
      const p = join(pnpmRoot, m, 'node_modules/unhead/dist')
      if (existsSync(p)) return p
    }
  }
  // npm/yarn flat layout.
  const flat = 'node_modules/unhead/dist'
  if (existsSync(flat)) return flat
  return null
}

function findNitroDirs() {
  const nitroRoot = '.output/server/node_modules/.nitro'
  if (!existsSync(nitroRoot)) return []
  return readdirSync(nitroRoot)
    .filter(d => d.startsWith('unhead@'))
    .map(d => join(nitroRoot, d, 'dist'))
}

function copyDir(src, dst) {
  if (!existsSync(dst)) mkdirSync(dst, {recursive: true})
  for (const entry of readdirSync(src)) {
    const sp = join(src, entry)
    const dp = join(dst, entry)
    const st = statSync(sp)
    if (st.isDirectory()) copyDir(sp, dp)
    else copyFileSync(sp, dp)
  }
}

const src = findUnheadDist()
if (!src) {
  console.warn('[fix-unhead-bundle] source unhead/dist not found, skipping')
  process.exit(0)
}

const targets = [...DST_DIRS, ...findNitroDirs()].filter(d => existsSync(d))
if (!targets.length) {
  console.warn('[fix-unhead-bundle] no .output unhead targets found (maybe build missing?), skipping')
  process.exit(0)
}

for (const dst of targets) {
  copyDir(src, dst)
  console.log(`[fix-unhead-bundle] synced ${src} → ${dst}`)
}
