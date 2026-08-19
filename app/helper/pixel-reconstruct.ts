// Core "fake pixel art → true pixel grid" toolkit, shared by the editor's
// file import, Insert image, the /convert page, the AI generator and the
// tileset slicer. The detection + reconstruction ideas are ports from
// Retro-Diffusion/pixel-art-fixer (MIT,
// https://github.com/Retro-Diffusion/pixel-art-fixer):
//
//   DETECTION — a true upscale factor survives a mode-downscale→upscale
//   round-trip almost losslessly, a wrong one shreds edges. Score = changed
//   pixels normalized by EDGE count (area normalization lets flat backgrounds
//   dilute the damage), scanned over every phase offset (a crop rarely starts
//   on a block boundary), largest factor within the minimum-error band wins
//   (resolves the divisor/octave ambiguity: 4× art also scores 0 at 2×).
//
//   RECONSTRUCTION — two-stage: quantize the source to generous color LABELS,
//   each output cell votes on a label (center-weighted, so bleeding cell
//   borders count less), then the cell's color is the weighted mean of the
//   ORIGINAL pixels carrying the winning label. Crisp region edges instead of
//   the mush a plain average produces; hues never clamp to the label palette.

export type RGB = [number, number, number]
export type Cell = RGB | null

const EDGE_TOL = 22 * 22 * 3      // "colors differ" threshold, squared RGB
const ALPHA_ON = 16               // alpha ≥ this counts as opaque

// ── Small shared primitives ─────────────────────────────────────────

function medianCut(pixels: RGB[], k: number): RGB[] {
    function cut(bucket: RGB[], depth: number): RGB[] {
        if (depth === 0 || bucket.length === 0) {
            if (!bucket.length) return []
            let r = 0, g = 0, b = 0
            for (const p of bucket) { r += p[0]; g += p[1]; b += p[2] }
            const n = bucket.length
            return [[Math.round(r / n), Math.round(g / n), Math.round(b / n)]]
        }
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0
        for (const p of bucket) {
            if (p[0] < rMin) rMin = p[0]; if (p[0] > rMax) rMax = p[0]
            if (p[1] < gMin) gMin = p[1]; if (p[1] > gMax) gMax = p[1]
            if (p[2] < bMin) bMin = p[2]; if (p[2] > bMax) bMax = p[2]
        }
        const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin
        const ch = rR >= gR && rR >= bR ? 0 : (gR >= bR ? 1 : 2)
        bucket.sort((a, b) => a[ch] - b[ch])
        const mid = Math.floor(bucket.length / 2)
        return [...cut(bucket.slice(0, mid), depth - 1), ...cut(bucket.slice(mid), depth - 1)]
    }
    const out = cut(pixels, Math.ceil(Math.log2(Math.max(2, k)))).slice(0, k)
    return out.length ? out : [[0, 0, 0]]
}

function nearest(p: RGB, palette: RGB[]): number {
    let best = 0, bestD = Infinity
    for (let i = 0; i < palette.length; i++) {
        const c = palette[i]!
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
        if (d < bestD) { bestD = d; best = i }
    }
    return best
}

// ── Scale / phase detection ─────────────────────────────────────────

// Downsample by f using the most common colour per block (kills AA blur
// cleanly; mostly-transparent blocks stay transparent).
export function modeDownscale(data: Uint8ClampedArray, w: number, h: number, f: number) {
    const w2 = Math.max(1, Math.round(w / f)), h2 = Math.max(1, Math.round(h / f))
    const out = new Uint8ClampedArray(w2 * h2 * 4)
    for (let oy = 0; oy < h2; oy++) {
        for (let ox = 0; ox < w2; ox++) {
            const counts = new Map<number, number>()
            let transparent = 0, total = 0
            for (let y = 0; y < f; y++) {
                for (let x = 0; x < f; x++) {
                    const sx = ox * f + x, sy = oy * f + y
                    if (sx >= w || sy >= h) continue
                    total++
                    const i = (sy * w + sx) * 4
                    if (data[i + 3]! < ALPHA_ON) { transparent++; continue }
                    const k = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
                    counts.set(k, (counts.get(k) || 0) + 1)
                }
            }
            const oi = (oy * w2 + ox) * 4
            if (counts.size === 0 || transparent * 2 > total) { out[oi + 3] = 0; continue }
            let bestK = 0, best = -1
            counts.forEach((v, k) => { if (v > best) { best = v; bestK = k } })
            out[oi] = (bestK >> 16) & 255; out[oi + 1] = (bestK >> 8) & 255; out[oi + 2] = bestK & 255; out[oi + 3] = 255
        }
    }
    return {data: out, w: w2, h: h2}
}

