
export type TilemapMode = 'grid' | 'iso'
export type LayerKind = 'ground' | 'sprite' | 'object'

// A cell holds a tile id, with its orientation in the bits above it — the
// layout Tiled uses for gids, scaled down to stay a safe positive integer.
// Applied the way Tiled and Godot apply them: the diagonal flip (swap x and
// y) first, then horizontal, then vertical. Turning right is diagonal + H.
export const FLIP_H = 1 << 28
export const FLIP_V = 1 << 27
export const FLIP_D = 1 << 26
export const TILE_MASK = FLIP_D - 1
export const tileOf = (v: number) => v & TILE_MASK
export const flagsOf = (v: number) => v & (FLIP_H | FLIP_V | FLIP_D)

/** Orientation after turning a tile a quarter right (dir 1) or left (-1). */
export function rotateFlags(f: number, dir: 1 | -1): number {
  const h = !!(f & FLIP_H), v = !!(f & FLIP_V), d = !!(f & FLIP_D)
  // Right: (d, h, v) -> (!d, !v, h). Left: (d, h, v) -> (!d, v, !h).
  const nd = !d
  const nh = dir > 0 ? !v : v
  const nv = dir > 0 ? h : !h
  return (nh ? FLIP_H : 0) | (nv ? FLIP_V : 0) | (nd ? FLIP_D : 0)
}

/** A named point on an object layer — a spawn, a door, a trigger. */
export interface TilemapObject {
  id: string
  name: string
  col: number
  row: number
}

export interface TilemapLayer {
  id: string
  name: string
  kind: LayerKind
  visible: boolean
  ySort: boolean
  cells: Record<string, number>
  terrain: Record<string, string>
  objects?: TilemapObject[]
}

export interface TilemapConfig {
  mode: TilemapMode
  cols: number
  rows: number
  cellW: number
  cellH: number
  isoRatio: number
  bg: string
  seed: number
  layers: TilemapLayer[]
}

export const CELL_PRESETS = [16, 24, 32, 48, 64, 96]
export const MIN_CELL = 8
export const MAX_CELL = 256
export const ISO_RATIOS = [
  {label: '2:1', value: 0.5},
  {label: '3:2', value: 2 / 3},
  {label: '1:1', value: 1},
]
export const MIN_ISO_RATIO = 0.25
export const MAX_ISO_RATIO = 2
export const MIN_DIM = 2
export const MAX_DIM = 128
export const MAX_LAYERS = 12

function cleanCells(raw: any): Record<string, number> {
  const out: Record<string, number> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const id = Number(v)
      if (/^\d+_\d+$/.test(k) && Number.isFinite(id) && id > 0) out[k] = id
    }
  }
  return out
}

function cleanTerrain(raw: any): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (/^\d+_\d+$/.test(k) && typeof v === 'string' && v) out[k] = v
    }
  }
  return out
}

export function makeLayer(name: string, id: string, kind: LayerKind = 'ground', cells = {}): TilemapLayer {
  return {id, name, kind, visible: true, ySort: kind === 'sprite', cells: cleanCells(cells), terrain: {}}
}

export const DEFAULT_TILEMAP: TilemapConfig = {
  mode: 'grid', cols: 10, rows: 10, cellW: 48, cellH: 48, isoRatio: 0.5, bg: '', seed: 0,
  layers: [makeLayer('Layer 1', 'layer-1', 'ground')],
}

export function cellRoll(seed: number, col: number, row: number): number {
  let h = (seed | 0) ^ 0x9e3779b9
  h = Math.imul(h ^ col, 0x85ebca6b)
  h = Math.imul(h ^ row, 0xc2b2ae35)
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2f)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

function cleanObjects(raw: any): TilemapObject[] {
  if (!Array.isArray(raw)) return []
  return raw
      .filter(o => o && Number.isFinite(+o.col) && Number.isFinite(+o.row))
      .map((o, i) => ({
        id: typeof o.id === 'string' && o.id ? o.id : `obj-${i + 1}`,
        name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'spawn',
        col: Math.max(0, Math.round(+o.col)),
        row: Math.max(0, Math.round(+o.row)),
      }))
}

function normLayer(l: any, i: number): TilemapLayer {
  const kind: LayerKind = l?.kind === 'sprite' || l?.kind === 'object' ? l.kind : 'ground'
  return {
    id: (typeof l?.id === 'string' && l.id) ? l.id : `layer-${i + 1}`,
    name: (typeof l?.name === 'string' && l.name) ? l.name : `Layer ${i + 1}`,
    kind,
    visible: l?.visible !== false,
    ySort: typeof l?.ySort === 'boolean' ? l.ySort : kind === 'sprite',
    cells: cleanCells(l?.cells),
    terrain: cleanTerrain(l?.terrain),
    ...(kind === 'object' ? {objects: cleanObjects(l?.objects)} : {}),
  }
}

