
import type {TilemapLayer} from '~/helper/tilemap'

// wang16 matches sides, blob47 sides and corners — both pick a tile for each
// PAINTED cell from its neighbours. corner16 is a corner set (Tiled's "Corner"
// wang set, Godot's "Match Corners"): painting a cell fills its four corners,
// and every cell shows the tile for which of ITS corners are filled, so the
// terrain spills half a cell into unpainted neighbours. Packs drawn that way
// (Sunnyside, most farming sets) have no tile for a one-cell-wide strip at
// all, and only render sensibly with this rule.
export type TerrainType = 'wang16' | 'blob47' | 'corner16'

export interface TerrainRelations {
  connects: string[]
  priority: number
}

export interface Terrain {
  id: string
  name: string
  type?: TerrainType
  map: Record<string, number>
  relations?: TerrainRelations
}

export const MASK_N = 1
export const MASK_E = 2
export const MASK_S = 4
export const MASK_W = 8
export const MASK_NE = 16
export const MASK_SE = 32
export const MASK_SW = 64
export const MASK_NW = 128

export const TERRAIN_SLOTS = Array.from({length: 16}, (_, i) => i)

// corner16 slot = which corners are filled. Slot 0 (no corner) draws nothing,
// so it is not a slot.
export const CORNER_TL = 1
export const CORNER_TR = 2
export const CORNER_BL = 4
export const CORNER_BR = 8
export const CORNER_SLOTS = Array.from({length: 15}, (_, i) => i + 1)

export function cornerSides(mask: number) {
  return {
    tl: !!(mask & CORNER_TL),
    tr: !!(mask & CORNER_TR),
    bl: !!(mask & CORNER_BL),
    br: !!(mask & CORNER_BR),
  }
}

export function canonicalBlobMask(m: number): number {
  if (!((m & MASK_N) && (m & MASK_E))) m &= ~MASK_NE
  if (!((m & MASK_S) && (m & MASK_E))) m &= ~MASK_SE
  if (!((m & MASK_S) && (m & MASK_W))) m &= ~MASK_SW
  if (!((m & MASK_N) && (m & MASK_W))) m &= ~MASK_NW
  return m
}

export const BLOB_SLOTS: number[] = (() => {
  const out: number[] = []
  for (let m = 0; m < 256; m++) {
    if (canonicalBlobMask(m) === m) out.push(m)
  }
  return out
})()

export function slotSides(mask: number) {
  return {
    n: !!(mask & MASK_N),
    e: !!(mask & MASK_E),
    s: !!(mask & MASK_S),
    w: !!(mask & MASK_W),
    ne: !!(mask & MASK_NE),
    se: !!(mask & MASK_SE),
    sw: !!(mask & MASK_SW),
    nw: !!(mask & MASK_NW),
  }
}

function key(col: number, row: number) {
  return `${col}_${row}`
}

export function connectsPredicate(tid: string, terrains?: Terrain[]): (other: string) => boolean {
  const self = terrains?.find(t => t.id === tid)
  const rel = self?.relations
  if (!rel?.connects?.length) return other => other === tid
  const myPrio = Number(rel.priority) || 0
  const wanted = new Set(rel.connects)
  return (other: string) => {
    if (other === tid) return true
    if (!wanted.has(other)) return false
    const u = terrains!.find(t => t.id === other)
    return u ? (Number(u.relations?.priority) || 0) >= myPrio : false
  }
}

export function terrainMask(terrain: Record<string, string>, col: number, row: number, tid: string, type: TerrainType = 'wang16', terrains?: Terrain[]): number {
  const connected = connectsPredicate(tid, terrains)
  const at = (c: number, r: number) => {
    const v = terrain[key(c, r)]
    return !!v && connected(v)
  }
  let mask = 0
  if (at(col, row - 1)) mask |= MASK_N
  if (at(col + 1, row)) mask |= MASK_E
  if (at(col, row + 1)) mask |= MASK_S
  if (at(col - 1, row)) mask |= MASK_W
  if (type !== 'blob47') return mask
  if (at(col + 1, row - 1)) mask |= MASK_NE
  if (at(col + 1, row + 1)) mask |= MASK_SE
  if (at(col - 1, row + 1)) mask |= MASK_SW
  if (at(col - 1, row - 1)) mask |= MASK_NW
  return canonicalBlobMask(mask)
}

const ALL_BITS = [MASK_N, MASK_E, MASK_S, MASK_W, MASK_NE, MASK_SE, MASK_SW, MASK_NW]

export function resolveTerrainTile(t: Terrain, mask: number): number | null {
  const exact = t.map[String(mask)]
  if (exact) return exact
  let best: number | null = null
  let bestScore = -1
  for (const [m, tile] of Object.entries(t.map)) {
    if (!tile) continue
    const mm = Number(m)
    let score = 0
    for (const bit of ALL_BITS) {
      if ((mm & bit) === (mask & bit)) score += bit <= MASK_W ? 2 : 1
    }
    if (score > bestScore) {
      bestScore = score
      best = tile
    }
  }
  return best
}