export function shiftCrop(data: Uint8ClampedArray, w: number, h: number, ox: number, oy: number) {
    const sw = w - ox, sh = h - oy
    const out = new Uint8ClampedArray(sw * sh * 4)
    for (let y = 0; y < sh; y++) {
        out.set(data.subarray(((y + oy) * w + ox) * 4, ((y + oy) * w + ox + sw) * 4), y * sw * 4)
    }
    return {data: out, w: sw, h: sh}
}

// Color-boundary pixels — a near-flat image round-trips losslessly at ANY
// factor, so without edge evidence no factor may be claimed.
function edgeCount(data: Uint8ClampedArray, w: number, h: number): number {
    let edges = 0
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const i = (y * w + x) * 4, r = i + 4, d = i + w * 4
            const dr1 = data[i]! - data[r]!, dg1 = data[i + 1]! - data[r + 1]!, db1 = data[i + 2]! - data[r + 2]!
            const dr2 = data[i]! - data[d]!, dg2 = data[i + 1]! - data[d + 1]!, db2 = data[i + 2]! - data[d + 2]!
            if (dr1 * dr1 + dg1 * dg1 + db1 * db1 > EDGE_TOL || dr2 * dr2 + dg2 * dg2 + db2 * db2 > EDGE_TOL
                || Math.abs(data[i + 3]! - data[r + 3]!) > 40 || Math.abs(data[i + 3]! - data[d + 3]!) > 40) edges++
        }
    }
    return edges
}

// Pixels the downscale→upscale round-trip changes.
function roundTripChanged(data: Uint8ClampedArray, w: number, h: number, f: number): number {
    const down = modeDownscale(data, w, h, f)
    let changed = 0
    for (let y = 0; y < h; y++) {
        const sy = Math.min(down.h - 1, Math.floor(y / f))
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4
            const o = (sy * down.w + Math.min(down.w - 1, Math.floor(x / f))) * 4
            const aSrc = data[i + 3]! >= ALPHA_ON, aRt = down.data[o + 3]! >= ALPHA_ON
            if (!aSrc && !aRt) continue
            if (aSrc !== aRt) { changed++; continue }
            const dr = data[i]! - down.data[o]!, dg = data[i + 1]! - down.data[o + 1]!, db = data[i + 2]! - down.data[o + 2]!
            if (dr * dr + dg * dg + db * db > EDGE_TOL) changed++
        }
    }
    return changed
}

// Best phase for one factor: the alignment whose round-trip changes the
// fewest pixels (a correct factor at the wrong phase scores as badly as a
// wrong factor, so phase must be solved per candidate).
export function bestPhase(data: Uint8ClampedArray, w: number, h: number, f: number):
    { f: number; ox: number; oy: number; changed: number } {
    if (f <= 1) return {f: 1, ox: 0, oy: 0, changed: 0}
    let best = {f, ox: 0, oy: 0, changed: Infinity}
    for (let oy = 0; oy < f && best.changed > 0; oy++) {
        for (let ox = 0; ox < f && best.changed > 0; ox++) {
            const s = shiftCrop(data, w, h, ox, oy)
            const changed = roundTripChanged(s.data, s.w, s.h, f)
            if (changed < best.changed) best = {f, ox, oy, changed}
        }
    }
    return best
}