export function normalizeTilemap(raw: any): TilemapConfig {
  const t = (raw && typeof raw === 'object') ? raw : {}
  const mode: TilemapMode = t.mode === 'iso' ? 'iso' : 'grid'
  const clampDim = (n: any, d: number) =>
      Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(Number(n) || d)))

  let layers: TilemapLayer[]
  if (Array.isArray(t.layers) && t.layers.length) {
    layers = t.layers.map((l: any, i: number) => normLayer(l, i))
  } else {
    layers = []
    const base = {...cleanCells(t.cells), ...cleanCells(t.tiles)}
    const top = cleanCells(t.sprites)
    if (Object.keys(base).length || !Object.keys(top).length) {
      layers.push(makeLayer('Ground', 'layer-1', 'ground', base))
    }
    if (Object.keys(top).length) layers.push(makeLayer('Sprites', 'layer-2', 'sprite', top))
  }
  if (!layers.length) layers = [makeLayer('Layer 1', 'layer-1', 'ground')]

  const clampCell = (n: any, d: number) =>
      Math.max(MIN_CELL, Math.min(MAX_CELL, Math.round(Number(n) || d)))
  const legacy = Math.round(Number(t.cell)) || 0
  const cellW = clampCell(t.cellW ?? legacy, DEFAULT_TILEMAP.cellW)
  const cellH = clampCell(t.cellH ?? legacy, DEFAULT_TILEMAP.cellH)
  const isoRatio = Math.max(MIN_ISO_RATIO,
      Math.min(MAX_ISO_RATIO, Number(t.isoRatio) || DEFAULT_TILEMAP.isoRatio))

  return {
    mode,
    cols: clampDim(t.cols, DEFAULT_TILEMAP.cols),
    rows: clampDim(t.rows, DEFAULT_TILEMAP.rows),
    cellW,
    cellH,
    isoRatio,
    bg: typeof t.bg === 'string' ? t.bg : '',
    seed: Math.max(0, Math.min(999999, Math.round(Number(t.seed) || 0))),
    layers,
  }
}

export interface TileGeometry {
  tileW: number
  tileH: number
  originX: number
  originY: number
  width: number
  height: number
}

function topPad(mode: TilemapMode, pad: number) {
  return mode === 'iso' ? pad : 0
}

export function computeGeometry(c: TilemapConfig): TileGeometry {
  if (c.mode === 'iso') {
    const tileW = c.cellW, tileH = Math.max(1, Math.round(c.cellW * c.isoRatio))
    const pad = topPad('iso', tileW)
    return {
      tileW, tileH,
      originX: c.rows * tileW / 2,
      originY: pad,
      width: (c.cols + c.rows) * tileW / 2,
      height: pad + (c.cols + c.rows - 1) * tileH / 2 + tileH / 2,
    }
  }
  return {
    tileW: c.cellW, tileH: c.cellH, originX: 0, originY: 0,
    width: c.cols * c.cellW, height: c.rows * c.cellH,
  }
}

export function cellCenter(c: TilemapConfig, g: TileGeometry, col: number, row: number) {
  if (c.mode === 'iso') {
    return {
      x: g.originX + (col - row) * g.tileW / 2,
      y: g.originY + (col + row) * g.tileH / 2,
    }
  }
  return {x: col * g.tileW + g.tileW / 2, y: row * g.tileH + g.tileH / 2}
}

export function cellAt(c: TilemapConfig, g: TileGeometry, x: number, y: number) {
  let col: number, row: number
  if (c.mode === 'iso') {
    const a = (x - g.originX) / (g.tileW / 2)
    const b = (y - g.originY) / (g.tileH / 2)
    col = Math.floor((a + b + 1) / 2)
    row = Math.floor((b - a + 1) / 2)
  } else {
    col = Math.floor(x / g.tileW)
    row = Math.floor(y / g.tileH)
  }
  if (col < 0 || row < 0 || col >= c.cols || row >= c.rows) return null
  return {col, row}
}

export function tileImageUrl(apiBase: string, idString: string): string {
  return `${apiBase}/coloring/files/art-original/${idString}.png`
}

type ImgMap = Map<number, HTMLImageElement>

function ready(img?: HTMLImageElement): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0
}