/** Which corners of a cell a corner16 terrain fills. A corner is filled when
 * any of the four cells sharing it is painted with that terrain (or one it
 * connects to). */
export function cornerMask(terrain: Record<string, string>, col: number, row: number, tid: string, terrains?: Terrain[]): number {
  const connected = connectsPredicate(tid, terrains)
  const painted = (c: number, r: number) => {
    const v = terrain[key(c, r)]
    return !!v && connected(v)
  }
  const filled = (vx: number, vy: number) =>
    painted(vx - 1, vy - 1) || painted(vx, vy - 1) || painted(vx - 1, vy) || painted(vx, vy)
  let mask = 0
  if (filled(col, row)) mask |= CORNER_TL
  if (filled(col + 1, row)) mask |= CORNER_TR
  if (filled(col, row + 1)) mask |= CORNER_BL
  if (filled(col + 1, row + 1)) mask |= CORNER_BR
  return mask
}

const NEIGHBOURS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]

/** The corner16 terrain painted next to an unpainted cell, if any — that is
 * the terrain spilling into it. */
function spillTerrain(layer: TilemapLayer, terrains: Terrain[], col: number, row: number): Terrain | null {
  for (const [dc, dr] of NEIGHBOURS) {
    const tid = layer.terrain[key(col + dc!, row + dr!)]
    if (!tid) continue
    const t = terrains.find(x => x.id === tid)
    if (t?.type === 'corner16') return t
  }
  return null
}

function resolveCorner(layer: TilemapLayer, terrains: Terrain[], t: Terrain, col: number, row: number) {
  const k = key(col, row)
  const mask = cornerMask(layer.terrain, col, row, t.id, terrains)
  const tile = mask ? resolveTerrainTile(t, mask) : null
  if (tile) layer.cells[k] = tile
  else delete layer.cells[k]
}

function resolveCell(layer: TilemapLayer, terrains: Terrain[], col: number, row: number) {
  const k = key(col, row)
  const tid = layer.terrain[k]
  if (!tid) {
    // Unpainted: a corner terrain next door spills in, or — once it is gone —
    // its old spill tile has to go too. A tile the user placed by hand is
    // left alone unless a corner terrain is spilling over it.
    const spill = spillTerrain(layer, terrains, col, row)
    if (spill) resolveCorner(layer, terrains, spill, col, row)
    else if (layer.cells[k] && terrains.some(x => x.type === 'corner16'
        && Object.values(x.map).includes(layer.cells[k]!))) delete layer.cells[k]
    return
  }
  const t = terrains.find(x => x.id === tid)
  if (!t) {
    delete layer.terrain[k]
    return
  }
  if (t.type === 'corner16') {
    resolveCorner(layer, terrains, t, col, row)
    return
  }
  const tile = resolveTerrainTile(t, terrainMask(layer.terrain, col, row, tid, t.type || 'wang16', terrains))
  if (tile) layer.cells[k] = tile
  else delete layer.cells[k]
}

// Painting a cell changes its four corners, which belong to the eight cells
// around it — the same 3x3 every terrain type already reflows.
// `bounds` keeps a corner terrain's spill on the map: unlike the other types
// it writes cells nobody painted, and the edge row would grow one past it.
export function reflowTerrain(layer: TilemapLayer, terrains: Terrain[], col: number, row: number,
                              bounds?: { cols: number; rows: number }) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = col + dc, r = row + dr
      if (c < 0 || r < 0 || (bounds && (c >= bounds.cols || r >= bounds.rows))) continue
      resolveCell(layer, terrains, c, r)
    }
  }
}

/** Erase under a corner terrain: clear every corner-terrain mark that fills a
 * corner of this cell — the 3x3 around it — so the cell really comes out
 * empty. Clearing only its own mark changes nothing you can see inside an
 * area: its four corners stay filled by the neighbours. Returns whether
 * anything was cleared, so the caller can fall back to a plain erase. */
export function eraseCornerTerrain(layer: TilemapLayer, terrains: Terrain[], col: number, row: number,
                                   bounds?: { cols: number; rows: number }): boolean {
  const corner = new Set(terrains.filter(t => t.type === 'corner16').map(t => t.id))
  if (!corner.size) return false
  const cleared: [number, number][] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const k = key(col + dc, row + dr)
      const tid = layer.terrain[k]
      if (tid && corner.has(tid)) {
        delete layer.terrain[k]
        delete layer.cells[k]
        cleared.push([col + dc, row + dr])
      }
    }
  }
  for (const [c, r] of cleared) reflowTerrain(layer, terrains, c, r, bounds)
  return cleared.length > 0
}
