// The art brush, painting with tiles: one artwork, a few gathered by hand, or
// a whole tileset, laid down free or on the tileset's grid (square or iso).
// As in the tilemap editor, a tileset brings two more kinds of brush: its
// terrains, which auto-tile, and its random groups, which scatter. The same
// model as the mobile editor (simplepixelart_mobile, tile_brush.dart), so a
// piece auto-tiled on one carries on on the other (`meta.autotile`).

import {cornerMask, resolveTerrainTile, terrainMask, type Terrain, type TerrainType} from '~/helper/autotile'

export interface BrushTile {
  id: number
  id_string: string
}

export interface BrushGroup {
  id: string
  name: string
  random: boolean
  tiles: number[]
}

export interface BrushSet {
  /** '' for a strip gathered from artworks; `local:<id>` for a guest's
   *  tileset kept in this browser. */
  id_string: string
  name: string
  cellW: number
  cellH: number
  iso: boolean
  isoRatio: number
  tiles: BrushTile[]
  groups: BrushGroup[]
  terrains: Terrain[]
}

/** The random brush over every tile of a hand-gathered strip. */
export const ANY_ID = '*'

export const isGathered = (s: BrushSet) => !s.id_string
export const isLocalSet = (s: BrushSet) => s.id_string.startsWith('local:')

export function parseTileset(j: any, idString?: string): BrushSet {
  const meta = j?.meta && typeof j.meta === 'object' ? j.meta : {}
  const registry: Record<string, string> = meta.registry && typeof meta.registry === 'object' ? meta.registry : {}
  const tiles: BrushTile[] = []
  for (const [k, v] of Object.entries(registry)) {
    const id = Number(k)
    if (Number.isInteger(id) && typeof v === 'string') tiles.push({id, id_string: v})
  }
  const known = new Set(tiles.map(t => t.id))
  const raw = [...(Array.isArray(meta.groups) ? meta.groups : []), ...(Array.isArray(meta.terrains) ? meta.terrains : [])]
  const terrains: Terrain[] = []
  const seen = new Set<string>()
  for (const g of raw) {
    if (!g || typeof g !== 'object' || (g.kind && g.kind !== 'terrain') || !g.map || typeof g.map !== 'object') continue
    const id = String(g.id ?? '')
    if (seen.has(id)) continue
    const map: Record<string, number> = {}
    for (const [m, v] of Object.entries(g.map)) {
      const n = Number(v)
      if (Number.isInteger(Number(m)) && known.has(n)) map[m] = n
    }
    if (!Object.keys(map).length) continue
    seen.add(id)
    const type: TerrainType = g.type === 'blob47' || g.type === 'corner16' ? g.type : 'wang16'
    const rel = g.relations && typeof g.relations === 'object' ? g.relations : null
    terrains.push({
      id, name: String(g.name || ''), type, map,
      ...(rel ? {relations: {connects: (Array.isArray(rel.connects) ? rel.connects : []).map(String), priority: Number(rel.priority) || 0}} : {}),
    })
  }
  const groups: BrushGroup[] = (Array.isArray(meta.groups) ? meta.groups : [])
      .filter((g: any) => g && typeof g === 'object' && (g.kind ?? 'group') === 'group')
      .map((g: any) => ({
        id: String(g.id ?? g.name ?? ''),
        name: String(g.name || ''),
        random: g.random === true,
        tiles: (Array.isArray(g.tiles) ? g.tiles : []).map(Number).filter((n: number) => known.has(n)),
      }))
  const cell = meta.cell && typeof meta.cell === 'object' ? meta.cell : {}
  const ratio = Number(meta.isoRatio)
  return {
    id_string: idString ?? String(j?.id_string || ''),
    name: String(j?.name || ''),
    cellW: Math.max(1, Math.round(Number(cell.w) || 16)),
    cellH: Math.max(1, Math.round(Number(cell.h) || 16)),
    iso: meta.iso === true,
    isoRatio: Number.isFinite(ratio) ? Math.min(2, Math.max(0.25, ratio)) : 0.5,
    tiles, groups, terrains,
  }
}

/** A strip gathered from artworks: on a grid the size of the first one. */
export function gatheredSet(name: string, w: number, h: number, tiles: BrushTile[]): BrushSet {
  return {id_string: '', name, cellW: Math.max(1, w), cellH: Math.max(1, h), iso: false, isoRatio: 0.5, tiles, groups: [], terrains: []}
}

/** Every tile that is a piece of some terrain: the terrain brush stands for
 *  them, so the strip leaves them out. */
