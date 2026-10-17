// Tile pixels for the art brush, and pictures of tiles for its strip.
//
// A tileset's tiles come from its sheet when the server has one
// (`/coloring/tilesets/<id>/sheet/`: every tile at 1x in one PNG and where
// each sits) -- one request for a set of a thousand tiles, where a picture
// per tile flooded the server and came back with holes. Without it, or for a
// tile too big for the sheet, each tile is its own art-original PNG.

import {shallowReactive} from 'vue'
import {useNativeFetch} from '~/composables/useCustomFetch'
import {tileImageUrl} from '~/helper/tilemap'
import type {BrushSet} from '~/helper/tileBrush'

export interface TilePixels {
  w: number
  h: number
  cells: (string | null)[][]
}

export interface SheetInfo {
  url: string
  w: number
  h: number
  rects: Record<string, [number, number, number, number]>
}

/** Sheets by tileset, null when the server has none. Reactive, so a strip
 *  drawn before the sheet arrived redraws from it. */
export const sheets = shallowReactive(new Map<string, SheetInfo | null>())
const sheetLoads = new Map<string, Promise<SheetInfo | null>>()
const sheetData = new Map<string, Promise<ImageData | null>>()
const pixelCache = new Map<string, Promise<TilePixels | null>>()

/** The sheet as a short object URL: its base64 is 100KB and more, and a
 *  strip shows it as the background of every tile. */
function blobUrl(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], {type: 'image/png'}))
}

export function loadSheet(idString: string): Promise<SheetInfo | null> {
  let p = sheetLoads.get(idString)
  if (!p) {
    p = useNativeFetch<any>(`/coloring/tilesets/${idString}/sheet/`)
        .then(res => res && typeof res.png === 'string' && res.tiles
            ? {url: blobUrl(res.png), w: Number(res.w) || 0, h: Number(res.h) || 0, rects: res.tiles}
            : null)
        .catch(() => null)
        .then(info => { sheets.set(idString, info); return info })
    sheetLoads.set(idString, p)
  }
  return p
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function imageData(img: CanvasImageSource, w: number, h: number): ImageData | null {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', {willReadFrequently: true})
  if (!g) return null
  g.drawImage(img, 0, 0)
  return g.getImageData(0, 0, w, h)
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')

/** A w x h region of `data` as rows of hex colours; a pixel less than half
 *  opaque is empty, as pixel art has no soft edges. */
function cellsOf(data: ImageData, x0: number, y0: number, w: number, h: number): TilePixels {
  const cells: (string | null)[][] = []
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = []
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * data.width + (x0 + x)) * 4
      const d = data.data
      row.push(d[i + 3]! < 128 ? null : `#${hex2(d[i]!)}${hex2(d[i + 1]!)}${hex2(d[i + 2]!)}`.toUpperCase())
    }
    cells.push(row)
  }
  return {w, h, cells}
}

function sheetPixels(info: SheetInfo, idString: string): Promise<ImageData | null> {
  let p = sheetData.get(idString)
  if (!p) {
    p = loadImage(info.url).then(img => imageData(img, info.w, info.h)).catch(() => null)
    sheetData.set(idString, p)
  }
  return p
}

async function fromUrl(url: string): Promise<TilePixels | null> {
  const img = await loadImage(url)
  const data = imageData(img, img.naturalWidth, img.naturalHeight)
  return data ? cellsOf(data, 0, 0, data.width, data.height) : null
}

/** Pixels of tile `id` of `set` (apiBase: the API's origin). `local` gives a guest tileset's tiles their
 *  pixels straight from the art kept in the browser. */
export function tilePixels(set: BrushSet, id: number, apiBase: string,
                           local?: (id: number) => TilePixels | null): Promise<TilePixels | null> {
  const key = `${set.id_string}|${id}`
  let p = pixelCache.get(key)
  if (!p) {
    p = (async () => {
      const tile = set.tiles.find(t => t.id === id)
      if (!tile) return null
      if (local) return local(id)
      if (set.id_string) {
        const info = await loadSheet(set.id_string)
        const rect = info?.rects[String(id)]
        if (info && rect) {
          const data = await sheetPixels(info, set.id_string)
          if (data) return cellsOf(data, rect[0], rect[1], rect[2], rect[3])
        }
      }
      return fromUrl(tileImageUrl(apiBase, tile.id_string))
    })().then(px => px && px.cells.some(r => r.some(Boolean)) ? px : null).catch(() => null)
    pixelCache.set(key, p)
    // A failure is not kept: the next pick tries again.
    p.then(px => { if (!px) pixelCache.delete(key) })
  }
  return p
}

/** Mirrors a tile, for a brush laid down flipped. */
export function flipPixels(px: TilePixels, h: boolean, v: boolean): TilePixels {
  if (!h && !v) return px
  const rows = v ? [...px.cells].reverse() : px.cells
  return {w: px.w, h: px.h, cells: rows.map(r => (h ? [...r].reverse() : r))}
}
