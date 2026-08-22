
export type TilemapMode = 'grid' | 'iso'
export type LayerKind = 'ground' | 'sprite'

export interface TilemapLayer {
  id: string
  name: string
  kind: LayerKind
  visible: boolean
  ySort: boolean
  cells: Record<string, number>
  terrain: Record<string, string>
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

export const CELL_PRESETS = [24, 32, 48, 64, 96]
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
export const MAX_DIM = 64
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

function normLayer(l: any, i: number): TilemapLayer {
  const kind: LayerKind = l?.kind === 'sprite' ? 'sprite' : 'ground'
  return {
    id: (typeof l?.id === 'string' && l.id) ? l.id : `layer-${i + 1}`,
    name: (typeof l?.name === 'string' && l.name) ? l.name : `Layer ${i + 1}`,
    kind,
    visible: l?.visible !== false,
    ySort: typeof l?.ySort === 'boolean' ? l.ySort : kind === 'sprite',
    cells: cleanCells(l?.cells),
    terrain: cleanTerrain(l?.terrain),
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

function drawGround(ctx: CanvasRenderingContext2D, img: HTMLImageElement,
                    c: TilemapConfig, g: TileGeometry, col: number, row: number, s: number) {
  if (c.mode === 'iso') {
    const iw = Math.round(g.tileW * s)
    const ih = Math.round(img.naturalHeight * (g.tileW / (img.naturalWidth || 1)) * s)
    const {x: cx, y: cy} = cellCenter(c, g, col, row)
    const baseY = cy + g.tileH / 2
    ctx.drawImage(img, Math.round(cx * s - iw / 2), Math.round(baseY * s - ih), iw, ih)
  } else {
    const x0 = Math.round(col * g.tileW * s), x1 = Math.round((col + 1) * g.tileW * s)
    const y0 = Math.round(row * g.tileH * s), y1 = Math.round((row + 1) * g.tileH * s)
    ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0)
  }
}

function drawSprite(ctx: CanvasRenderingContext2D, img: HTMLImageElement,
                    c: TilemapConfig, g: TileGeometry, col: number, row: number, s: number) {
  const iw = Math.round(img.naturalWidth * s), ih = Math.round(img.naturalHeight * s)
  const {x: cx, y: cy} = cellCenter(c, g, col, row)
  const baseY = c.mode === 'iso' ? (cy + g.tileH / 2) : (row + 1) * g.tileH
  ctx.drawImage(img, Math.round(cx * s - iw / 2), Math.round(baseY * s - ih), iw, ih)
}

function depthKey(c: TilemapConfig, col: number, row: number): number {
  return c.mode === 'iso' ? col + row : row
}

function drawLayer(ctx: CanvasRenderingContext2D, c: TilemapConfig, g: TileGeometry,
                   layer: Record<string, number>, images: ImgMap,
                   how: (i: HTMLImageElement, col: number, row: number) => void,
                   ySort: boolean) {
  const placed = Object.entries(layer)
      .map(([k, id]) => {
        const [col, row] = k.split('_').map(Number)
        return {col: col!, row: row!, id}
      })
  if (ySort) {
    placed.sort((a, b) => depthKey(c, a.col, a.row) - depthKey(c, b.col, b.row) || a.row - b.row || a.col - b.col)
  } else {
    placed.sort((a, b) => a.row - b.row || a.col - b.col)
  }
  for (const {col, row, id} of placed) {
    const img = images.get(id)
    if (ready(img)) how(img, col, row)
  }
}

export function drawPlacedTiles(ctx: CanvasRenderingContext2D, c: TilemapConfig,
                                g: TileGeometry, images: ImgMap, scale = 1) {
  ctx.imageSmoothingEnabled = false
  for (const layer of c.layers) {
    if (!layer.visible) continue
    const how = layer.kind === 'sprite'
        ? (img: HTMLImageElement, col: number, row: number) => drawSprite(ctx, img, c, g, col, row, scale)
        : (img: HTMLImageElement, col: number, row: number) => drawGround(ctx, img, c, g, col, row, scale)
    drawLayer(ctx, c, g, layer.cells, images, how, layer.ySort ?? (layer.kind === 'sprite'))
  }
}

export function placedIds(c: TilemapConfig): number[] {
  const ids: number[] = []
  for (const layer of c.layers) for (const id of Object.values(layer.cells)) ids.push(id)
  return ids
}

export function renderTilemap(ctx: CanvasRenderingContext2D, c: TilemapConfig,
                              g: TileGeometry, images: ImgMap, scale = 1) {
  ctx.clearRect(0, 0, g.width * scale, g.height * scale)
  if (c.bg) { ctx.fillStyle = c.bg; ctx.fillRect(0, 0, g.width * scale, g.height * scale) }
  drawPlacedTiles(ctx, c, g, images, scale)
}
