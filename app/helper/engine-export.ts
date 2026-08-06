// Engine-ready sidecars for the packed tileset PNG.
//
// The sheet the editor renders is already a uniform cell grid (every block is
// cell-aligned, terrains occupy one square of slots each), so both formats here
// describe THAT image — no second layout pass, no re-packing:
//
//   Godot 4 → .tres  TileSet with a TileSetAtlasSource + terrain sets, so
//                    auto-tiling works in the TileMapLayer terrain brush.
//   Tiled   → .tsx   tileset with Wang sets, so the terrain brush works there.
//
// Our masks say "the neighbour on this side is the same terrain", which is
// exactly what a Godot peering bit and a Tiled wangid index mean, so the
// terrain data survives the trip. wang16 (sides only) maps to Godot
// MATCH_SIDES / Tiled type="edge"; blob47 (sides + corners) maps to
// MATCH_CORNERS_AND_SIDES / type="mixed".
//
// Pure string builders — no DOM — so they stay testable outside the app.

import {MASK_E, MASK_N, MASK_NE, MASK_NW, MASK_S, MASK_SE, MASK_SW, MASK_W, type TerrainType} from '~/helper/autotile'

export interface EngineTile {
  x: number
  y: number
  w: number
  h: number
  prob?: number    // random-group weight (1 = default, omitted)
}

export interface EngineTerrain {
  name: string
  type: TerrainType
  slots: { mask: number; x: number; y: number }[]
}

export interface EngineSheet {
  name: string
  image: string                 // PNG filename shipped alongside the sidecar
  cell: { w: number; h: number }
  size: { w: number; h: number }
  tiles: EngineTile[]           // plain-group tiles (native px, cell-aligned)
  terrains: EngineTerrain[]
}

// Stable, readable colour per terrain name — engines show it as the brush swatch.
function terrainColor(name: string, i: number) {
  let hash = 0
  for (let k = 0; k < name.length; k++) hash = (hash * 31 + name.charCodeAt(k)) >>> 0
  const hue = ((hash % 360) + i * 47) % 360
  const c = 0.55
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = 0.25
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
      : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return {r: r + m, g: g + m, b: b + m}
}

function num(n: number) {
  return Number.isInteger(n) ? `${n}.0` : String(Math.round(n * 1000) / 1000)
}

// ── Godot 4 ──────────────────────────────────────────────────────────

// Mask bit → TileData peering-bit property, in the order Godot itself writes.
const GODOT_BITS: [number, string][] = [
  [MASK_E, 'right_side'],
  [MASK_SE, 'bottom_right_corner'],
  [MASK_S, 'bottom_side'],
  [MASK_SW, 'bottom_left_corner'],
  [MASK_W, 'left_side'],
  [MASK_NW, 'top_left_corner'],
  [MASK_N, 'top_side'],
  [MASK_NE, 'top_right_corner'],
]

// TileSet.TerrainMode
const MODE_CORNERS_AND_SIDES = 0
const MODE_SIDES = 2

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Godot 4 TileSet resource. Terrains of the same flavour share one terrain set
 * (Godot only matches terrains within a set, and a set has a single mode), so
 * wang16 terrains land in one set and blob47 terrains in another.
 *
 * Returns the file text plus how many tiles had to be dropped: an atlas cell
 * can hold exactly one tile, so free-positioned art that overlaps another tile
 * on the board can't be represented — it stays visible in the PNG, it just
 * doesn't become its own atlas tile.
 */
