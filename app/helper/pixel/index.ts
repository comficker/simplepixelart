// One library for every image → pixel-art path in the app. Each feature calls
// a preset here instead of wiring stages itself:
//
//   editor "Import files"  → importFileGrid   (legacy sampled engine — the
//   editor "Insert image"  → importFileGrid    quality benchmark, golden-locked
//                                              by simplepixelart/pixel_bench)
//   editor 1:1 import      → importOriginalGrid
//   /convert               → convertImageToGrid (+ cleanOrphanCells)
//   /generate (AI result)  → aiImageToGrid
//   tileset slicer         → imageToCells + the detect primitives
//
// Engines live beside this façade: ./legacy.ts (gradient-streak sampler),
// ./reconstruct.ts (scale detection, two-stage reconstruction, AI pipeline).
// Baseline numbers and the harness: simplepixelart/pixel_bench/ — run it
// before and after touching anything here.

import {isSameColor, rgbToHex} from '~/helper/color'
import {dataUrlToOriginalGrid, dataUrlToSamplesGrid} from './legacy'
import {
    estimateCellPx, imageToCells, peelGround, quantizeCells,
    reconstructCells as reconstructCellsFn,
} from './reconstruct'

export {
    aiImageToGrid, bestPhase, detectPixelScale, imageToCells, modeDownscale, shiftCrop,
} from './reconstruct'

export type Cell = [number, number, number] | null

export function shouldIgnoreColor(hex: string, ignoreColor: number[] | null): boolean {
    if (ignoreColor) {
        const [r, g, b] = ignoreColor
        const ignoreHex = rgbToHex(r!, g!, b!)
        return isSameColor(hex.replace('#', ''), ignoreHex.replace('#', ''))
    }
    return hex === '#ffffff' || isSameColor('ffffff', hex.replace('#', ''))
}

export async function importFileGrid(dataUrl: string): Promise<Cell[][] | null> {
    const {rgbSamplesGrid, colorThatRepresentsTransparent} = await dataUrlToSamplesGrid(dataUrl)
    if (!rgbSamplesGrid?.length) return null
    const ig = colorThatRepresentsTransparent
    return rgbSamplesGrid.map(row => row.map(cell => {
        if (!cell) return null
        return shouldIgnoreColor(rgbToHex(cell[0]!, cell[1]!, cell[2]!), ig) ? null : cell as Cell
    }))
}

export async function importOriginalGrid(dataUrl: string): Promise<Cell[][] | null> {
    const {grid, tooLarge} = await dataUrlToOriginalGrid(dataUrl)
    return (tooLarge || !grid.length) ? null : grid as Cell[][]
}

export function cleanOrphanCells(indexed: number[][]): { grid: number[][]; changed: number } {
    const h = indexed.length
    const w = indexed[0]?.length ?? 0
    const grid = indexed.map(r => [...r])
    let changed = 0
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = indexed[y]![x]!
            let same = 0
            if (y > 0 && indexed[y - 1]![x] === c) same++
            if (y < h - 1 && indexed[y + 1]![x] === c) same++
            if (x > 0 && indexed[y]![x - 1] === c) same++
            if (x < w - 1 && indexed[y]![x + 1] === c) same++
            if (same === 0) {
                const neighbors: number[] = []
                if (y > 0) neighbors.push(indexed[y - 1]![x]!)
                if (y < h - 1) neighbors.push(indexed[y + 1]![x]!)
                if (x > 0) neighbors.push(indexed[y]![x - 1]!)
                if (x < w - 1) neighbors.push(indexed[y]![x + 1]!)
                const counts = new Map<number, number>()
                for (const n of neighbors) counts.set(n, (counts.get(n) || 0) + 1)
                let majority = c, best = 0
                counts.forEach((v, k) => { if (v > best) { best = v; majority = k } })
                grid[y]![x] = majority
                changed++
            }
        }
    }
    return {grid, changed}
}

type RGBc = [number, number, number]

function contentBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number } | null {
    const PROBE = 256
    const f = Math.min(1, PROBE / Math.max(img.naturalWidth, img.naturalHeight))
    const pw = Math.max(1, Math.round(img.naturalWidth * f))
    const ph = Math.max(1, Math.round(img.naturalHeight * f))
    const cv = document.createElement('canvas')
    cv.width = pw
    cv.height = ph
    const ctx = cv.getContext('2d', {willReadFrequently: true})
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, pw, ph)
    const {data: D} = ctx.getImageData(0, 0, pw, ph)
    const at = (x: number, y: number) => (y * pw + x) * 4
    const hist = new Map<string, { n: number; c: RGBc }>()
    let border = 0
    const tally = (x: number, y: number) => {
        const o = at(x, y)
        const c: RGBc = [D[o]!, D[o + 1]!, D[o + 2]!]
        const k = `${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`
        const e = hist.get(k) || {n: 0, c}
        e.n++
        hist.set(k, e)
        border++
    }
    for (let x = 0; x < pw; x++) { tally(x, 0); tally(x, ph - 1) }
    for (let y = 1; y < ph - 1; y++) { tally(0, y); tally(pw - 1, y) }
    const top = [...hist.values()].sort((a, b) => b.n - a.n)[0]
    if (!top || top.n / border < 0.85) return null       // no uniform ground
    // Tight: cream-on-white sprites live a small distance from the ground —
    // a generous tolerance here cropped the cat's paws off (pixel_bench).
    const TOL = 3 * 12 * 12
    let x0 = pw, y0 = ph, x1 = -1, y1 = -1
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
        const o = at(x, y)
        const d = (D[o]! - top.c[0]) ** 2 + (D[o + 1]! - top.c[1]) ** 2 + (D[o + 2]! - top.c[2]) ** 2
        if (d > TOL || D[o + 3]! < 16) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
        }
    }
    if (x1 < 0) return null
    const inv = 1 / f
    const sx = Math.max(0, Math.floor(x0 * inv))
    const sy = Math.max(0, Math.floor(y0 * inv))
    const sw = Math.min(img.naturalWidth, Math.ceil((x1 + 1) * inv)) - sx
    const sh = Math.min(img.naturalHeight, Math.ceil((y1 + 1) * inv)) - sy
    if (sw >= img.naturalWidth * 0.98 && sh >= img.naturalHeight * 0.98) return null
    return {x: sx, y: sy, w: sw, h: sh}
}

export async function convertImageToGrid(
    img: HTMLImageElement,
    opts: {
        size: number | 'auto'
        maxColors: number
        brightness?: number
        contrast?: number
        saturation?: number
        dataUrl?: string
        cutBackground?: boolean
        dither?: boolean
    },
): Promise<{ palette: RGBc[]; indexed: number[][]; width: number; height: number; native?: boolean } | null> {
    // Pixel-art input? Read its OWN grid instead of resampling blind — an
    // upscaled export loses nothing this way (pixel_bench: blind resample of a
    // grid-lined or padded screenshot mis-phased every cell). Only untouched
    // inputs qualify: any colour adjustment needs the photo path anyway.
    const untouched = !opts.brightness && !opts.contrast && !opts.saturation
    if (opts.dataUrl && untouched) {
        try {
            const nat = await imageToCells(opts.dataUrl)
            if (nat && nat.scale > 1 && nat.cells.length) {
                const nh = nat.cells.length, nw = nat.cells[0]!.length
                const w = opts.size === 'auto' ? nw : opts.size
                const h = opts.size === 'auto' ? nh : Math.max(1, Math.round(w * nh / nw))
                const cells = (w === nw && h === nh) ? nat.cells
                    : Array.from({length: h}, (_, y) =>
                        Array.from({length: w}, (_, x) =>
                            nat.cells[Math.min(nh - 1, Math.floor((y + 0.5) * nh / h))]![
                                Math.min(nw - 1, Math.floor((x + 0.5) * nw / w))]!))
                const q = quantizeGrid(opts.cutBackground ? cellFloodGround(cells) : cells, opts)
                return {...q, width: w, height: h, native: true}
            }
        } catch { /* fall through to the photo path */ }
    }
    const box = contentBox(img)
    const sx = box?.x ?? 0
    const sy = box?.y ?? 0
    const sw = box?.w ?? img.naturalWidth
    const sh = box?.h ?? img.naturalHeight
    if (!sw || !sh) return null
    const ratio = sw / sh
    let w: number
    if (opts.size === 'auto') {
        let pitch: number | null = null
        try {
            const P = 1024
            const pf = Math.min(1, P / Math.max(sw, sh))
            const pcv = document.createElement('canvas')
            pcv.width = Math.max(1, Math.round(sw * pf))
            pcv.height = Math.max(1, Math.round(sh * pf))
            const pctx = pcv.getContext('2d', {willReadFrequently: true})!
            pctx.drawImage(img, sx, sy, sw, sh, 0, 0, pcv.width, pcv.height)
            const pd = pctx.getImageData(0, 0, pcv.width, pcv.height)
            const p = estimateCellPx(pd.data, pcv.width, pcv.height, 0, 0, pcv.width - 1, pcv.height - 1)
            if (p) pitch = p / pf
        } catch { /* fall back */ }
        w = pitch ? Math.max(8, Math.min(128, Math.round(sw / pitch))) : 48
    } else {
        w = opts.size
    }
    const h = Math.max(1, Math.round(w / ratio) || w)

    const cell = Math.max(2, Math.floor(512 / Math.max(w, h)))
    const ww = w * cell, hh = h * cell
    const cv = document.createElement('canvas')
    cv.width = ww
    cv.height = hh
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, ww, hh)
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ww, hh)
    const src = ctx.getImageData(0, 0, ww, hh)

    const bAdj = opts.brightness ?? 0
    const cAdj = (opts.contrast ?? 0) + 100
    const sAdj = (opts.saturation ?? 0) + 100
    if (bAdj || cAdj !== 100 || sAdj !== 100) {
        const d = src.data
        const c = cAdj / 100
        const sat = sAdj / 100
        for (let i = 0; i < d.length; i += 4) {
            let r = d[i]! + bAdj, g = d[i + 1]! + bAdj, b = d[i + 2]! + bAdj
            r = (r - 128) * c + 128
            g = (g - 128) * c + 128
            b = (b - 128) * c + 128
            const gray = 0.299 * r + 0.587 * g + 0.114 * b
            r = gray + (r - gray) * sat
            g = gray + (g - gray) * sat
            b = gray + (b - gray) * sat
            d[i] = Math.max(0, Math.min(255, Math.round(r)))
            d[i + 1] = Math.max(0, Math.min(255, Math.round(g)))
            d[i + 2] = Math.max(0, Math.min(255, Math.round(b)))
        }
    }
    if (opts.cutBackground) peelGround(src)
    const cells = reconstructCellsFn(src, w, h)
    const q = quantizeGrid(cells, opts)
    return {...q, width: w, height: h}
}

