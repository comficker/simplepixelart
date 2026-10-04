/**
 * A tilemap, exported for a game.
 *
 * Ground layers point into the shared tileset (tileset-pack.ts) — the same
 * atlas, terrains and collision the tileset export ships — so the map can go
 * on being painted in the engine. Sprite layers become what they are on the
 * board: art at its own size, centred on its cell and standing on the cell's
 * bottom edge, as Tiled tile objects or Godot sprites. Object layers become
 * named points.
 *
 * Grid maps only: an isometric map still goes through tilemap-export.ts.
 */
import {
  FLIP_D, FLIP_H, FLIP_V, flagsOf, tileOf, type TilemapConfig,
} from '~/helper/tilemap'
import type {AtlasRect, PackedTileset} from '~/helper/tileset-pack'
import {buildTiledTilesetJSON} from '~/helper/engine-export'
import type {TileAnim} from '~/helper/tile-anim'
import {cellPhase} from '~/helper/tile-anim'

// ── sprites: one atlas of natural-size art, frames included ──────────────
export interface MapSprites {
  canvas: HTMLCanvasElement
  /** Still sprites, and the first frame of animated ones. */
  rect: Map<number, AtlasRect>
  /** Animated sprites: every frame, and how long each lasts (ms). */
  frames: Map<number, { rects: AtlasRect[]; durations: number[] }>
}