// `src`, when given, is what gets painted — an animation frame — while `img`
// (the tile's still PNG) still decides the size and the cells it spans.
/** drawImage into a box, turned and mirrored in place by a cell's flags. */
function drawOriented(ctx: CanvasRenderingContext2D, src: CanvasImageSource,
                      x: number, y: number, w: number, h: number, flags: number) {
  if (!flags) {
    ctx.drawImage(src, x, y, w, h)
    return
  }
  const d = !!(flags & FLIP_D)
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  // Canvas applies these last-first, so the image sees D, then H, then V.
  if (flags & FLIP_V) ctx.scale(1, -1)
  if (flags & FLIP_H) ctx.scale(-1, 1)
  if (d) ctx.transform(0, 1, 1, 0, 0, 0)
  // A diagonal flip swaps the box's sides, so draw the swapped box.
  const dw = d ? h : w, dh = d ? w : h
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

export function drawGround(ctx: CanvasRenderingContext2D, img: HTMLImageElement,
                           c: TilemapConfig, g: TileGeometry, col: number, row: number, s: number,
                           src: CanvasImageSource = img, flags = 0) {
  if (c.mode === 'iso') {
    const span = Math.max(1, Math.round(img.naturalWidth / g.tileW))
    const iw = Math.round(g.tileW * span * s)
    const ih = Math.round(img.naturalHeight * ((g.tileW * span) / (img.naturalWidth || 1)) * s)
    const {x: cx, y: cy} = cellCenter(c, g, col, row)
    const baseY = cy + g.tileH / 2
    drawOriented(ctx, src, Math.round(cx * s - iw / 2), Math.round(baseY * s - ih), iw, ih, flags)
  } else {
    const spanC = Math.max(1, Math.round(img.naturalWidth / g.tileW))
    const spanR = Math.max(1, Math.round(img.naturalHeight / g.tileH))
    const x0 = Math.round(col * g.tileW * s), x1 = Math.round((col + spanC) * g.tileW * s)
    const y1 = Math.round((row + 1) * g.tileH * s), y0 = Math.round((row + 1 - spanR) * g.tileH * s)
    drawOriented(ctx, src, x0, y0, x1 - x0, y1 - y0, flags)
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement,
                    c: TilemapConfig, g: TileGeometry, col: number, row: number, s: number,
                    src: CanvasImageSource = img, flags = 0) {
  const iw = Math.round(img.naturalWidth * s), ih = Math.round(img.naturalHeight * s)
  const {x: cx, y: cy} = cellCenter(c, g, col, row)
  const baseY = c.mode === 'iso' ? (cy + g.tileH / 2) : (row + 1) * g.tileH
  drawOriented(ctx, src, Math.round(cx * s - iw / 2), Math.round(baseY * s - ih), iw, ih, flags)
}

function depthKey(c: TilemapConfig, col: number, row: number): number {
  return c.mode === 'iso' ? col + row : row
}

function drawLayer(ctx: CanvasRenderingContext2D, c: TilemapConfig, g: TileGeometry,
                   layer: Record<string, number>, images: ImgMap,
                   how: (i: HTMLImageElement, col: number, row: number, src: CanvasImageSource | undefined, flags: number) => void,
                   ySort: boolean, frameOf?: FrameOf) {
  const placed = Object.entries(layer)
      .map(([k, v]) => {
        const [col, row] = k.split('_').map(Number)
        return {col: col!, row: row!, id: tileOf(v), flags: flagsOf(v)}
      })
  if (ySort) {
    placed.sort((a, b) => depthKey(c, a.col, a.row) - depthKey(c, b.col, b.row) || a.row - b.row || a.col - b.col)
  } else {
    placed.sort((a, b) => a.row - b.row || a.col - b.col)
  }
  for (const {col, row, id, flags} of placed) {
    const img = images.get(id)
    if (ready(img)) how(img, col, row, frameOf?.(id, col, row) ?? undefined, flags)
  }
}

// The frame of an animated tile to paint at this cell right now, or null to
// paint its still image. Left out, every tile is drawn still (exports, thumbs).
export type FrameOf = (id: number, col: number, row: number) => CanvasImageSource | null

export function drawPlacedTiles(ctx: CanvasRenderingContext2D, c: TilemapConfig,
                                g: TileGeometry, images: ImgMap, scale = 1, frameOf?: FrameOf) {
  ctx.imageSmoothingEnabled = false
  for (const layer of c.layers) {
    if (!layer.visible || layer.kind === 'object') continue
    const how = layer.kind === 'sprite'
        ? (img: HTMLImageElement, col: number, row: number, src: CanvasImageSource | undefined, flags: number) =>
            drawSprite(ctx, img, c, g, col, row, scale, src, flags)
        : (img: HTMLImageElement, col: number, row: number, src: CanvasImageSource | undefined, flags: number) =>
            drawGround(ctx, img, c, g, col, row, scale, src, flags)
    drawLayer(ctx, c, g, layer.cells, images, how, layer.ySort ?? (layer.kind === 'sprite'), frameOf)
  }
}

/** Tile ids on the map, orientation stripped. */
export function placedIds(c: TilemapConfig): number[] {
  const ids: number[] = []
  for (const layer of c.layers) for (const v of Object.values(layer.cells)) ids.push(tileOf(v))
  return ids
}

export function renderTilemap(ctx: CanvasRenderingContext2D, c: TilemapConfig,
                              g: TileGeometry, images: ImgMap, scale = 1, frameOf?: FrameOf) {
  ctx.clearRect(0, 0, g.width * scale, g.height * scale)
  if (c.bg) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, g.width * scale, g.height * scale) }
  drawPlacedTiles(ctx, c, g, images, scale, frameOf)
}