export function terrainPieces(s: BrushSet): Set<number> {
  const out = new Set<number>()
  for (const t of s.terrains) for (const id of Object.values(t.map)) out.add(id)
  return out
}

export function randomBrushes(s: BrushSet): BrushGroup[] {
  const out = s.groups.filter(g => g.random && g.tiles.length > 1)
  if (isGathered(s) && s.tiles.length > 1) out.push({id: ANY_ID, name: '', random: true, tiles: s.tiles.map(t => t.id)})
  return out
}

/** The tile that stands for a whole terrain: its fully surrounded piece. */
export function terrainFace(t: Terrain): number | null {
  const full = t.type === 'blob47' ? '255' : '15'
  return t.map[full] ?? Object.values(t.map)[0] ?? null
}

export type Brush =
    | { kind: 'terrain'; terrain: Terrain; key: string }
    | { kind: 'random'; group: BrushGroup; key: string }
    | { kind: 'tile'; tile: number; key: string }

/** The strip, in order: the terrains and random groups a tileset is built
 *  around, the tiles picked from the browser lately, then every other tile.
 *  Terrain pieces are left to their terrain. */
export function stripOf(s: BrushSet, recents: number[]): Brush[] {
  const pieces = terrainPieces(s)
  const ids = new Set(s.tiles.map(t => t.id))
  const recent = recents.filter(id => ids.has(id))
  return [
    ...s.terrains.map(t => ({kind: 'terrain' as const, terrain: t, key: `terrain:${t.id}`})),
    ...randomBrushes(s).map(g => ({kind: 'random' as const, group: g, key: `random:${g.id}`})),
    ...recent.map(id => ({kind: 'tile' as const, tile: id, key: `tile:${id}`})),
    ...s.tiles.filter(t => !pieces.has(t.id) && !recent.includes(t.id))
        .map(t => ({kind: 'tile' as const, tile: t.id, key: `tile:${t.id}`})),
  ]
}

// ── Auto-tiling a piece ─────────────────────────────────────────────────
// What `meta.autotile` keeps per layer: the terrain painted in each grid
// cell, and the piece it resolved to. Only cells a terrain wrote are in
// `cells`: when its terrain goes, so does the piece -- unlike the tilemap,
// where `cells` also holds tiles laid by hand.

export interface AutoLayer {
  terrain: Record<string, string>
  cells: Record<string, number>
}

export interface Bounds { cols: number; rows: number }

const ck = (c: number, r: number) => `${c}_${r}`
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const

function put(l: AutoLayer, k: string, tile: number | null, changed: Set<string>) {
  if ((l.cells[k] ?? null) === tile) return
  if (tile == null) delete l.cells[k]
  else l.cells[k] = tile
  changed.add(k)
}

function spill(l: AutoLayer, ts: Terrain[], c: number, r: number): Terrain | null {
  for (const [dc, dr] of AROUND) {
    const tid = l.terrain[ck(c + dc, r + dr)]
    if (!tid) continue
    const t = ts.find(x => x.id === tid)
    if (t?.type === 'corner16') return t
  }
  return null
}

function corner(l: AutoLayer, ts: Terrain[], t: Terrain, c: number, r: number, changed: Set<string>) {
  const mask = cornerMask(l.terrain, c, r, t.id, ts)
  put(l, ck(c, r), mask ? resolveTerrainTile(t, mask) : null, changed)
}

function resolve(l: AutoLayer, ts: Terrain[], c: number, r: number, changed: Set<string>) {
  const k = ck(c, r)
  const tid = l.terrain[k]
  if (!tid) {
    const s = spill(l, ts, c, r)
    if (s) corner(l, ts, s, c, r, changed)
    else if (k in l.cells) put(l, k, null, changed)
    return
  }
  const t = ts.find(x => x.id === tid)
  if (!t) {
    delete l.terrain[k]
    put(l, k, null, changed)
    return
  }
  if (t.type === 'corner16') return corner(l, ts, t, c, r, changed)
  put(l, k, resolveTerrainTile(t, terrainMask(l.terrain, c, r, tid, t.type || 'wang16', ts)), changed)
}

/** Re-picks the 3x3 around (c, r) -- all a change there can reach -- and
 *  returns the cells whose piece changed. */
export function autoReflow(l: AutoLayer, ts: Terrain[], c: number, r: number, b: Bounds): Set<string> {
  const changed = new Set<string>()
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const x = c + dc, y = r + dr
      if (x < 0 || y < 0 || x >= b.cols || y >= b.rows) continue
      resolve(l, ts, x, y, changed)
    }
  }
  return changed
}