export function packSprites(ids: number[], images: Map<number, HTMLImageElement>,
                            anims: Map<number, TileAnim>): MapSprites {
  type Item = { id: number; frame: number; src: CanvasImageSource; w: number; h: number }
  const items: Item[] = []
  for (const id of new Set(ids)) {
    const a = anims.get(id)
    if (a) {
      a.frames.forEach((f, i) => items.push({id, frame: i, src: f, w: f.width, h: f.height}))
    } else {
      const img = images.get(id)
      if (img?.naturalWidth) items.push({id, frame: 0, src: img, w: img.naturalWidth, h: img.naturalHeight})
    }
  }
  // Shelves, tallest first; a pixel between sprites so filtering never bleeds.
  const order = [...items].sort((a, b) => b.h - a.h || a.id - b.id || a.frame - b.frame)
  const LIMIT = 1024, GAP = 1
  let x = 0, y = 0, rowH = 0, width = 1
  const at = new Map<Item, AtlasRect>()
  for (const it of order) {
    if (x > 0 && x + it.w > LIMIT) {
      x = 0
      y += rowH + GAP
      rowH = 0
    }
    at.set(it, {x, y, w: it.w, h: it.h})
    x += it.w + GAP
    rowH = Math.max(rowH, it.h)
    width = Math.max(width, x)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.max(1, y + rowH)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  const rect = new Map<number, AtlasRect>()
  const frames = new Map<number, { rects: AtlasRect[]; durations: number[] }>()
  for (const it of items) {
    const r = at.get(it)!
    ctx.drawImage(it.src, r.x, r.y)
    if (it.frame === 0) rect.set(it.id, r)
    const a = anims.get(it.id)
    if (a) {
      const f = frames.get(it.id) || {rects: [], durations: []}
      f.rects[it.frame] = r
      f.durations[it.frame] = (it.frame + 1 < a.starts.length ? a.starts[it.frame + 1]! : a.total) - a.starts[it.frame]!
      frames.set(it.id, f)
    }
  }
  return {canvas, rect, frames}
}

export interface MapExportInput {
  config: TilemapConfig
  name: string
  /** File names: the map's sprite atlas and the shared tileset's files. */
  spritesImage: string
  tilesetBase: string
  tilesetImage: string
  pack: PackedTileset
  sprites: MapSprites
  solid: Set<number>
  /** Animated tiles on ground layers play from the tileset's animation atlas. */
  animated: Set<number>
}

/** The atlas rect a ground cell draws from: its terrain's slot when painted
 * with a terrain (that copy carries the terrain bits), else its tile. */
function groundRect(inp: MapExportInput, layerTerrain: Record<string, string>, k: string, id: number) {
  const tid = layerTerrain[k]
  return (tid && inp.pack.terrainCell.get(tid)?.get(id)) || inp.pack.cellOf.get(id) || null
}

// ── Tiled (.tmj) ──────────────────────────────────────────────────────────
const T_H = 0x80000000, T_V = 0x40000000, T_D = 0x20000000

function tiledFlags(f: number) {
  return (f & FLIP_H ? T_H : 0) + (f & FLIP_V ? T_V : 0) + (f & FLIP_D ? T_D : 0)
}

/** Where sub-cell (i, j) of a W x H block lands once the block is oriented:
 * diagonal flip first, then horizontal, then vertical — Tiled's order. */
function orientCell(i: number, j: number, w: number, h: number, f: number) {
  let x = i, y = j, bw = w, bh = h
  if (f & FLIP_D) { [x, y] = [y, x]; [bw, bh] = [bh, bw] }
  if (f & FLIP_H) x = bw - 1 - x
  if (f & FLIP_V) y = bh - 1 - y
  return {x, y, bw, bh}
}

export function buildTiledMapShared(inp: MapExportInput): { tmj: string; missing: number } {
  const c = inp.config
  const cw = c.cellW, ch = c.cellH
  const cols = Math.max(1, Math.floor(inp.pack.sheet.w / cw))
  const rows = Math.max(1, Math.floor(inp.pack.sheet.h / ch))
  const tilesetCount = cols * rows
  let missing = 0

  // The sprite collection: one tile per still sprite or animation frame, cut
  // from the sprite atlas by sub-rectangle (Tiled 1.9+).
  const spriteFirst = 1 + tilesetCount
  const spriteTiles: any[] = []
  const spriteTileOf = new Map<number, number>()
  const addSpriteTile = (r: AtlasRect) => {
    spriteTiles.push({
      id: spriteTiles.length, image: inp.spritesImage,
      imagewidth: inp.sprites.canvas.width, imageheight: inp.sprites.canvas.height,
      x: r.x, y: r.y, width: r.w, height: r.h,
    })
    return spriteTiles.length - 1
  }
  for (const [id, r] of inp.sprites.rect) {
    const tile = addSpriteTile(r)
    spriteTileOf.set(id, tile)
    const f = inp.sprites.frames.get(id)
    if (f) {
      const frameTiles = f.rects.map((fr, i) => (i === 0 ? tile : addSpriteTile(fr)))
      spriteTiles[tile].animation = frameTiles.map((t, i) => ({tileid: t, duration: Math.round(f.durations[i]!)}))
    }
    if (inp.solid.has(id)) {
      // A sprite blocks with its footprint: the bottom row of cells it covers.
      spriteTiles[tile].objectgroup = {
        draworder: 'index', type: 'objectgroup', name: '', visible: true, opacity: 1, x: 0, y: 0, id: 1,
        objects: [{id: 1, name: '', type: '', x: 0, y: Math.max(0, r.h - ch), width: r.w, height: Math.min(ch, r.h), rotation: 0, visible: true}],
      }
    }
  }

  let nextObject = 1
  const layers = c.layers.map((l, li) => {
    const base = {id: li + 1, name: l.name, visible: l.visible, opacity: 1, x: 0, y: 0}
    if (l.kind === 'object') {
      return {
        ...base, type: 'objectgroup', draworder: 'index',
        objects: (l.objects || []).map(o => ({
          id: nextObject++, name: o.name, type: '', point: true, rotation: 0, visible: true,
          x: o.col * cw + cw / 2, y: o.row * ch + ch / 2, width: 0, height: 0,
        })),
      }
    }
    if (l.kind === 'sprite') {
      const objects: any[] = []
      for (const [k, v] of Object.entries(l.cells)) {
        const id = tileOf(v)
        const tile = spriteTileOf.get(id)
        const r = inp.sprites.rect.get(id)
        if (tile == null || !r) { missing++; continue }
        const sep = k.indexOf('_')
        const col = +k.slice(0, sep), row = +k.slice(sep + 1)
        // A tile object hangs from its bottom-left point; the board centres a
        // sprite on its cell and stands it on the cell's bottom edge.
        objects.push({
          id: nextObject++, name: '', type: '', rotation: 0, visible: true,
          gid: spriteFirst + tile + tiledFlags(flagsOf(v) & (FLIP_H | FLIP_V)),
          x: col * cw + (cw - r.w) / 2, y: (row + 1) * ch, width: r.w, height: r.h,
        })
      }
      return {...base, type: 'objectgroup', draworder: l.ySort ? 'topdown' : 'index', objects}
    }
    const data = new Array(c.cols * c.rows).fill(0)
    for (const [k, v] of Object.entries(l.cells)) {
      const id = tileOf(v), f = flagsOf(v)
      const r = groundRect(inp, l.terrain || {}, k, id)
      if (!r) { missing++; continue }
      const sep = k.indexOf('_')
      const col = +k.slice(0, sep), row = +k.slice(sep + 1)
      const sw = Math.max(1, Math.round(r.w / cw)), sh = Math.max(1, Math.round(r.h / ch))
      // A tile spanning cells is the atlas cells under it, laid out (and
      // oriented) so the block hangs from its cell's bottom-left corner.
      for (let j = 0; j < sh; j++) {
        for (let i = 0; i < sw; i++) {
          const o = orientCell(i, j, sw, sh, f)
          const dc = col + o.x, dr = row - (o.bh - 1) + o.y
          if (dc < 0 || dr < 0 || dc >= c.cols || dr >= c.rows) continue
          const tid = (Math.round(r.y / ch) + j) * cols + Math.round(r.x / cw) + i
          data[dr * c.cols + dc] = 1 + tid + tiledFlags(f)
        }
      }
    }
    return {...base, type: 'tilelayer', width: c.cols, height: c.rows, data}
  })

  const tmj = JSON.stringify({
    type: 'map', version: '1.10', tiledversion: '1.11.2',
    orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: c.cols, height: c.rows, tilewidth: cw, tileheight: ch,
    compressionlevel: -1, nextlayerid: layers.length + 1, nextobjectid: nextObject,
    properties: [{name: 'exported_by', type: 'string', value: 'https://simplepixelart.com'}],
    class: inp.name,
    layers,
    tilesets: [
      buildTiledTilesetJSON(inp.pack.engine, 1),
      ...(spriteTiles.length ? [{
        firstgid: spriteFirst, name: 'sprites', columns: 0, margin: 0, spacing: 0,
        tilewidth: Math.max(...spriteTiles.map(t => t.width)), tileheight: Math.max(...spriteTiles.map(t => t.height)),
        tilecount: spriteTiles.length, tiles: spriteTiles,
      }] : []),
    ],
  }, null, 1)
  return {tmj, missing}
}

// ── Godot 4 (.tscn) ───────────────────────────────────────────────────────
const G_H = 4096, G_V = 8192, G_T = 16384

function godotAlt(f: number) {
  return (f & FLIP_H ? G_H : 0) | (f & FLIP_V ? G_V : 0) | (f & FLIP_D ? G_T : 0)
}

/** TileMapLayer.tile_map_data: a 2-byte format header, then per cell int16
 * x, int16 y, uint16 source, uint16 atlas x, uint16 atlas y, uint16
 * alternative — little-endian, as Godot 4.3+ writes it. */
export function encodeTileMapData(cells: { x: number; y: number; source: number; ax: number; ay: number; alt: number }[]) {
  const buf = new DataView(new ArrayBuffer(2 + cells.length * 12))
  buf.setUint16(0, 0, true)
  cells.forEach((c, i) => {
    const o = 2 + i * 12
    buf.setInt16(o, c.x, true)
    buf.setInt16(o + 2, c.y, true)
    buf.setUint16(o + 4, c.source, true)
    buf.setUint16(o + 6, c.ax, true)
    buf.setUint16(o + 8, c.ay, true)
    buf.setUint16(o + 10, c.alt, true)
  })
  return `PackedByteArray(${Array.from(new Uint8Array(buf.buffer)).join(', ')})`
}

/** Which cell to put an oriented multi-cell tile in so Godot draws it where
 * the board does. Godot flips and transposes a tile about its cell centre
 * (tile_map_layer.cpp, compute_transformed_tile_dest_rect); the board keeps
 * the block hanging from the same bottom-left corner. */
function godotCellShift(sw: number, sh: number, cw: number, ch: number, f: number) {
  if (sw === 1 && sh === 1) return {dc: 0, dr: 0}
  const d = !!(f & FLIP_D)
  const W = sw * cw, H = sh * ch
  const tW = d ? H : W, tH = d ? W : H
  const ox = -(sw - 1) * cw / 2, oy = (sh - 1) * ch / 2
  let px = -tW / 2 - (d ? oy : ox)
  let py = -tH / 2 - (d ? ox : oy)
  if (f & FLIP_H) px = -(px + tW)
  if (f & FLIP_V) py = -(py + tH)
  // Wanted: the block's left edge on the cell's left, its bottom on the cell's bottom.
  return {dc: Math.round((-cw / 2 - px) / cw), dr: Math.round((ch / 2 - tH - py) / ch)}
}

function nodeName(raw: string, taken: Set<string>) {
  const base = (raw.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'node').slice(0, 40)
  let n = base, i = 2
  while (taken.has(n)) n = `${base}_${i++}`
  taken.add(n)
  return n
}

const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000))