export function detectPixelScale(data: Uint8ClampedArray, w: number, h: number):
    { f: number; ox: number; oy: number } {
    const edges = edgeCount(data, w, h)
    if (edges < 16) return {f: 1, ox: 0, oy: 0}   // flat — nothing to say
    const cands: { f: number; ox: number; oy: number; e: number }[] = []
    for (let f = 2; f <= 8; f++) {
        if (w < f * 2 || h < f * 2) break
        const b = bestPhase(data, w, h, f)
        cands.push({f: b.f, ox: b.ox, oy: b.oy, e: b.changed / edges})
    }
    if (!cands.length) return {f: 1, ox: 0, oy: 0}
    const emin = Math.min(...cands.map(c => c.e))
    if (emin > 0.15) return {f: 1, ox: 0, oy: 0}   // even the best factor is destructive
    const accepted = cands.filter(c => c.e <= Math.max(emin * 2, 0.02))
    const best = accepted.reduce((a, b) => (b.f > a.f ? b : a))
    return {f: best.f, ox: best.ox, oy: best.oy}
}

// ── Two-stage reconstruction ────────────────────────────────────────

/**
 * Reconstruct an outW×outH cell grid from a source bitmap. Each cell maps to
 * the source rect [x0 + cx·cellW, …] — pass x0/y0/cellW/cellH to honor a
 * detected grid phase, or leave default to spread the whole bitmap evenly.
 * Cells whose weight is mostly transparent come back as null.
 */
export function reconstructCells(
    src: ImageData, outW: number, outH: number,
    opts?: { x0?: number; y0?: number; cellW?: number; cellH?: number },
): Cell[][] {
    const {width: sw, height: sh, data} = src
    const x0 = opts?.x0 ?? 0
    const y0 = opts?.y0 ?? 0
    const cellW = opts?.cellW ?? (sw - x0) / outW
    const cellH = opts?.cellH ?? (sh - y0) / outH

    // Structure labels from a stride-sample of the opaque source.
    const stride = Math.max(1, Math.floor(Math.sqrt((sw * sh) / 65536)))
    const sample: RGB[] = []
    for (let y = 0; y < sh; y += stride) {
        for (let x = 0; x < sw; x += stride) {
            const i = (y * sw + x) * 4
            if (data[i + 3]! >= ALPHA_ON) sample.push([data[i]!, data[i + 1]!, data[i + 2]!])
        }
    }
    if (!sample.length) return Array.from({length: outH}, () => Array(outW).fill(null))
    const labels = medianCut(sample, 48)
    const L = labels.length

    const labelOf = new Int16Array(sw * sh)   // -1 = transparent
    for (let i = 0; i < sw * sh; i++) {
        const o = i * 4
        labelOf[i] = data[o + 3]! < ALPHA_ON
            ? -1
            : nearest([data[o]!, data[o + 1]!, data[o + 2]!], labels)
    }

    const out: Cell[][] = []
    const votes = new Float32Array(L)
    for (let cy = 0; cy < outH; cy++) {
        const row: Cell[] = []
        const ry0 = y0 + cy * cellH, ry1 = y0 + (cy + 1) * cellH
        for (let cx = 0; cx < outW; cx++) {
            const rx0 = x0 + cx * cellW, rx1 = x0 + (cx + 1) * cellW
            votes.fill(0)
            let clearW = 0
            const px0 = Math.max(0, Math.floor(rx0)), px1 = Math.min(sw, Math.ceil(rx1))
            const py0 = Math.max(0, Math.floor(ry0)), py1 = Math.min(sh, Math.ceil(ry1))
            const mx = (rx0 + rx1) / 2, my = (ry0 + ry1) / 2
            for (let y = py0; y < py1; y++) {
                const wy = Math.max(0.05, 1 - Math.abs((y + 0.5 - my) / (cellH / 2 || 1)))
                for (let x = px0; x < px1; x++) {
                    const wx = Math.max(0.05, 1 - Math.abs((x + 0.5 - mx) / (cellW / 2 || 1)))
                    const l = labelOf[y * sw + x]!
                    if (l < 0) clearW += wx * wy
                    else votes[l]! += wx * wy
                }
            }
            let win = -1, winV = 0
            for (let l = 0; l < L; l++) if (votes[l]! > winV) { winV = votes[l]!; win = l }
            if (win < 0 || clearW > winV && clearW > (px1 - px0) * (py1 - py0) * 0.15) {
                row.push(null)
                continue
            }
            let r = 0, g = 0, b = 0, wsum = 0
            for (let y = py0; y < py1; y++) {
                const wy = Math.max(0.05, 1 - Math.abs((y + 0.5 - my) / (cellH / 2 || 1)))
                for (let x = px0; x < px1; x++) {
                    if (labelOf[y * sw + x] !== win) continue
                    const wx = Math.max(0.05, 1 - Math.abs((x + 0.5 - mx) / (cellW / 2 || 1)))
                    const wgt = wx * wy, o = (y * sw + x) * 4
                    r += data[o]! * wgt; g += data[o + 1]! * wgt; b += data[o + 2]! * wgt
                    wsum += wgt
                }
            }
            row.push(wsum > 0
                ? [Math.round(r / wsum), Math.round(g / wsum), Math.round(b / wsum)]
                : labels[win]!)
        }
        out.push(row)
    }
    return out
}

