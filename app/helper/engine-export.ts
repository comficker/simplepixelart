
import {
    CORNER_BL, CORNER_BR, CORNER_TL, CORNER_TR,
    MASK_E, MASK_N, MASK_NE, MASK_NW, MASK_S, MASK_SE, MASK_SW, MASK_W, type TerrainType,
} from '~/helper/autotile'

export interface EngineTile {
  x: number
  y: number
  w: number
  h: number
  prob?: number
  solid?: boolean
}

export interface EngineTerrain {
  name: string
  type: TerrainType
  slots: { mask: number; x: number; y: number; solid?: boolean }[]
}

/** An animated tile: its first frame at (x, y), the rest to the right. */
export interface EngineAnimTile {
  x: number
  y: number
  w: number
  h: number
  durations: number[]
  solid?: boolean
}

export interface EngineSheet {
  name: string
  image: string
  cell: { w: number; h: number }
  size: { w: number; h: number }
  tiles: EngineTile[]
  terrains: EngineTerrain[]
  anim?: { image: string; size: { w: number; h: number }; tiles: EngineAnimTile[] }
}

// A tile wider or taller than one cell hangs from its cell's bottom-left
// corner, the way the tilemap draws it. Godot centres it on the cell unless
// told otherwise; texture_origin moves it (Godot draws at centre - size/2 -
// origin), and the collision box, which Godot places from the cell centre and
// does not shift with the texture, is drawn over the same area.
function tileOrigin(sw: number, sh: number, w: number, h: number) {
  return {x: -(sw - 1) * w / 2, y: (sh - 1) * h / 2}
}
function tileBox(sw: number, sh: number, w: number, h: number) {
  const x0 = -w / 2, x1 = -w / 2 + sw * w
  const y1 = h / 2, y0 = h / 2 - sh * h
  return `PackedVector2Array(${num(x0)}, ${num(y0)}, ${num(x1)}, ${num(y0)}, ${num(x1)}, ${num(y1)}, ${num(x0)}, ${num(y1)})`
}

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

// corner16 slots are corner bits, and Godot's corner mode reads only these four.
const GODOT_CORNER_BITS: [number, string][] = [
  [CORNER_BR, 'bottom_right_corner'],
  [CORNER_BL, 'bottom_left_corner'],
  [CORNER_TL, 'top_left_corner'],
  [CORNER_TR, 'top_right_corner'],
]

