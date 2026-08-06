#!/usr/bin/env bun
/**
 * Build a distributable asset pack from a published tileset.
 *
 *   bun run scripts/build-pack.ts --tileset <id_string> [options]
 *
 *   --tileset <id_string>   required — the tileset to pack
 *   --out <dir>             output root (default ./packs)
 *   --slug <name>           pack folder/file name (default the tileset id_string)
 *   --license cc0|cc-by     licence written into LICENSE.txt (default cc-by)
 *   --api <url>             API base (default https://touch.ninosaur.com)
 *   --token <jwt>           bearer token, for tilesets that aren't public
 *   --no-credits            skip the per-tile CREDITS.txt lookup
 *
 * The sheet is laid out by the SAME helper the editor uses (helper/sheet-layout),
 * so the PNG here is pixel-identical to the one you'd download from the browser
 * and the .tres/.tsx offsets always match it.
 *
 * Output (one folder per pack, ready for `butler push`):
 *   <slug>_tileset_<cell>.png   packed sheet
 *   <slug>.tres / .tsx / .json  Godot 4 / Tiled / generic sidecars
 *   palette.hex / palette.gpl   the sheet's colours
 *   cover.png                   630x500 itch cover
 *   README.txt LICENSE.txt CREDITS.txt
 */
import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import sharp from 'sharp'
import {type SheetGroup, type SheetSource, buildSheet} from '~/helper/sheet-layout'
import {type EngineSheet, buildGodotTileSet, buildTiledTileset} from '~/helper/engine-export'

const argv = process.argv.slice(2)
const arg = (name: string, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? (argv[i + 1] ?? fallback) : fallback
}
const flag = (name: string) => argv.includes(`--${name}`)

const API = arg('api', 'https://touch.ninosaur.com').replace(/\/$/, '')
const TOKEN = arg('token')
const SITE = 'https://simplepixelart.com'

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {headers: TOKEN ? {Authorization: `Bearer ${TOKEN}`} : {}})
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return await res.json() as T
}

/** Run `fn` over items with a small concurrency cap (the API is a shared box). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }))
  return out
}

// The editor saves the canonical shape into meta, so this only has to coerce
// types and drop tiles whose art is gone from the registry.
function normGroups(raw: any, registry: Record<string, string>): SheetGroup[] {
  const seen = new Set<number>()
  return (Array.isArray(raw) ? raw : []).map((g: any, i: number): SheetGroup => {
    const kind = g?.kind === 'terrain' ? 'terrain' as const : 'group' as const
    const map: Record<string, number> = {}
    for (const [mask, id] of Object.entries(g?.map || {})) {
      if (registry[String(id)]) map[mask] = Number(id)
    }
    return {
      id: String(g?.id || `g${i}`),
      name: String(g?.name || (kind === 'terrain' ? 'Terrain' : 'Group')),
      kind,
      tiles: kind === 'group'
          ? (Array.isArray(g?.tiles) ? g.tiles : []).map(Number)
              .filter((id: number) => registry[String(id)] && !seen.has(id) && (seen.add(id), true))
          : [],
      ...(kind === 'terrain' ? {map, type: g?.type === 'blob47' ? 'blob47' as const : 'wang16' as const} : {}),
      ...(g?.random ? {random: true} : {}),
      ...(g?.weights ? {weights: g.weights} : {}),
      ...(g?.pos ? {pos: g.pos} : {}),
    }
  })
}

/** Every distinct opaque colour in the sheet, most-used first. */
async function sheetPalette(png: Buffer, cap = 64) {
  const {data, info} = await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  const counts = new Map<string, number>()
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3]! < 128) continue
    const hex = [data[i]!, data[i + 1]!, data[i + 2]!].map(v => v.toString(16).padStart(2, '0')).join('')
    counts.set(hex, (counts.get(hex) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap).map(([hex]) => hex)
}

function gpl(name: string, colors: string[]) {
  const rows = colors.map((hex) => {
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t#${hex}`
  })
  return `GIMP Palette\nName: ${name}\nColumns: 8\n#\n${rows.join('\n')}\n`
}