/**
 * Palette-capped variant for callers with a fixed target size and color
 * budget (/convert, the AI generator). The source must be pre-flattened
 * (no alpha) — any transparent cell falls back to white.
 */
export function reconstructPixels(
    src: ImageData, outW: number, outH: number, k: number,
): { palette: RGB[]; indexed: number[][] } {
    const cells = reconstructCells(src, outW, outH)
    const flat: RGB[] = []
    for (const row of cells) for (const p of row) flat.push(p ?? [255, 255, 255])
    const palette = medianCut(flat, k)
    const indexed = cells.map(row => row.map(p => nearest(p ?? [255, 255, 255], palette)))
    return {palette, indexed}
}

// ── One-stop import pipeline ────────────────────────────────────────

// A JPG/opaque-PNG sprite usually sits on a solid ground. If one color owns
// most of the border, knock it out to real transparency (images that already
// carry meaningful alpha are left alone).
function knockoutUniformBg(img: ImageData) {
    const {width: w, height: h, data} = img
    let transparent = 0
    for (let i = 3; i < data.length; i += 4) if (data[i]! < ALPHA_ON) transparent++
    if (transparent > w * h * 0.02) return   // has real alpha already

    const border: RGB[] = []
    for (let x = 0; x < w; x++) {
        const t = x * 4, b = ((h - 1) * w + x) * 4
        border.push([data[t]!, data[t + 1]!, data[t + 2]!], [data[b]!, data[b + 1]!, data[b + 2]!])
    }
    for (let y = 0; y < h; y++) {
        const l = (y * w) * 4, r = (y * w + w - 1) * 4
        border.push([data[l]!, data[l + 1]!, data[l + 2]!], [data[r]!, data[r + 1]!, data[r + 2]!])
    }
    const [bg] = medianCut(border, 1)
    let near = 0
    for (const p of border) {
        const d = (p[0] - bg![0]) ** 2 + (p[1] - bg![1]) ** 2 + (p[2] - bg![2]) ** 2
        if (d <= EDGE_TOL) near++
    }
    if (near < border.length * 0.85) return   // border isn't one solid color
    for (let i = 0; i < w * h; i++) {
        const o = i * 4
        const d = (data[o]! - bg![0]) ** 2 + (data[o + 1]! - bg![1]) ** 2 + (data[o + 2]! - bg![2]) ** 2
        if (d <= EDGE_TOL) data[o + 3] = 0
    }
}

// Detection is O(f² · pixels) — run it on the densest ≤256² window instead of
// a big source. The phase found in the window translates back via its origin.
function detectOnWindow(img: ImageData): { f: number; ox: number; oy: number } {
    const {width: w, height: h, data} = img
    const WIN = 256
    if (w <= WIN + 64 && h <= WIN + 64) return detectPixelScale(data, w, h)
    const spots = [
        [(w - WIN) >> 1, (h - WIN) >> 1],
        [0, 0], [w - WIN, 0], [0, h - WIN], [w - WIN, h - WIN],
    ] as const
    let bestSpot = spots[0], bestEdges = -1
    for (const [sx, sy] of spots) {
        const win = cropImageData(img, sx, sy, WIN, WIN)
        const e = edgeCount(win.data, WIN, WIN)
        if (e > bestEdges) { bestEdges = e; bestSpot = [sx, sy] }
    }
    const [sx, sy] = bestSpot
    const win = cropImageData(img, sx, sy, WIN, WIN)
    const det = detectPixelScale(win.data, WIN, WIN)
    if (det.f <= 1) return det
    return {f: det.f, ox: (sx + det.ox) % det.f, oy: (sy + det.oy) % det.f}
}

