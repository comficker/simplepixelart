/**
 * Animated tiles on a tilemap.
 *
 * A tile is an ordinary art page, and some of them animate (meta.animation):
 * a cow chewing, a windmill turning. The board draws each tile from its
 * server-rendered PNG, which is the first frame only. These helpers turn the
 * page's own frames into transparent canvases and pick the one to show at a
 * given moment, so the board can play them without the server drawing more.
 *
 * The animated GIF the server makes is no use here: it is flattened onto
 * white and scaled up, so every cow would carry a white box.
 */

export interface TileAnim {
  frames: HTMLCanvasElement[]
  // When each frame starts, in ms from the start of the loop.
  starts: number[]
  total: number
}

interface RawLayer { pixels?: Record<string, number>; x?: number; y?: number }

/** Composite layers into {"x_y": colour index}. Array order, later on top —
 * the same rule as the editor's layers2MapNumbers and the server's GIF. */
function frameMap(layers: RawLayer[], w: number, h: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const layer of layers) {
    const lx = Number(layer?.x) || 0, ly = Number(layer?.y) || 0
    for (const [k, ci] of Object.entries(layer?.pixels || {})) {
      if (ci == null || ci === -1) continue
      const sep = k.indexOf('_')
      const x = +k.slice(0, sep) + lx, y = +k.slice(sep + 1) + ly
      if (x >= 0 && x < w && y >= 0 && y < h) out[`${x}_${y}`] = ci
    }
  }
  return out
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex
  const n = parseInt(h.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A page's animation as canvases, or null when it does not animate. */
export function buildTileAnim(page: any): TileAnim | null {
  const anim = page?.meta?.animation
  const frames = Array.isArray(anim?.frames) ? anim.frames : []
  const w = Number(page?.width) || 0, h = Number(page?.height) || 0
  if (frames.length < 2 || !w || !h || typeof document === 'undefined') return null
  const colors = (Array.isArray(page.colors) ? page.colors : []).map((c: string) => hexRgb(String(c)))
  const shared: RawLayer[] = Array.isArray(anim.shared) ? anim.shared : []
  const fallback = Math.round(1000 / (Number(anim.fps) || 10))
  const out: TileAnim = {frames: [], starts: [], total: 0}
  for (const fr of frames) {
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    const img = ctx.createImageData(w, h)
    // Shared background first, so the frame's own content lands on top.
    const map = frameMap([...shared, ...(Array.isArray(fr?.layers) ? fr.layers : [])], w, h)
    for (const [k, ci] of Object.entries(map)) {
      const rgb = colors[ci]
      if (!rgb) continue
      const sep = k.indexOf('_')
      const o = ((+k.slice(sep + 1)) * w + (+k.slice(0, sep))) * 4
      img.data[o] = rgb[0]
      img.data[o + 1] = rgb[1]
      img.data[o + 2] = rgb[2]
      img.data[o + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    out.frames.push(cv)
    out.starts.push(out.total)
    out.total += Math.max(20, Number(fr?.duration) || fallback)
  }
  return out
}

/** The frame to show at `t` ms. `phase` (0..1) offsets this copy, so a herd
 * placed from one tile does not move in lockstep. */
export function animFrame(a: TileAnim, t: number, phase = 0): HTMLCanvasElement {
  const at = (t + phase * a.total) % a.total
  let i = a.starts.length - 1
  while (i > 0 && a.starts[i]! > at) i--
  return a.frames[i]!
}

/** A stable 0..1 per cell, so each placed copy keeps its own phase. */
export function cellPhase(col: number, row: number): number {
  let h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return (h % 1000) / 1000
}