const MODE_CORNERS_AND_SIDES = 0
const MODE_CORNERS = 1
const MODE_SIDES = 2

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildGodotTileSet(sheet: EngineSheet): { text: string; skipped: number } {
  const {w, h} = sheet.cell
  const used = new Set<string>()
  const body: string[] = []
  let skipped = 0

  const modes: number[] = []
  const counts: number[] = []
  const placed = sheet.terrains.map((terrain) => {
    const mode = terrain.type === 'blob47' ? MODE_CORNERS_AND_SIDES
        : terrain.type === 'corner16' ? MODE_CORNERS : MODE_SIDES
    let set = modes.indexOf(mode)
    if (set < 0) {
      set = modes.push(mode) - 1
      counts.push(0)
    }
    return {terrain, set, index: counts[set]++}
  })

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
    if (cw > 1 || ch > 1) body.push(`${at.cx}:${at.cy}/size_in_atlas = Vector2i(${cw}, ${ch})`)
    body.push(`${at.cx}:${at.cy}/0 = 0`)
    if (cw > 1 || ch > 1) {
      const o = tileOrigin(cw, ch, w, h)
      body.push(`${at.cx}:${at.cy}/0/texture_origin = Vector2i(${o.x}, ${o.y})`)
    }
    if (t.prob != null && t.prob !== 1) body.push(`${at.cx}:${at.cy}/0/probability = ${num(t.prob)}`)
    if (t.solid) body.push(`${at.cx}:${at.cy}/0/physics_layer_0/polygon_0/points = ${tileBox(cw, ch, w, h)}`)
  }

  for (const p of placed) {
    for (const slot of p.terrain.slots) {
      const at = claim(slot.x, slot.y, 1, 1)
      if (!at) {
        skipped++
        continue
      }
      body.push(`${at.cx}:${at.cy}/0 = 0`)
      if (slot.solid) body.push(`${at.cx}:${at.cy}/0/physics_layer_0/polygon_0/points = ${tileBox(1, 1, w, h)}`)
      body.push(`${at.cx}:${at.cy}/0/terrain_set = ${p.set}`)
      body.push(`${at.cx}:${at.cy}/0/terrain = ${p.index}`)
      for (const [bit, prop] of p.terrain.type === 'corner16' ? GODOT_CORNER_BITS : GODOT_BITS) {
        if (slot.mask & bit) body.push(`${at.cx}:${at.cy}/0/terrains_peering_bit/${prop} = ${p.index}`)
      }
    }
  }

  // Animated tiles: a second atlas, one tile per row, frames to the right.
  const animBody: string[] = []
  for (const t of sheet.anim?.tiles || []) {
    const cw = Math.max(1, Math.round(t.w / w))
    const ch = Math.max(1, Math.round(t.h / h))
    const at = `${Math.round(t.x / w)}:${Math.round(t.y / h)}`
    if (cw > 1 || ch > 1) animBody.push(`${at}/size_in_atlas = Vector2i(${cw}, ${ch})`)
    animBody.push(`${at}/animation_columns = ${t.durations.length}`)
    t.durations.forEach((d, i) => animBody.push(`${at}/animation_frame_${i}/duration = ${num(Math.max(0.01, d / 1000))}`))
    animBody.push(`${at}/0 = 0`)
    if (cw > 1 || ch > 1) {
      const o = tileOrigin(cw, ch, w, h)
      animBody.push(`${at}/0/texture_origin = Vector2i(${o.x}, ${o.y})`)
    }
    if (t.solid) animBody.push(`${at}/0/physics_layer_0/polygon_0/points = ${tileBox(cw, ch, w, h)}`)
  }
  const anySolid = sheet.tiles.some(t => t.solid) || sheet.terrains.some(t => t.slots.some(s => s.solid))
      || (sheet.anim?.tiles || []).some(t => t.solid)

  const res: string[] = [`tile_size = Vector2i(${w}, ${h})`]
  if (anySolid) res.push('physics_layer_0/collision_layer = 1')
  modes.forEach((mode, set) => {
    res.push(`terrain_set_${set}/mode = ${mode}`)
    placed.filter(p => p.set === set).forEach((p) => {
      const c = terrainColor(p.terrain.name, p.index)
      res.push(`terrain_set_${set}/terrain_${p.index}/name = "${esc(p.terrain.name)}"`)
      res.push(`terrain_set_${set}/terrain_${p.index}/color = Color(${num(c.r)}, ${num(c.g)}, ${num(c.b)}, 1.0)`)
    })
  })
  res.push('sources/0 = SubResource("TileSetAtlasSource_spa")')
  if (sheet.anim) res.push('sources/1 = SubResource("TileSetAtlasSource_anim")')

  const text = [
    '[gd_resource type="TileSet" format=3]',
    '',
    `[ext_resource type="Texture2D" path="res://${sheet.image}" id="1_spa"]`,
    ...(sheet.anim ? [`[ext_resource type="Texture2D" path="res://${sheet.anim.image}" id="2_anim"]`] : []),
    '',
    '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_spa"]',
    'texture = ExtResource("1_spa")',
    `texture_region_size = Vector2i(${w}, ${h})`,
    ...body,
    '',
    ...(sheet.anim ? [
      '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_anim"]',
      'texture = ExtResource("2_anim")',
      `texture_region_size = Vector2i(${w}, ${h})`,
      ...animBody,
      '',
    ] : []),
    '[resource]',
    `resource_name = "${esc(sheet.name)}"`,
    ...res,
    '',
  ].join('\n')

  return {text, skipped}
}

const TILED_BITS = [MASK_N, MASK_NE, MASK_E, MASK_SE, MASK_S, MASK_SW, MASK_W, MASK_NW]
// Same eight wangid positions; a corner set uses only the corner ones.
const TILED_CORNER_BITS = [0, CORNER_TR, 0, CORNER_BR, 0, CORNER_BL, 0, CORNER_TL]

function xml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hex(n: number) {
  return Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
}