function cropImageData(img: ImageData, x: number, y: number, w: number, h: number) {
    const out = new Uint8ClampedArray(w * h * 4)
    for (let row = 0; row < h; row++) {
        out.set(img.data.subarray(((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4), row * w * 4)
    }
    return {data: out, w, h}
}

// Distinct opaque colors, early-exiting past `cap` — separates hand-made
// pixel art (dozens of colors) from photos/paintings (thousands).
function distinctColors(img: ImageData, cap: number): number {
    const {data} = img
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < ALPHA_ON) continue
        seen.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!)
        if (seen.size > cap) return seen.size
    }
    return seen.size
}

function trimTransparentBorder(cells: Cell[][]): Cell[][] {
    let top = 0, bottom = cells.length - 1
    const isEmptyRow = (r: Cell[]) => r.every(c => c === null)
    while (top < bottom && isEmptyRow(cells[top]!)) top++
    while (bottom > top && isEmptyRow(cells[bottom]!)) bottom--
    let left = 0, right = cells[0]!.length - 1
    const isEmptyCol = (x: number) => cells.every(r => r[x] === null)
    while (left < right && isEmptyCol(left)) left++
    while (right > left && isEmptyCol(right)) right--
    return cells.slice(top, bottom + 1).map(r => r.slice(left, right + 1))
}

/**
 * Any image → a null-transparent RGB cell grid at its NATIVE pixel size:
 * load, knock out a solid background, detect the upscale factor + grid phase,
 * two-stage reconstruct one cell per art pixel, trim empty margins.
 * Falls back to a ≤maxOut resample when the image isn't grid art (photos).
 */
export async function imageToCells(
    dataUrl: string,
    opts?: { maxOut?: number; knockoutBg?: boolean },
): Promise<{ cells: Cell[][]; scale: number } | null> {
    const maxOut = opts?.maxOut ?? 256
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
    let img: HTMLImageElement
    try {
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image()
            i.onload = () => resolve(i)
            i.onerror = reject
            i.src = dataUrl
        })
    } catch { return null }
    if (!img.naturalWidth || !img.naturalHeight) return null

    // Halve oversized sources (2ⁿ keeps an upscale grid a grid).
    let dw = img.naturalWidth, dh = img.naturalHeight
    while (Math.max(dw, dh) > 1024) { dw = Math.round(dw / 2); dh = Math.round(dh / 2) }
    const cv = document.createElement('canvas')
    cv.width = dw; cv.height = dh
    const ctx = cv.getContext('2d', {willReadFrequently: true})!
    ctx.imageSmoothingEnabled = dw !== img.naturalWidth
    ctx.drawImage(img, 0, 0, dw, dh)
    const src = ctx.getImageData(0, 0, dw, dh)

    if (opts?.knockoutBg !== false) knockoutUniformBg(src)

    const det = detectOnWindow(src)
    const cols = Math.floor((dw - det.ox) / det.f)
    const rows = Math.floor((dh - det.oy) / det.f)

    let cells: Cell[][]
    let scale = det.f
    if (det.f > 1 && cols >= 1 && rows >= 1 && cols <= maxOut && rows <= maxOut) {
        cells = reconstructCells(src, cols, rows, {x0: det.ox, y0: det.oy, cellW: det.f, cellH: det.f})
    } else if (dw <= maxOut && dh <= maxOut && distinctColors(src, 1024) <= 1024) {
        // Already native-size pixel art (limited palette) — read cells 1:1.
        cells = reconstructCells(src, dw, dh, {cellW: 1, cellH: 1})
        scale = 1
    } else {
        // Not grid art (photo/painting) — resample to a workable size.
        const fit = Math.min(128 / dw, 128 / dh, 1)
        const ow = Math.max(1, Math.round(dw * fit)), oh = Math.max(1, Math.round(dh * fit))
        cells = reconstructCells(src, ow, oh)
        scale = 1
    }
    cells = trimTransparentBorder(cells)
    return cells.length && cells[0]!.length ? {cells, scale} : null
}

