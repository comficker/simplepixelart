/**
 * One tileset atlas, shared by every export.
 *
 * The tileset editor's "Export for Godot / Tiled" and the tilemap's map
 * export both go through here, so a map arrives in the engine with the very
 * tileset you exported — terrains, collision and animated tiles included —
 * instead of a copy re-packed per tile size that knew none of that.
 *
 * Images must already be loaded: packing is synchronous.
 */
import {buildSheet, type Sheet, type SheetGroup, type SheetSource} from '~/helper/sheet-layout'
import type {EngineAnimTile, EngineSheet} from '~/helper/engine-export'
import type {TileAnim} from '~/helper/tile-anim'

export interface AtlasRect { x: number; y: number; w: number; h: number }

export interface PackOptions {
  name: string
  /** File name of the main atlas PNG. */
  image: string
  /** File name of the animated-tiles atlas PNG, if there are any. */
  animImage: string
  groups: SheetGroup[]
  src: SheetSource
  imageOf: (slug: string) => HTMLImageElement | null
  solid?: Set<number>
  anims?: Map<number, TileAnim>
}

export interface PackedTileset {
  sheet: Sheet
  canvas: HTMLCanvasElement
  animCanvas: HTMLCanvasElement | null
  engine: EngineSheet
  /** Where a tile id sits in the main atlas (its first appearance). */
  cellOf: Map<number, AtlasRect>
  /** Per terrain id: the slot each tile id occupies in that terrain's block. */
  terrainCell: Map<string, Map<number, AtlasRect>>
  /** Animated tiles: their first frame in the animation atlas. */
  animOf: Map<number, AtlasRect & { frames: number }>
}

export function packTileset(o: PackOptions): PackedTileset {
  const sheet = buildSheet(o.groups, o.src)
  const {w: cw, h: ch} = o.src.cell
  const solid = o.solid || new Set<number>()

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, sheet.w)
  canvas.height = Math.max(1, sheet.h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  // Each block the way the board shows a tile: never scaled up, centred when
  // the art is smaller than its block.
  for (const b of sheet.blocks) {
    const img = b.slug ? o.imageOf(b.slug) : null
    if (!img) continue
    const scale = Math.min(b.w / img.naturalWidth, b.h / img.naturalHeight, 1)
    const dw = Math.max(1, Math.round(img.naturalWidth * scale))
    const dh = Math.max(1, Math.round(img.naturalHeight * scale))
    ctx.drawImage(img, b.x + Math.floor((b.w - dw) / 2), b.y + Math.floor((b.h - dh) / 2), dw, dh)
  }

  const cellOf = new Map<number, AtlasRect>()
  for (const t of sheet.tiles) if (!cellOf.has(t.id)) cellOf.set(t.id, {x: t.x, y: t.y, w: t.w, h: t.h})
  const terrainCell = new Map<string, Map<number, AtlasRect>>()
  for (const tr of sheet.terrains) {
    const m = new Map<number, AtlasRect>()
    for (const s of Object.values(tr.slots)) if (!m.has(s.id)) m.set(s.id, {x: s.x, y: s.y, w: cw, h: ch})
    terrainCell.set(tr.id, m)
    for (const [id, r] of m) if (!cellOf.has(id)) cellOf.set(id, r)
  }

  // Animated tiles get an atlas of their own: Godot plays a tile's frames
  // from the cells to its right, and the main atlas has no room there. One
  // row per tile, frames left to right, each frame a whole number of cells.
  const animOf = new Map<number, AtlasRect & { frames: number }>()
  const animTiles: EngineAnimTile[] = []
  let animCanvas: HTMLCanvasElement | null = null
  const animated = [...(o.anims || new Map()).entries()].filter(([id]) => cellOf.has(id))
  if (animated.length) {
    let y = 0
    let width = cw
    const rows = animated.map(([id, a]) => {
      const f0 = a.frames[0]!
      const sw = Math.max(1, Math.ceil(f0.width / cw)) * cw
      const sh = Math.max(1, Math.ceil(f0.height / ch)) * ch
      const row = {id, a, x: 0, y, w: sw, h: sh}
      y += sh
      width = Math.max(width, sw * a.frames.length)
      return row
    })
    animCanvas = document.createElement('canvas')
    animCanvas.width = width
    animCanvas.height = Math.max(ch, y)
    const actx = animCanvas.getContext('2d')!
    actx.imageSmoothingEnabled = false
    for (const r of rows) {
      r.a.frames.forEach((f, i) => {
        const scale = Math.min(r.w / f.width, r.h / f.height, 1)
        const dw = Math.max(1, Math.round(f.width * scale))
        const dh = Math.max(1, Math.round(f.height * scale))
        actx.drawImage(f, r.x + i * r.w + Math.floor((r.w - dw) / 2), r.y + Math.floor((r.h - dh) / 2), dw, dh)
      })
      animOf.set(r.id, {x: r.x, y: r.y, w: r.w, h: r.h, frames: r.a.frames.length})
      const durations = r.a.frames.map((_, i) =>
          (i + 1 < r.a.starts.length ? r.a.starts[i + 1]! : r.a.total) - r.a.starts[i]!)
      animTiles.push({x: r.x, y: r.y, w: r.w, h: r.h, durations, ...(solid.has(r.id) ? {solid: true} : {})})
    }
  }

  const engine: EngineSheet = {
    name: o.name,
    image: o.image,
    cell: {w: cw, h: ch},
    size: {w: sheet.w, h: sheet.h},
    tiles: sheet.tiles.map(t => ({
      x: t.x, y: t.y, w: t.w, h: t.h,
      ...(t.prob ? {prob: t.prob} : {}),
      ...(solid.has(t.id) ? {solid: true} : {}),
    })),
    terrains: sheet.terrains.map(t => ({
      name: t.name,
      type: t.type,
      slots: Object.entries(t.slots).map(([mask, s]) => ({
        mask: Number(mask), x: s.x, y: s.y, ...(solid.has(s.id) ? {solid: true} : {}),
      })),
    })),
    ...(animCanvas ? {anim: {image: o.animImage, size: {w: animCanvas.width, h: animCanvas.height}, tiles: animTiles}} : {}),
  }

  return {sheet, canvas, animCanvas, engine, cellOf, terrainCell, animOf}
}

export function canvasBytes(cv: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => cv.toBlob(async (b) => {
    if (!b) return reject(new Error('canvas is empty'))
    resolve(new Uint8Array(await b.arrayBuffer()))
  }, 'image/png'))
}