export function buildGodotTileSet(sheet: EngineSheet): { text: string; skipped: number } {
  const {w, h} = sheet.cell
  const used = new Set<string>()
  const body: string[] = []
  let skipped = 0

  // Terrain sets, keyed by mode so same-mode terrains can blend with each other.
  const modes: number[] = []
  const counts: number[] = []
  const placed = sheet.terrains.map((terrain) => {
    const mode = terrain.type === 'blob47' ? MODE_CORNERS_AND_SIDES : MODE_SIDES
    let set = modes.indexOf(mode)
    if (set < 0) {
      set = modes.push(mode) - 1
      counts.push(0)
    }
    return {terrain, set, index: counts[set]++}
  })

  // Claim every cell a tile covers; refuse the tile if any cell is taken.
  function claim(x: number, y: number, cw: number, ch: number) {
    const cx = Math.round(x / w)
    const cy = Math.round(y / h)
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) if (used.has(`${cx + dx}:${cy + dy}`)) return null
    }
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) used.add(`${cx + dx}:${cy + dy}`)
    }
    return {cx, cy}
  }

  for (const t of sheet.tiles) {
    const cw = Math.max(1, Math.round(t.w / w))
    const ch = Math.max(1, Math.round(t.h / h))
    const at = claim(t.x, t.y, cw, ch)
    if (!at) {
      skipped++
      continue
    }
    // size_in_atlas comes before the tile line — the order Godot writes.
    if (cw > 1 || ch > 1) body.push(`${at.cx}:${at.cy}/size_in_atlas = Vector2i(${cw}, ${ch})`)
    body.push(`${at.cx}:${at.cy}/0 = 0`)
    if (t.prob != null && t.prob !== 1) body.push(`${at.cx}:${at.cy}/0/probability = ${num(t.prob)}`)
  }

  for (const p of placed) {
    for (const slot of p.terrain.slots) {
      const at = claim(slot.x, slot.y, 1, 1)
      if (!at) {
        skipped++
        continue
      }
      body.push(`${at.cx}:${at.cy}/0 = 0`)
      body.push(`${at.cx}:${at.cy}/0/terrain_set = ${p.set}`)
      body.push(`${at.cx}:${at.cy}/0/terrain = ${p.index}`)
      for (const [bit, prop] of GODOT_BITS) {
        if (slot.mask & bit) body.push(`${at.cx}:${at.cy}/0/terrains_peering_bit/${prop} = ${p.index}`)
      }
    }
  }

  const res: string[] = [`tile_size = Vector2i(${w}, ${h})`]
  modes.forEach((mode, set) => {
    res.push(`terrain_set_${set}/mode = ${mode}`)
    placed.filter(p => p.set === set).forEach((p) => {
      const c = terrainColor(p.terrain.name, p.index)
      res.push(`terrain_set_${set}/terrain_${p.index}/name = "${esc(p.terrain.name)}"`)
      res.push(`terrain_set_${set}/terrain_${p.index}/color = Color(${num(c.r)}, ${num(c.g)}, ${num(c.b)}, 1.0)`)
    })
  })
  res.push('sources/0 = SubResource("TileSetAtlasSource_spa")')

  const text = [
    '[gd_resource type="TileSet" load_steps=3 format=3]',
    '',
    `[ext_resource type="Texture2D" path="res://${sheet.image}" id="1_spa"]`,
    '',
    '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_spa"]',
    'texture = ExtResource("1_spa")',
    `texture_region_size = Vector2i(${w}, ${h})`,
    ...body,
    '',
    '[resource]',
    `resource_name = "${esc(sheet.name)}"`,
    ...res,
    '',
  ].join('\n')

  return {text, skipped}
}

// ── Tiled ────────────────────────────────────────────────────────────

// wangid order is fixed by the TMX format: top, top-right, right, bottom-right,
// bottom, bottom-left, left, top-left. 0 = unset, 1 = our single Wang colour.
const TILED_BITS = [MASK_N, MASK_NE, MASK_E, MASK_SE, MASK_S, MASK_SW, MASK_W, MASK_NW]

function xml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hex(n: number) {
  return Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
}

/** Tiled .tsx: the PNG sliced on the cell grid, terrains as Wang sets. */
export function buildTiledTileset(sheet: EngineSheet): string {
  const {w, h} = sheet.cell
  const cols = Math.max(1, Math.floor(sheet.size.w / w))
  const rows = Math.max(1, Math.floor(sheet.size.h / h))
  const tileId = (x: number, y: number) => Math.round(y / h) * cols + Math.round(x / w)

  const sets = sheet.terrains.map((t, i) => {
    const c = terrainColor(t.name, i)
    const tiles = t.slots.map((slot) => {
      const id = TILED_BITS.map(bit => (slot.mask & bit) ? 1 : 0).join(',')
      return `   <wangtile tileid="${tileId(slot.x, slot.y)}" wangid="${id}"/>`
    })
    return [
      `  <wangset name="${xml(t.name)}" type="${t.type === 'blob47' ? 'mixed' : 'edge'}" tile="-1">`,
      `   <wangcolor name="${xml(t.name)}" color="#${hex(c.r)}${hex(c.g)}${hex(c.b)}" tile="-1" probability="1"/>`,
      ...tiles,
      '  </wangset>',
    ].join('\n')
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<tileset version="1.10" tiledversion="1.11.2" name="${xml(sheet.name)}" tilewidth="${w}" tileheight="${h}" tilecount="${cols * rows}" columns="${cols}">`,
    ` <image source="${xml(sheet.image)}" width="${sheet.size.w}" height="${sheet.size.h}"/>`,
    ...(sets.length ? [' <wangsets>', ...sets, ' </wangsets>'] : []),
    '</tileset>',
    '',
  ].join('\n')
}
