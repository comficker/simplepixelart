// Tileset sheet layout — where every tile sits in the packed PNG.
//
// The editor's board arrangement IS the exported sheet, so this is the single
// source of truth for both: the page renders it to a canvas, and the offline
// pack script (scripts/build-pack.ts) renders the same numbers with sharp.
// Keep it DOM-free — it only needs each tile's natural pixel size.
//
// Groups stack top→bottom in order; a plain group shelf-packs its tiles into
// rows that wrap at the shared sheet width, a terrain group lays its auto-tile
// slots out in a square grid (4×4 for wang16, 7×7 for blob47).

import {BLOB_SLOTS, TERRAIN_SLOTS, type TerrainType} from '~/helper/autotile'

export interface SheetCell {
  w: number
  h: number
}

// Structural subset of the editor's TileGroup — everything layout depends on.
export interface SheetGroup {
  id: string
  name: string
  kind: 'group' | 'terrain'
  tiles: number[]
  pos?: Record<string, { x: number; y: number }>
  random?: boolean
  weights?: Record<string, number>
  map?: Record<string, number>
  type?: TerrainType
}

export interface SheetBlock {
  slug: string | null
  x: number
  y: number
  w: number
  h: number
}

export interface SheetTile {
  id: number
  id_string: string | null
  group: string
  x: number
  y: number
  w: number
  h: number
  prob?: number
}

export interface SheetTerrain {
  id: string
  name: string
  type: TerrainType
  slots: Record<string, { id: number; x: number; y: number }>
}

export interface Sheet {
  blocks: SheetBlock[]      // what to draw, in paint order
  tiles: SheetTile[]        // plain-group tiles, for the sidecars
  terrains: SheetTerrain[]  // terrain slots, for the sidecars
  w: number
  h: number
}

// How the caller resolves a tile id to art: its slug and that art's native size
// (null while an image is still loading — layout then assumes one cell).
export interface SheetSource {
  cell: SheetCell
  slugOf(id: number): string | null
  sizeOf(slug: string | null): { w: number; h: number } | null
}

export function terrainSlotsOf(type?: TerrainType) {
  return type === 'blob47' ? BLOB_SLOTS : TERRAIN_SLOTS
}

export function terrainGridNOf(type?: TerrainType) {
  return type === 'blob47' ? 7 : 4
}

// One shared column count so every group packs to the same sheet width.
export function sheetColumns(groups: SheetGroup[]) {
  const biggest = Math.max(1, ...groups.filter(g => g.kind === 'group').map(g => g.tiles.length))
  return Math.max(4, Math.ceil(Math.sqrt(biggest)))
}

// How many base cells an art occupies (its natural size snapped up to the grid).
export function tileCells(id: number, src: SheetSource) {
  const {cell} = src
  const nat = src.sizeOf(src.slugOf(id))
  if (!nat) return {cols: 1, rows: 1, nw: cell.w, nh: cell.h}
  return {
    cols: Math.max(1, Math.ceil(nat.w / cell.w)),
    rows: Math.max(1, Math.ceil(nat.h / cell.h)),
    nw: nat.w,
    nh: nat.h,
  }
}

// Tile rects inside a plain group (native units). Pinned tiles (g.pos) sit at
// their free, cell-snapped position; the rest shelf-pack into wrapping rows.
export function layoutGroup(g: SheetGroup, cols: number, src: SheetSource) {
  const {cell} = src
  const maxW = cols * cell.w
  const rects: { x: number; y: number; w: number; h: number }[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const id of g.tiles) {
    const c = tileCells(id, src)
    const tw = c.cols * cell.w
    const th = c.rows * cell.h
    const pin = g.pos?.[String(id)]
    if (pin) {
      rects.push({x: pin.x, y: pin.y, w: tw, h: th})
      continue
    }
    if (x > 0 && x + tw > maxW) {
      x = 0
      y += rowH
      rowH = 0
    }
    rects.push({x, y, w: tw, h: th})
    x += tw
    rowH = Math.max(rowH, th)
  }
  // Bounding box — pinned tiles may sit anywhere, including left/above origin.
  // An empty group still reserves a small box so its header stays grabbable.
  let minX = 0
  let minY = 0
  let maxX = cell.w * 3
  let maxY = cell.h
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return {rects, minX, minY, w: maxX - minX, h: maxY - minY}
}

/** Lay the chosen groups out as stacked blocks — the packed sheet. */
export function buildSheet(groups: SheetGroup[], src: SheetSource): Sheet {
  const {w, h} = src.cell
  const cols = sheetColumns(groups)
  const blocks: SheetBlock[] = []
  const tiles: SheetTile[] = []
  const terrains: SheetTerrain[] = []
  let yOff = 0
  let maxW = 0

  for (const g of groups) {
    if (g.kind === 'group') {
      if (!g.tiles.length) continue
      const L = layoutGroup(g, cols, src)
      g.tiles.forEach((id, i) => {
        const r = L.rects[i]!
        const bx = r.x - L.minX
        const by = yOff + (r.y - L.minY)
        const weight = g.random ? (g.weights?.[String(id)] ?? 1) : 1
        blocks.push({slug: src.slugOf(id), x: bx, y: by, w: r.w, h: r.h})
        tiles.push({
          id, id_string: src.slugOf(id), group: g.id, x: bx, y: by, w: r.w, h: r.h,
          ...(weight !== 1 ? {prob: weight} : {}),
        })
      })
      maxW = Math.max(maxW, L.w)
      yOff += L.h
    } else {
      if (!Object.keys(g.map || {}).length) continue
      const n = terrainGridNOf(g.type)
      const slots: SheetTerrain['slots'] = {}
      terrainSlotsOf(g.type).forEach((mask, i) => {
        const id = g.map?.[String(mask)]
        const bx = (i % n) * w
        const by = yOff + Math.floor(i / n) * h
        blocks.push({slug: id != null ? src.slugOf(id) : null, x: bx, y: by, w, h})
        if (id != null) slots[String(mask)] = {id, x: bx, y: by}
      })
      terrains.push({id: g.id, name: g.name, type: g.type || 'wang16', slots})
      maxW = Math.max(maxW, n * w)
      yOff += n * h
    }
  }

  return {blocks, tiles, terrains, w: maxW, h: yOff}
}
