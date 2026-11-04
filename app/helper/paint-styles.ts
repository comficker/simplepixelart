// Natural-media paint for color by number, after the techniques p5.brush
// uses (layered deformed watercolor polygons, grainy hatching, overlapping
// marker passes), in plain Canvas 2D.
//
// Paint lives in an off-screen "paint layer" at a fixed resolution per
// square; the visible canvas only scales it, so zooming and panning cost one
// drawImage. Strokes are seeded, so replaying them paints the same picture.

export const PAINT_STYLES = [
  {id: 'flat', name: 'Flat'},
  {id: 'watercolor', name: 'Watercolor'},
  {id: 'pencil', name: 'Colored pencil'},
  {id: 'charcoal', name: 'Crayon'},
  {id: 'marker', name: 'Marker'},
] as const
export type PaintStyle = typeof PAINT_STYLES[number]['id']

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const gauss = (r: () => number) => r() + r() + r() - 1.5

export function paintResolution(w: number, h: number) {
  return Math.max(8, Math.min(40, Math.floor(2400 / Math.max(w, h))))
}

type Pt = [number, number]
// One pass of midpoint displacement: every edge gets a new, pushed-out or
// pulled-in midpoint, which is what makes a watercolor edge wander.
function deform(pts: Pt[], amount: number, r: () => number): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    const d = gauss(r) * amount * len
    out.push([ax, ay], [(ax + bx) / 2 - (dy / len) * d, (ay + by) / 2 + (dx / len) * d])
  }
  return out
}
function poly(g: CanvasRenderingContext2D, pts: Pt[]) {
  g.beginPath()
  g.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1])
  g.closePath()
}

// How strongly a square is tinted the moment it fills: enough that no
// paper shows, light enough that the strokes on top carry the texture.
// It stays inside the square, so neighbours never overlap into a grid.
const GROUND: Record<PaintStyle, number> = {flat: 1, watercolor: 0.62, pencil: 0.18, charcoal: 0.25, marker: 0.68}

/** Gives square (x, y) its ground coat, R pixels per square. */
export function paintSquare(layer: CanvasRenderingContext2D, R: number, style: PaintStyle, color: string, x: number, y: number) {
  layer.globalCompositeOperation = 'source-over'
  layer.globalAlpha = GROUND[style]
  layer.fillStyle = color
  layer.fillRect(x * R, y * R, R, R)
  layer.globalAlpha = 1
}

// ---- Strokes ---------------------------------------------------------------
// A stroke follows the pointer the way a real tool would: graphite grains
// dragged along the tip, wet blobs pooling along the path, a felt tip
// laying a band of ink. All coordinates are paint-layer pixels.

/** The squares a stroke may touch, as a clip path in paint-layer pixels. */
export function squaresPath(squares: Iterable<{ x: number; y: number }>, R: number) {
  const p = new Path2D()
  for (const q of squares) p.rect(q.x * R, q.y * R, R, R)
  return p
}

// Dry media: a pencil tip is a bundle of fine lines running with the
// stroke. Each line is continuous but skips where the paper's tooth stops
// the pigment, and the lines at the edge of the tip press lighter. Lines are
// batched by opacity, so a segment is a handful of draw calls.
function pencilLines(
  g: CanvasRenderingContext2D, r: () => number, W: number, grain: number, heavy: boolean,
  x0: number, y0: number, d: number, ux: number, uy: number, lane: () => number,
) {
  const nx = -uy, ny = ux
  const thick = heavy ? Math.max(1.2, grain / 12) : Math.max(0.7, grain / 26)
  const lines = Math.max(3, Math.round(W / (thick * (heavy ? 1.4 : 2.2))))
  const piece = Math.max(1.5, thick * 2)
  const len = d || piece
  const alphas = [0.2, 0.38, 0.6, 0.85]
  const paths = alphas.map(() => new Path2D())
  for (let l = 0; l < lines; l++) {
    // Lanes are fixed for the whole stroke so each line runs on unbroken.
    const off = ((l + 0.5) / lines - 0.5) * W + gauss(lane) * thick * 0.8
    const edge = Math.abs(off) / (W / 2) // 0 middle .. 1 edge
    for (let t = 0; t < len; t += piece) {
      // Paper tooth: more skips toward the edge of the tip.
      if (r() < 0.12 + edge * 0.45) continue
      const level = Math.max(0, Math.min(3, Math.floor((1 - edge * 0.8) * 3 + r() * 1.6 - 0.4)))
      const sx = x0 + ux * t + nx * off, sy = y0 + uy * t + ny * off
      const e = Math.min(piece * 1.1, len - t)
      paths[level].moveTo(sx, sy)
      paths[level].lineTo(sx + ux * e, sy + uy * e)
    }
  }
  g.lineWidth = thick
  g.lineCap = 'butt'
  alphas.forEach((alpha, i) => {
    g.globalAlpha = heavy ? Math.min(1, alpha * 1.1) : alpha
    g.stroke(paths[i])
  })
}