// ── AI-generated art → grid ─────────────────────────────────────────
// Text-to-image models don't draw the N×N bitmap you asked for. Measured over
// 21 Gemini generations (simplepixelart/test_gemini/report.md):
//   · they never return real alpha, even when the prompt demands it (0 of 21),
//   · they put the subject on a flat ground whose hue may also appear inside
//     the subject (an orange ground next to a gold shield),
//   · they sometimes frame the whole image in a solid band,
//   · their "pixels" are 8–20 screen px wide, with a blended halo at every
//     colour boundary.
// So the ground is removed geometrically — flood filled from the border, which
// can never punch a hole inside the subject — and only then is the art
// resampled. The old path (smooth contain-fit → median cut → drop the
// corner-majority colour) left the ground in the art in 12 of 21 cases.

/** Peel the flat ground (and any frame around it) to real transparency. */
function peelGround(img: ImageData): RGB | null {
    const {width: W, height: H, data: D} = img
    const total = W * H
    const at = (x: number, y: number) => (y * W + x) * 4
    const TOL = 46          // one flat colour, plus a shade of resampling drift
    let ground: RGB | null = null

    const opaqueCount = () => {
        let k = 0
        for (let i = 3; i < D.length; i += 4) if (D[i]! >= ALPHA_ON) k++
        return k
    }

    // The ring is sampled 2px INSIDE the opaque boundary: right after a peel the
    // outermost pixels are the blend between the band just removed and whatever
    // is under it, and that mixture hides the flat colour behind it.
    const ringColors = (): RGB[] | null => {
        const hist = new Map<string, { n: number; c: RGB }>()
        let sampled = 0
        const walk = (xs: number, ys: number, dx: number, dy: number) => {
            let x = xs, y = ys, hits = 0
            while (x >= 0 && y >= 0 && x < W && y < H) {
                const o = at(x, y)
                if (D[o + 3]! >= ALPHA_ON) {
                    hits++
                    if (hits > 2) {
                        const c: RGB = [D[o]!, D[o + 1]!, D[o + 2]!]
                        const k = `${c[0] >> 3},${c[1] >> 3},${c[2] >> 3}`
                        const e = hist.get(k) || {n: 0, c}
                        e.n++
                        hist.set(k, e)
                        sampled++
                        return
                    }
                }
                x += dx
                y += dy
            }
        }
        for (let x = 0; x < W; x += 2) { walk(x, 0, 0, 1); walk(x, H - 1, 0, -1) }
        for (let y = 0; y < H; y += 2) { walk(0, y, 1, 0); walk(W - 1, y, -1, 0) }
        if (!sampled) return null
        const ranked = [...hist.values()].sort((a, b) => b.n - a.n)
        const first = ranked[0]!
        // A flat ground owns almost the whole ring; a sprite outline never does.
        // Without this gate, the round after the ground is gone samples the
        // sprite itself and floods it away.
        if (first.n / sampled >= 0.7) return [first.c]
        // Two-colour grounds happen: asked for transparency the model paints a
        // grey/white checkerboard, and "pixel grid" wording makes it rule lines
        // over the ground. Take both only when together they own the ring.
        const second = ranked[1]
        if (second && (first.n + second.n) / sampled >= 0.85) return [first.c, second.c]
        return null
    }

    const flood = (bgs: RGB[]) => {
        const dist = (o: number) => Math.min(...bgs.map(bg => Math.sqrt(
            (D[o]! - bg[0]) ** 2 + (D[o + 1]! - bg[1]) ** 2 + (D[o + 2]! - bg[2]) ** 2)))
        const seen = new Uint8Array(total)
        const stack: number[] = []
        for (let x = 0; x < W; x++) stack.push(x, 0, x, H - 1)
        for (let y = 0; y < H; y++) stack.push(0, y, W - 1, y)
        let removed = 0
        while (stack.length) {
            const y = stack.pop()!, x = stack.pop()!
            if (x < 0 || y < 0 || x >= W || y >= H) continue
            const i = y * W + x
            if (seen[i]) continue
            seen[i] = 1
            const o = i * 4
            if (D[o + 3]! < ALPHA_ON) {           // already gone — keep spreading
                stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
                continue
            }
            if (dist(o) > TOL) continue
            D[o + 3] = 0
            removed++
            stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
        }
        return removed
    }

    // A peeled band leaves a 1-2px blend ring standing, which SEALS the region
    // behind it from the border — the next flood would remove nothing.
    const erodeHalo = (rounds: number) => {
        for (let r = 0; r < rounds; r++) {
            const drop: number[] = []
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const o = at(x, y)
                if (D[o + 3]! < ALPHA_ON) continue
                let bgN = 0
                if (x === 0 || D[at(x - 1, y) + 3]! < ALPHA_ON) bgN++
                if (y === 0 || D[at(x, y - 1) + 3]! < ALPHA_ON) bgN++
                if (x === W - 1 || D[at(x + 1, y) + 3]! < ALPHA_ON) bgN++
                if (y === H - 1 || D[at(x, y + 1) + 3]! < ALPHA_ON) bgN++
                if (bgN >= 2) drop.push(o)
            }
            if (!drop.length) return
            for (const o of drop) D[o + 3] = 0
        }
    }

    for (let round = 0; round < 3; round++) {
        const bgs = ringColors()
        if (!bgs) break                           // ring isn't a flat ground
        const before = opaqueCount()
        const removed = flood(bgs)
        if (!removed) break
        if (!ground) ground = bgs[0]!             // first band = what to paint back
        else if (removed > total * 0.15) ground = bgs[0]!   // the real ground, not a frame
        erodeHalo(2)
        const after = opaqueCount()
        if (after / total < 0.10) break           // safety: never eat the sprite
        if (before - after < total * 0.002) break
    }
    // Final de-speckle: a pixel with ground on all four sides is a blend leftover.
    const drop: number[] = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const o = at(x, y)
        if (D[o + 3]! < ALPHA_ON) continue
        let bgN = 0
        if (x === 0 || D[at(x - 1, y) + 3]! < ALPHA_ON) bgN++
        if (y === 0 || D[at(x, y - 1) + 3]! < ALPHA_ON) bgN++
        if (x === W - 1 || D[at(x + 1, y) + 3]! < ALPHA_ON) bgN++
        if (y === H - 1 || D[at(x, y + 1) + 3]! < ALPHA_ON) bgN++
        if (bgN === 4) drop.push(o)
    }
    for (const o of drop) D[o + 3] = 0
    return ground
}