export function buildTiledTileset(sheet: EngineSheet): string {
  const {w, h} = sheet.cell
  const cols = Math.max(1, Math.floor(sheet.size.w / w))
  const rows = Math.max(1, Math.floor(sheet.size.h / h))
  const tileId = (x: number, y: number) => Math.round(y / h) * cols + Math.round(x / w)

  const sets = sheet.terrains.map((t, i) => {
    const c = terrainColor(t.name, i)
    const tiles = t.slots.map((slot) => {
      const id = (t.type === 'corner16' ? TILED_CORNER_BITS : TILED_BITS)
          .map(bit => (bit && (slot.mask & bit)) ? 1 : 0).join(',')
      return `   <wangtile tileid="${tileId(slot.x, slot.y)}" wangid="${id}"/>`
    })
    return [
      `  <wangset name="${xml(t.name)}" type="${t.type === 'blob47' ? 'mixed' : t.type === 'corner16' ? 'corner' : 'edge'}" tile="-1">`,
      `   <wangcolor name="${xml(t.name)}" color="#${hex(c.r)}${hex(c.g)}${hex(c.b)}" tile="-1" probability="1"/>`,
      ...tiles,
      '  </wangset>',
    ].join('\n')
  })

  // Collision: Tiled keeps it per tile as an object group. A solid tile that
  // spans cells is solid in every cell it covers.
  const solidIds = new Set<number>()
  const markSolid = (x: number, y: number, tw: number, th: number) => {
    for (let dy = 0; dy < Math.max(1, Math.round(th / h)); dy++) {
      for (let dx = 0; dx < Math.max(1, Math.round(tw / w)); dx++) solidIds.add(tileId(x + dx * w, y + dy * h))
    }
  }
  for (const t of sheet.tiles) if (t.solid) markSolid(t.x, t.y, t.w, t.h)
  for (const t of sheet.terrains) for (const s of t.slots) if (s.solid) markSolid(s.x, s.y, w, h)
  const solidTiles = [...solidIds].sort((a, b) => a - b).map(id =>
      ` <tile id="${id}"><objectgroup draworder="index"><object id="1" x="0" y="0" width="${w}" height="${h}"/></objectgroup></tile>`)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<tileset version="1.10" tiledversion="1.11.2" name="${xml(sheet.name)}" tilewidth="${w}" tileheight="${h}" tilecount="${cols * rows}" columns="${cols}">`,
    ` <image source="${xml(sheet.image)}" width="${sheet.size.w}" height="${sheet.size.h}"/>`,
    ...solidTiles,
    ...(sets.length ? [' <wangsets>', ...sets, ' </wangsets>'] : []),
    '</tileset>',
    '',
  ].join('\n')
}

/** The same tileset as buildTiledTileset, as the JSON object a .tmj embeds.
 * Embedded rather than referenced: Phaser cannot load an external tileset,
 * and Tiled, Unity's and Godot's Tiled importers all read this form. */
export function buildTiledTilesetJSON(sheet: EngineSheet, firstgid = 1): Record<string, any> {
  const {w, h} = sheet.cell
  const cols = Math.max(1, Math.floor(sheet.size.w / w))
  const rows = Math.max(1, Math.floor(sheet.size.h / h))
  const tileId = (x: number, y: number) => Math.round(y / h) * cols + Math.round(x / w)

  const solidIds = new Set<number>()
  const markSolid = (x: number, y: number, tw: number, th: number) => {
    for (let dy = 0; dy < Math.max(1, Math.round(th / h)); dy++) {
      for (let dx = 0; dx < Math.max(1, Math.round(tw / w)); dx++) solidIds.add(tileId(x + dx * w, y + dy * h))
    }
  }
  for (const t of sheet.tiles) if (t.solid) markSolid(t.x, t.y, t.w, t.h)
  for (const t of sheet.terrains) for (const s of t.slots) if (s.solid) markSolid(s.x, s.y, w, h)

  return {
    firstgid, name: sheet.name, image: sheet.image,
    imagewidth: sheet.size.w, imageheight: sheet.size.h,
    tilewidth: w, tileheight: h, tilecount: cols * rows, columns: cols, margin: 0, spacing: 0,
    ...(solidIds.size ? {
      tiles: [...solidIds].sort((a, b) => a - b).map(id => ({
        id,
        objectgroup: {
          draworder: 'index', type: 'objectgroup', name: '', id: 1, visible: true, opacity: 1, x: 0, y: 0,
          objects: [{id: 1, name: '', type: '', x: 0, y: 0, width: w, height: h, rotation: 0, visible: true}],
        },
      })),
    } : {}),
    ...(sheet.terrains.length ? {
      wangsets: sheet.terrains.map((t, i) => {
        const c = terrainColor(t.name, i)
        return {
          name: t.name, tile: -1,
          type: t.type === 'blob47' ? 'mixed' : t.type === 'corner16' ? 'corner' : 'edge',
          colors: [{name: t.name, color: `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`, tile: -1, probability: 1}],
          wangtiles: t.slots.map(slot => ({
            tileid: tileId(slot.x, slot.y),
            wangid: (t.type === 'corner16' ? TILED_CORNER_BITS : TILED_BITS).map(bit => (bit && (slot.mask & bit)) ? 1 : 0),
          })),
        }
      }),
    } : {}),
  }
}