function cellFloodGround(cells: ([number, number, number] | null)[][]): ([number, number, number] | null)[][] {
    const h = cells.length, w = cells[0]?.length ?? 0
    if (!w) return cells
    const hist = new Map<string, { n: number; c: [number, number, number] }>()
    const edge: Array<[number, number]> = []
    for (let x = 0; x < w; x++) edge.push([x, 0], [x, h - 1])
    for (let y = 1; y < h - 1; y++) edge.push([0, y], [w - 1, y])
    for (const [x, y] of edge) {
        const c = cells[y]![x]
        if (!c) continue
        const k = `${c[0] >> 3},${c[1] >> 3},${c[2] >> 3}`
        const e = hist.get(k) || {n: 0, c}
        e.n++
        hist.set(k, e)
    }
    const top = [...hist.values()].sort((a, b) => b.n - a.n)[0]
    if (!top) return cells
    const TOL = 3 * 28 * 28
    const bg = top.c
    const out = cells.map(r => [...r])
    const seen = new Uint8Array(w * h)
    const stack = edge.filter(([x, y]) => {
        const c = cells[y]![x]
        return !c || (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2 <= TOL
    })
    while (stack.length) {
        const [x, y] = stack.pop()!
        if (x < 0 || y < 0 || x >= w || y >= h) continue
        const i = y * w + x
        if (seen[i]) continue
        seen[i] = 1
        const c = out[y]![x]
        if (c && (c[0] - bg[0]) ** 2 + (c[1] - bg[1]) ** 2 + (c[2] - bg[2]) ** 2 > TOL) continue
        out[y]![x] = null
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
    }
    return out
}

const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
].map(row => row.map(v => (v / 16 - 0.5)))

function quantizeGrid(
    cells: ([number, number, number] | null)[][],
    opts: {maxColors: number; cutBackground?: boolean; dither?: boolean},
): { palette: RGBc[]; indexed: number[][] } {
    const keepNull = !!opts.cutBackground
    let palette: RGBc[]
    if (!keepNull) {
        const q = quantizeCells(cells, opts.maxColors)
        if (!opts.dither) return q as { palette: RGBc[]; indexed: number[][] }
        palette = q.palette as RGBc[]
    } else {
        const solid: [number, number, number][] = []
        for (const row of cells) for (const c of row) if (c) solid.push(c)
        palette = quantizeCells([solid.length ? solid : [[255, 255, 255]]], opts.maxColors).palette as RGBc[]
    }
    const nearest = (c: [number, number, number]) => {
        let bi = 0, bd = Infinity
        for (let i = 0; i < palette.length; i++) {
            const p = palette[i]!
            const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2
            if (d < bd) { bd = d; bi = i }
        }
        return bi
    }
    const AMP = 40
    const indexed = cells.map((row, y) => row.map((c, x) => {
        if (!c) return keepNull ? -1 : nearest([255, 255, 255])
        if (!opts.dither) return nearest(c)
        const t = BAYER4[y & 3]![x & 3]!
        return nearest([
            Math.max(0, Math.min(255, c[0] + t * AMP)),
            Math.max(0, Math.min(255, c[1] + t * AMP)),
            Math.max(0, Math.min(255, c[2] + t * AMP)),
        ])
    }))
    return {palette, indexed}
}