/**
 * A text-to-image PNG → an indexed N×N grid ready for the editor.
 *
 * Index 0 is the background: transparent in the art, and `palette[0]` carries
 * the ground colour the model drew, so a caller can paint it back instead.
 * Returns null when the image can't be read.
 *
 * `removeGround: false` keeps the model's ground as art (the escape hatch when
 * the peel misjudges a subject), and `fillGrid: false` keeps the model's own
 * framing instead of cropping to the subject — both are re-runs of a picture
 * already paid for, so the caller can offer them as free adjustments.
 */
export async function aiImageToGrid(
    dataUrl: string, n: number, maxColors: number,
    opts?: { removeGround?: boolean; fillGrid?: boolean },
): Promise<{ palette: RGB[]; indexed: number[][] } | null> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null
    let img: HTMLImageElement
    try {
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image()
            i.onload = () => resolve(i)
            i.onerror = reject
            i.src = dataUrl
        })
    } catch { return null }
    if (!img.naturalWidth || !img.naturalHeight) return null

    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const ctx = cv.getContext('2d', {willReadFrequently: true})
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const src = ctx.getImageData(0, 0, cv.width, cv.height)
    const ground = opts?.removeGround === false ? null : peelGround(src)
    const {width: W, height: H, data: D} = src
    const at = (x: number, y: number) => (y * W + x) * 4

    // Crop to the subject, then contain-fit it into the grid with a 1px margin:
    // the model leaves a wide margin of its own, and a sprite that fills the
    // canvas is the whole point at 32².
    let x0 = W, y0 = H, x1 = -1, y1 = -1
    if (opts?.fillGrid === false) {
        x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1                // keep the model's framing
    } else {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (D[at(x, y) + 3]! >= ALPHA_ON) {
                if (x < x0) x0 = x
                if (x > x1) x1 = x
                if (y < y0) y0 = y
                if (y > y1) y1 = y
            }
        }
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1 }   // nothing survived
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1
    // A cropped subject gets a 1px breathing margin; the model's own framing
    // already has margins of its own, so it uses the full grid.
    const inner = opts?.fillGrid === false ? n : Math.max(1, n - 2)
    const f = Math.min(inner / cw, inner / ch)
    const tw = Math.max(1, Math.min(n, Math.round(cw * f)))
    const th = Math.max(1, Math.min(n, Math.round(ch * f)))
    const ox = Math.floor((n - tw) / 2), oy = Math.floor((n - th) / 2)

    const grid: Cell[][] = Array.from({length: n}, () => Array<Cell>(n).fill(null))
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const sx0 = x0 + Math.floor(x * cw / tw)
        const sx1 = x0 + Math.max(Math.floor((x + 1) * cw / tw), Math.floor(x * cw / tw) + 1)
        const sy0 = y0 + Math.floor(y * ch / th)
        const sy1 = y0 + Math.max(Math.floor((y + 1) * ch / th), Math.floor(y * ch / th) + 1)
        // Majority colour of the source block, averaged within its bucket — the
        // model's "one flat colour" still drifts by a shade or two.
        const hist = new Map<string, { n: number; sum: [number, number, number] }>()
        let opaque = 0, count = 0
        for (let sy = sy0; sy < sy1 && sy < H; sy++) for (let sx = sx0; sx < sx1 && sx < W; sx++) {
            count++
            const o = at(sx, sy)
            if (D[o + 3]! < ALPHA_ON) continue
            opaque++
            const k = `${D[o]! >> 3},${D[o + 1]! >> 3},${D[o + 2]! >> 3}`
            const e = hist.get(k) || {n: 0, sum: [0, 0, 0] as [number, number, number]}
            e.n++
            e.sum[0] += D[o]!
            e.sum[1] += D[o + 1]!
            e.sum[2] += D[o + 2]!
            hist.set(k, e)
        }
        if (!opaque || opaque * 3 < count) continue      // mostly ground → stay empty
        let best: { n: number; sum: [number, number, number] } | null = null
        hist.forEach(e => { if (!best || e.n > best.n) best = e })
        if (!best) continue
        grid[oy + y]![ox + x] = [
            Math.round(best.sum[0] / best.n),
            Math.round(best.sum[1] / best.n),
            Math.round(best.sum[2] / best.n),
        ]
    }

    // Palette by area, not by median cut: the source is already flat, so keeping
    // the model's own colours avoids inventing in-between tones. A long tail of
    // one-off blend colours is what makes a converted sprite look speckled.
    const freq = new Map<string, { n: number; c: RGB }>()
    for (const row of grid) for (const c of row) {
        if (!c) continue
        const k = `${c[0] >> 3},${c[1] >> 3},${c[2] >> 3}`
        const e = freq.get(k) || {n: 0, c}
        e.n++
        freq.set(k, e)
    }
    const ranked = [...freq.values()].sort((a, b) => b.n - a.n)
    const painted = ranked.reduce((a, e) => a + e.n, 0) || 1
    const keep = ranked
        .filter((e, i) => i < maxColors && (i < 6 || e.n / painted >= 0.01))
        .map(e => e.c)
    if (!keep.length) keep.push([0, 0, 0])
    const nearest = (c: RGB) => {
        let bi = 0, bd = Infinity
        for (let i = 0; i < keep.length; i++) {
            const k = keep[i]!
            const d = (c[0] - k[0]) ** 2 + (c[1] - k[1]) ** 2 + (c[2] - k[2]) ** 2
            if (d < bd) { bd = d; bi = i }
        }
        return bi
    }
    return {
        // Slot 0 = the background: transparent in the art, but the ground colour
        // is kept so "Transparent background: off" can paint it back.
        palette: [ground ?? [255, 255, 255], ...keep],
        indexed: grid.map(row => row.map(c => (c ? nearest(c) + 1 : 0))),
    }
}