export function autoPaint(l: AutoLayer, ts: Terrain[], tid: string, c: number, r: number, b: Bounds): Set<string> {
  if (l.terrain[ck(c, r)] === tid) return new Set()
  l.terrain[ck(c, r)] = tid
  return autoReflow(l, ts, c, r, b)
}

/** Erases the terrain at (c, r). Under a corner terrain that is every mark
 *  filling one of the cell's corners -- the 3x3 around it -- or nothing
 *  would visibly change inside an area. */
export function autoErase(l: AutoLayer, ts: Terrain[], c: number, r: number, b: Bounds): Set<string> {
  const cornerIds = new Set(ts.filter(t => t.type === 'corner16').map(t => t.id))
  const cleared: [number, number][] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const self = dc === 0 && dr === 0
      if (!self && !cornerIds.size) continue
      const k = ck(c + dc, r + dr)
      const tid = l.terrain[k]
      if (!tid || (!self && !cornerIds.has(tid))) continue
      delete l.terrain[k]
      cleared.push([c + dc, r + dr])
    }
  }
  const changed = new Set<string>()
  for (const [x, y] of cleared) for (const k of autoReflow(l, ts, x, y, b)) changed.add(k)
  return changed
}

/** The 3x3 a terrain thumbnail shows, row by row (null: bare): auto-tiled
 *  as painting it would, so it shows edges and corners rather than the plain
 *  inside, which reads as a colour swatch. A corner terrain spills from one
 *  painted cell; the others fill the block. */
export function patchOf(t: Terrain): (number | null)[] {
  const l: AutoLayer = {terrain: {}, cells: {}}
  const b = {cols: 3, rows: 3}
  if (t.type === 'corner16') autoPaint(l, [t], t.id, 1, 1, b)
  else for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) autoPaint(l, [t], t.id, c, r, b)
  const out: (number | null)[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(l.cells[ck(c, r)] ?? null)
  return out
}

// ── Where a tile lands ──────────────────────────────────────────────────

export interface BrushGrid {
  w: number
  h: number
  iso: boolean
}

export function gridOf(s: BrushSet, snap: boolean, iso: boolean): BrushGrid | null {
  if (!snap) return null
  const w = Math.max(1, s.cellW)
  return iso ? {w, h: Math.max(1, Math.round(w * s.isoRatio)), iso: true} : {w, h: Math.max(1, s.cellH), iso: false}
}

/** The grid cell under pixel (x, y). The iso grid is the tilemap's, with its
 *  origin at the canvas corner: diamond (0, 0) is centred on pixel (0, 0),
 *  +col steps right-down, +row left-down. */
export function cellOf(g: BrushGrid, x: number, y: number): { c: number; r: number } {
  if (!g.iso) return {c: Math.floor(x / g.w), r: Math.floor(y / g.h)}
  const a = (x + 0.5) / (g.w / 2), b = (y + 0.5) / (g.h / 2)
  return {c: Math.floor((a + b + 1) / 2), r: Math.floor((b - a + 1) / 2)}
}

/** Top-left pixel a w x h tile lands at in cell (c, r). On the square grid
 *  its foot stands on the cell's bottom-left corner, as in the tilemap: a
 *  tall tile reaches up, a wide one hangs to the right; one the size of a
 *  cell just fills it. On the iso grid it is centred on the diamond, its
 *  foot on the bottom tip. */
export function originOf(g: BrushGrid, c: number, r: number, w: number, h: number): { x: number; y: number } {
  if (!g.iso) return {x: c * g.w, y: (r + 1) * g.h - h}
  const cx = Math.round((c - r) * g.w / 2)
  const cy = Math.round((c + r) * g.h / 2)
  return {x: cx - Math.floor(w / 2), y: cy + Math.floor(g.h / 2) - h}
}

/** Every cell on the way from one to the other, both ends included. */
export function cellsBetween(c0: number, r0: number, c1: number, r1: number): { c: number; r: number }[] {
  const out: { c: number; r: number }[] = []
  const dc = Math.abs(c1 - c0), dr = -Math.abs(r1 - r0)
  const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1
  let err = dc + dr, c = c0, r = r0
  for (;;) {
    out.push({c, r})
    if (c === c1 && r === r1) break
    const e2 = 2 * err
    if (e2 >= dr) { err += dr; c += sc }
    if (e2 <= dc) { err += dc; r += sr }
  }
  return out
}
