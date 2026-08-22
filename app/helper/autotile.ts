
import type {TilemapLayer} from '~/helper/tilemap'

export type TerrainType = 'wang16' | 'blob47'

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

function resolveCell(layer: TilemapLayer, terrains: Terrain[], col: number, row: number) {
  const k = key(col, row)
  const tid = layer.terrain[k]
  if (!tid) return
  const t = terrains.find(x => x.id === tid)
  if (!t) {
    delete layer.terrain[k]
    return
  }
  const tile = resolveTerrainTile(t, terrainMask(layer.terrain, col, row, tid, t.type || 'wang16', terrains))
  if (tile) layer.cells[k] = tile
  else delete layer.cells[k]
}

export function reflowTerrain(layer: TilemapLayer, terrains: Terrain[], col: number, row: number) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      resolveCell(layer, terrains, col + dc, row + dr)
    }
  }
}