export function buildGodotMap(inp: MapExportInput & { slugOf: (id: number) => string }): { tscn: string; missing: number } {
  const c = inp.config
  const cw = c.cellW, ch = c.cellH
  let missing = 0
  const subs: string[] = []
  const nodes: string[] = []
  let subId = 0
  const sub = (type: string, body: string[]) => {
    const id = `${type}_${++subId}`
    subs.push(`[sub_resource type="${type}" id="${id}"]`, ...body, '')
    return id
  }
  const atlasTex = new Map<string, string>()
  const regionTex = (r: AtlasRect) => {
    const key = `${r.x},${r.y},${r.w},${r.h}`
    if (!atlasTex.has(key)) {
      atlasTex.set(key, sub('AtlasTexture', ['atlas = ExtResource("2_sprites")', `region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`]))
    }
    return atlasTex.get(key)!
  }
  const framesRes = new Map<number, string>()
  const footprint = new Map<string, string>()
  const names = new Set<string>()

  const rootName = nodeName(inp.name, new Set())
  nodes.push(`[node name=${q(rootName)} type="Node2D"]`, '')

  for (const l of c.layers) {
    const layerName = nodeName(l.name, names)
    if (l.kind === 'object') {
      nodes.push(`[node name=${q(layerName)} type="Node2D" parent="."]`, `visible = ${l.visible}`, '')
      const taken = new Set<string>()
      for (const o of l.objects || []) {
        nodes.push(`[node name=${q(nodeName(o.name, taken))} type="Marker2D" parent=${q(layerName)}]`,
            `position = Vector2(${num(o.col * cw + cw / 2)}, ${num(o.row * ch + ch / 2)})`, '')
      }
      continue
    }
    if (l.kind === 'sprite') {
      nodes.push(`[node name=${q(layerName)} type="Node2D" parent="."]`, `visible = ${l.visible}`,
          ...(l.ySort ? ['y_sort_enabled = true'] : []), '')
      const taken = new Set<string>()
      for (const [k, v] of Object.entries(l.cells)) {
        const id = tileOf(v), f = flagsOf(v)
        const r = inp.sprites.rect.get(id)
        if (!r) { missing++; continue }
        const sep = k.indexOf('_')
        const col = +k.slice(0, sep), row = +k.slice(sep + 1)
        const nm = nodeName(inp.slugOf(id), taken)
        const frames = inp.sprites.frames.get(id)
        // Stands on the cell's bottom edge, centred — and that point is the
        // node's position, so y-sort orders sprites by where they stand.
        const common = [
          `position = Vector2(${num(col * cw + cw / 2)}, ${num((row + 1) * ch)})`,
          'centered = false',
          `offset = Vector2(${num(-r.w / 2)}, ${num(-r.h)})`,
          ...(f & FLIP_H ? ['flip_h = true'] : []),
          ...(f & FLIP_V ? ['flip_v = true'] : []),
        ]
        if (frames) {
          if (!framesRes.has(id)) {
            const list = frames.rects.map((fr, i) =>
                `{\n"duration": ${num(Math.max(0.01, frames.durations[i]! / 1000))},\n"texture": SubResource("${regionTex(fr)}")\n}`)
            framesRes.set(id, sub('SpriteFrames', [
              `animations = [{\n"frames": [${list.join(', ')}],\n"loop": true,\n"name": &"default",\n"speed": 1.0\n}]`,
            ]))
          }
          // Each copy starts somewhere else in the loop, as on the board.
          const start = Math.floor(cellPhase(col, row) * frames.rects.length) % frames.rects.length
          nodes.push(`[node name=${q(nm)} type="AnimatedSprite2D" parent=${q(layerName)}]`, ...common,
              `sprite_frames = SubResource("${framesRes.get(id)}")`, 'autoplay = "default"', `frame = ${start}`, '')
        } else {
          nodes.push(`[node name=${q(nm)} type="Sprite2D" parent=${q(layerName)}]`, ...common,
              `texture = SubResource("${regionTex(r)}")`, '')
        }
        if (inp.solid.has(id)) {
          // A sprite blocks with its footprint, the bottom cell-row it covers.
          const fh = Math.min(ch, r.h)
          const key = `${r.w}x${fh}`
          if (!footprint.has(key)) footprint.set(key, sub('RectangleShape2D', [`size = Vector2(${r.w}, ${fh})`]))
          const path = `${layerName}/${nm}`
          nodes.push(`[node name="Body" type="StaticBody2D" parent=${q(path)}]`, '',
              `[node name="Shape" type="CollisionShape2D" parent=${q(`${path}/Body`)}]`,
              `position = Vector2(0, ${num(-fh / 2)})`, `shape = SubResource("${footprint.get(key)}")`, '')
        }
      }
      continue
    }
    // Ground: one TileMapLayer on the shared TileSet.
    const cells: { x: number; y: number; source: number; ax: number; ay: number; alt: number }[] = []
    for (const [k, v] of Object.entries(l.cells)) {
      const id = tileOf(v), f = flagsOf(v)
      const sep = k.indexOf('_')
      const col = +k.slice(0, sep), row = +k.slice(sep + 1)
      const anim = inp.animated.has(id) && !l.terrain?.[k] ? inp.pack.animOf.get(id) : undefined
      const r = anim || groundRect(inp, l.terrain || {}, k, id)
      if (!r) { missing++; continue }
      const sw = Math.max(1, Math.round(r.w / cw)), sh = Math.max(1, Math.round(r.h / ch))
      const s = godotCellShift(sw, sh, cw, ch, f)
      cells.push({
        x: col + s.dc, y: row + s.dr, source: anim ? 1 : 0,
        ax: Math.round(r.x / cw), ay: Math.round(r.y / ch), alt: godotAlt(f),
      })
    }
    nodes.push(`[node name=${q(layerName)} type="TileMapLayer" parent="."]`, `visible = ${l.visible}`,
        `tile_map_data = ${encodeTileMapData(cells)}`, 'tile_set = ExtResource("1_tileset")', '')
  }

  const tscn = [
    '[gd_scene format=3]',
    '',
    `[ext_resource type="TileSet" path="res://${inp.tilesetBase}.tres" id="1_tileset"]`,
    `[ext_resource type="Texture2D" path="res://${inp.spritesImage}" id="2_sprites"]`,
    '',
    ...subs,
    ...nodes,
  ].join('\n')
  return {tscn, missing}
}