// Watercolor: many faint, irregular blobs close together; where they pile
// up the colour deepens, and their wandering edges give the soft rim.
function wash(
  g: CanvasRenderingContext2D, r: () => number, W: number,
  x0: number, y0: number, d: number, ux: number, uy: number,
) {
  const step = W * 0.16, k = Math.max(1, Math.ceil(d / step))
  for (let i = d ? 1 : 0; i <= k; i++) {
    const cx = x0 + (ux * d * i) / k + gauss(r) * W * 0.06
    const cy = y0 + (uy * d * i) / k + gauss(r) * W * 0.06
    const rad = W * 0.5 * (0.75 + r() * 0.35)
    let pts: [number, number][] = []
    for (let j = 0; j < 8; j++) {
      const th = (j / 8) * Math.PI * 2 + r() * 0.3
      pts.push([cx + Math.cos(th) * rad, cy + Math.sin(th) * rad])
    }
    pts = deform(deform(pts, 0.18, r), 0.12, r)
    g.globalAlpha = 0.035 + r() * 0.035
    poly(g, pts)
    g.fill()
  }
}

/** Paints one segment of a stroke of the given tip width. */
export function strokeSegment(
  g: CanvasRenderingContext2D, style: PaintStyle, color: string, width: number, grain: number, seed: number,
  x0: number, y0: number, x1: number, y1: number,
) {
  if (style === 'flat') return
  const r = rng(seed)
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy)
  const ux = d ? dx / d : 1, uy = d ? dy / d : 0
  // Wet media and ink glaze over what is beneath; dry media sit on top.
  g.globalCompositeOperation = style === 'watercolor' || style === 'marker' ? 'multiply' : 'source-over'
  g.fillStyle = color
  g.strokeStyle = color
  if (style === 'pencil' || style === 'charcoal') pencilLines(g, r, width, grain, style === 'charcoal', x0, y0, d, ux, uy, rng(Math.floor(seed / 7919) + 1))
  else if (style === 'watercolor') wash(g, r, width, x0, y0, d, ux, uy)
  else {
    // Felt tip: a translucent band; the slight wobble keeps it hand-made.
    g.globalAlpha = 0.3
    g.lineWidth = width * (0.86 + r() * 0.08)
    g.lineCap = 'butt'
    g.beginPath()
    g.moveTo(x0 - ux * 0.5, y0 - uy * 0.5)
    g.lineTo(x1, y1)
    g.stroke()
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

/** Back-and-forth scribble covering squares x0..x1, y0..y1 (in squares). */
export function scribble(x0: number, y0: number, x1: number, y1: number, seed: number) {
  const r = rng(seed), pts: number[] = []
  let flip = false
  for (let y = y0 + 0.35; y < y1 + 1; y += 0.6) {
    const yy = y + gauss(r) * 0.08
    const a = x0 - 0.2, b = x1 + 1.2
    pts.push(flip ? b : a, yy, flip ? a : b, yy + 0.3)
    flip = !flip
  }
  return pts
}

// A small sample of a style in a colour, for the style picker.
export function stylePreview(style: PaintStyle, color: string, size = 40) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, size, size)
  if (style === 'flat') {
    g.fillStyle = color
    g.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6)
    return c.toDataURL()
  }
  // A short wavy stroke, the way the tool would leave it.
  const W = size * 0.38
  let px = size * 0.14, py = size * 0.68
  for (let i = 1; i <= 10; i++) {
    const x = size * (0.14 + (0.72 * i) / 10), y = size * (0.68 - (0.36 * i) / 10) + Math.sin(i * 0.9) * size * 0.05
    strokeSegment(g, style, color, W, size * 0.5, i * 31 + 7, px, py, x, y)
    px = x
    py = y
  }
  return c.toDataURL()
}