/** 630x500 itch cover: the sheet at an integer zoom, centred on a dark card. */
async function cover(png: Buffer, w: number, h: number) {
  const [bw, bh] = [630, 500]
  const zoom = Math.min((bw - 40) / w, (bh - 40) / h)
  const scale = zoom >= 1 ? Math.floor(zoom) : zoom      // upscale in whole pixels only
  const art = await sharp(png)
      .resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), {kernel: 'nearest'})
      .png().toBuffer()
  return await sharp({create: {width: bw, height: bh, channels: 4, background: {r: 24, g: 24, b: 28, alpha: 1}}})
      .composite([{input: art, gravity: 'centre'}]).png().toBuffer()
}

const LICENSES: Record<string, string> = {
  'cc0': 'Creative Commons Zero v1.0 Universal (CC0) — public domain.\nUse it in anything, commercial or not, no credit required.\nhttps://creativecommons.org/publicdomain/zero/1.0/',
  'cc-by': 'Creative Commons Attribution 4.0 (CC BY 4.0).\nUse it in anything, commercial or not — just credit the creators listed in CREDITS.txt.\nhttps://creativecommons.org/licenses/by/4.0/',
}

async function main() {
  const slugArg = arg('tileset')
  if (!slugArg) {
    console.error('missing --tileset <id_string>')
    process.exit(1)
  }
  const licenseKey = arg('license', 'cc-by')
  if (!LICENSES[licenseKey]) {
    console.error(`unknown --license ${licenseKey} (cc0 | cc-by)`)
    process.exit(1)
  }

  const t = await api<any>(`/coloring/tilesets/${slugArg}/`)
  const meta = t.meta || {}
  const registry: Record<string, string> = {...(meta.registry || {})}
  const cell = {w: Number(meta.cell?.w) || 32, h: Number(meta.cell?.h) || Number(meta.cell?.w) || 32}
  const groups = normGroups(meta.groups, registry)
  const packSlug = arg('slug', t.id_string)
  const name = t.name || packSlug
  console.log(`${name} — ${Object.keys(registry).length} tiles, ${groups.length} groups, cell ${cell.w}x${cell.h}`)

  // Tile art: the transparent originals, exactly what the editor draws with.
  const slugs = [...new Set(Object.values(registry))]
  const arts = new Map<string, { buf: Buffer; w: number; h: number }>()
  await pool(slugs, 8, async (s) => {
    const res = await fetch(`${API}/coloring/files/art-original/${s}.png`)
    if (!res.ok) {
      console.warn(`  ! tile ${s} → ${res.status}, skipped`)
      return
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const m = await sharp(buf).metadata()
    arts.set(s, {buf, w: m.width || cell.w, h: m.height || cell.h})
  })
  console.log(`downloaded ${arts.size}/${slugs.length} tile images`)

  const source: SheetSource = {
    cell,
    slugOf: id => registry[String(id)] || null,
    sizeOf: (s) => {
      const a = s ? arts.get(s) : null
      return a ? {w: a.w, h: a.h} : null
    },
  }
  const layout = buildSheet(groups, source)
  if (!layout.w || !layout.h) {
    console.error('nothing to pack — the tileset has no filled groups')
    process.exit(1)
  }

  // Compose the sheet: 1:1 pixels, centred in the block, downscaled only if
  // the art overflows its cells — same rule as the in-browser canvas render.
  const composites = await pool(layout.blocks.filter(b => b.slug && arts.has(b.slug)), 8, async (b) => {
    const a = arts.get(b.slug!)!
    const scale = Math.min(b.w / a.w, b.h / a.h, 1)
    const dw = Math.max(1, Math.round(a.w * scale))
    const dh = Math.max(1, Math.round(a.h * scale))
    const input = scale < 1 ? await sharp(a.buf).resize(dw, dh, {kernel: 'nearest'}).png().toBuffer() : a.buf
    return {input, left: b.x + Math.floor((b.w - dw) / 2), top: b.y + Math.floor((b.h - dh) / 2)}
  })
  const png = await sharp({create: {width: layout.w, height: layout.h, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
      .composite(composites).png().toBuffer()

  const image = `${packSlug}_tileset_${cell.w}x${cell.h}.png`
  const sheet: EngineSheet = {
    name,
    image,
    cell,
    size: {w: layout.w, h: layout.h},
    tiles: layout.tiles.map(t2 => ({x: t2.x, y: t2.y, w: t2.w, h: t2.h, ...(t2.prob ? {prob: t2.prob} : {})})),
    terrains: layout.terrains.map(t2 => ({
      name: t2.name,
      type: t2.type,
      slots: Object.entries(t2.slots).map(([mask, s]) => ({mask: Number(mask), x: s.x, y: s.y})),
    })),
  }
  const godot = buildGodotTileSet(sheet)

  // Credits: one batch lookup by tile pk, so every artist in the pack is named.
  let credits = ''
  if (!flag('no-credits')) {
    const ids = Object.keys(registry).map(Number).filter(Boolean)
    const res = await api<any>(`/coloring/shared-pages/?ids=${ids.join(',')}&page_size=200`)
    const rows = (res.results || []).map((p: any) => {
      const who = p.user?.username || p.user?.name || 'unknown'
      return `- ${p.name || p.id_string} — by ${who} — ${SITE}/art/${p.id_string}`
    })
    credits = `${name} — tile credits\n\n${rows.join('\n')}\n`
    console.log(`credits: ${rows.length} artists/tiles`)
  }

  const link = `${SITE}/tilesets/editor?utm_source=itch&utm_medium=pack&utm_campaign=${packSlug}`
  const readme = `${name}
${'='.repeat(name.length)}

A ${cell.w}x${cell.h} pixel-art tileset with auto-tile terrains, made with SimplePixelArt.
Build or remix your own: ${link}

Files
-----
${image}
    The packed sheet. Slice it on a ${cell.w}x${cell.h} grid.
${packSlug}.tres
    Godot 4 TileSet. Drop it and the PNG into your project in the same folder,
    open it, assign it to a TileMapLayer and paint from the Terrains tab.
${packSlug}.tsx
    Tiled tileset. Map > Add External Tileset…, terrains are Wang sets (brush U).
${packSlug}.json
    Plain description of every tile, group and terrain mask — for Unity,
    Phaser, LÖVE or your own loader.
palette.hex / palette.gpl
    The colours used, for Aseprite / GIMP / Krita.

Terrains
--------
${sheet.terrains.length ? sheet.terrains.map(x => `- ${x.name} (${x.type})`).join('\n') : '- none'}

Licence: see LICENSE.txt${credits ? '\nCredits: see CREDITS.txt' : ''}
`

  const dir = join(arg('out', 'packs'), packSlug)
  mkdirSync(dir, {recursive: true})
  const colors = await sheetPalette(png)
  writeFileSync(join(dir, image), png)
  writeFileSync(join(dir, `${packSlug}.tres`), godot.text)
  writeFileSync(join(dir, `${packSlug}.tsx`), buildTiledTileset(sheet))
  writeFileSync(join(dir, `${packSlug}.json`), JSON.stringify({
    name, id_string: t.id_string, image, cell, size: sheet.size,
    groups: groups.map(g => ({id: g.id, name: g.name, kind: g.kind, ...(g.type ? {type: g.type} : {})})),
    tiles: layout.tiles, terrains: layout.terrains,
  }, null, 2))
  writeFileSync(join(dir, 'palette.hex'), `${colors.join('\n')}\n`)
  writeFileSync(join(dir, 'palette.gpl'), gpl(name, colors))
  writeFileSync(join(dir, 'cover.png'), await cover(png, layout.w, layout.h))
  writeFileSync(join(dir, 'README.txt'), readme)
  writeFileSync(join(dir, 'LICENSE.txt'), `${name}\n\n${LICENSES[licenseKey]}\n`)
  if (credits) writeFileSync(join(dir, 'CREDITS.txt'), credits)

  console.log(`\nsheet ${layout.w}x${layout.h}, ${layout.tiles.length} tiles, ${layout.terrains.length} terrains, ${colors.length} colours`)
  if (godot.skipped) console.log(`warning: ${godot.skipped} overlapping tile(s) left out of the Godot atlas`)
  console.log(`→ ${dir}`)
  console.log(`\nnext: butler push ${dir} <itch-user>/${packSlug}:files`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
