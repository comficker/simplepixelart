/**
 * Fitting an AI render onto the board it is editing.
 *
 * The model returns a smooth ~1024px picture; aiImageToGrid turns that into a
 * true pixel grid. What lives here is the step after that — deciding where on
 * the board those pixels land and in which exact colours. It used to centre
 * the sprite on the board and keep whatever palette the render quantised to,
 * which is right for brand-new art but wrong for an EDIT: the sprite came
 * back a few pixels off its old position, slightly rescaled, in colours a few
 * units away from the board's own. One redraw looked "close enough"; a stack
 * of animation frames jittered.
 *
 * So fitRedrawToBoard takes the art being edited and holds the result to it:
 * scale matched to the art's own bounding box, palette snapped to the board's
 * entries, position chosen by sliding the sprite a few pixels around the
 * art's spot and keeping the offset that agrees with it most.
 */
import {aiImageToGrid} from './reconstruct'
import {hexToRgb, rgbToHex} from '~/helper/color'

type RGB = [number, number, number]
type Recon = { palette: RGB[]; indexed: number[][] }

export interface FitGrid {
    colors: string[]
    pixels: Record<string, number>
    w: number
    h: number
}

export interface BaseArt {
    colors: string[]
    pixels: Record<string, number>
}

/** Bounding box of the cells that actually got a colour. */
export function paintedBox(indexed: number[][]) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    for (let y = 0; y < indexed.length; y++) {
        const row = indexed[y]!
        for (let x = 0; x < row.length; x++) {
            if (!row[x]) continue
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
        }
    }
    if (x1 < 0) return null
    return {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}
}

/** Same box for board pixels stored as a key map. */
function pixelBox(pixels: Record<string, number>) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    for (const key of Object.keys(pixels)) {
        const sep = key.indexOf('_')
        const x = +key.slice(0, sep), y = +key.slice(sep + 1)
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
    }
    if (x1 < 0) return null
    return {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}
}

/** Second pass at the flat ground the prompt asked the model for.
 *
 * peelGround floods in from the border and gives up when the border ring is
 * not one colour, which a render with any noise in its background is not — the
 * board then arrives with a slab of beige behind the sprite.
 *
 * The four corners of the drawn area are the most reliable sample of that
 * background: a sprite reaches the edge of its frame often, all four corners
 * rarely. Agreeing corners identify the colour; the generator prompt then
 * guarantees it "appears NOWHERE inside" the subject, so every cell of it can
 * go — enclosed ones included, like the inside of a coil or the gap under a
 * raised arm, which a flood from outside can never reach. */
function dropFlatGround(indexed: number[][], palette: RGB[]) {
    const box = paintedBox(indexed)
    if (!box || box.w < 4 || box.h < 4) return indexed
    const corners: RGB[] = []
    const {x, y, w, h} = box
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
        const c = palette[indexed[cy!]?.[cx!] ?? 0]
        if (indexed[cy!]?.[cx!] && c) corners.push(c)
    }
    if (corners.length < 3) return indexed

    const TOL = 24
    const agrees = (a: RGB, b: RGB) =>
        (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < TOL ** 2
    const ground = corners.find(c => corners.filter(o => agrees(c, o)).length >= 3)
    if (!ground) return indexed

    const drop = new Set<number>()
    for (let i = 1; i < palette.length; i++) {
        const c = palette[i]
        if (c && agrees(c, ground)) drop.add(i)
    }
    if (!drop.size) return indexed
    return indexed.map(row => row.map(i => (drop.has(i) ? 0 : i)))
}

async function reconstructAt(dataUrl: string, n: number | 'auto'): Promise<Recon | null> {
    const q = await aiImageToGrid(dataUrl, n, 64, {removeGround: true, fillGrid: true})
    if (!q) return null
    q.indexed = dropFlatGround(q.indexed, q.palette)
    return q
}

/** Lift the drawn area out of a reconstruction and centre it on a W×H board. */
function cutGrid(
    q: Recon,
    box: { x: number; y: number; w: number; h: number },
    W: number, H: number,
) {
    // Clip only if the drawing still overflows the board.
    const cw = Math.min(box.w, W), ch = Math.min(box.h, H)
    const srcX = box.x + Math.floor((box.w - cw) / 2)
    const srcY = box.y + Math.floor((box.h - ch) / 2)
    const dstX = Math.floor((W - cw) / 2), dstY = Math.floor((H - ch) / 2)

    const pixels: Record<string, number> = {}
    const remap = new Map<number, number>()
    const colors: string[] = []
    for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
            // Index 0 is the peeled background: leave those cells empty so the
            // sprite arrives with transparency, not a slab of colour behind it.
            const idx = q.indexed[srcY + y]?.[srcX + x] ?? 0
            if (!idx) continue
            let mapped = remap.get(idx)
            if (mapped === undefined) {
                const c = q.palette[idx]!
                mapped = colors.length
                colors.push(rgbToHex(c[0], c[1], c[2]).toUpperCase())
                remap.set(idx, mapped)
            }
            pixels[`${dstX + x}_${dstY + y}`] = mapped
        }
    }
    if (!colors.length) return null
    return {colors, pixels, w: W, h: H}
}

/** Pull each render colour onto the board colour it clearly means.
 *
 * The model repaints "the same red" a few units off every time; left alone,
 * apply merges that near-red into the palette as a new entry and an animation
 * gets one almost-red per frame. A render colour close to a board colour IS
 * that colour; one far from all of them is the new paint the user asked for
 * and stays as drawn. */
function snapPalette(palette: RGB[], boardColors: string[]) {
    const board = boardColors
        .map(hexToRgb)
        .filter((c): c is RGB => c.every(Number.isFinite))
    if (!board.length) return
    const TOL2 = 28 ** 2
    for (let i = 1; i < palette.length; i++) {
        const c = palette[i]
        if (!c) continue
        let best: RGB | null = null, bd = Infinity
        for (const b of board) {
            const d = (c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2 + (c[2] - b[2]) ** 2
            if (d < bd) { bd = d; best = b }
        }
        if (best && bd <= TOL2) palette[i] = best
    }
}

/** Place the sprite against the art it edits, not against the board.
 *
 * Start from the base art's bounding-box centre, then slide up to ±3 pixels
 * and keep the offset that agrees with the existing art most: same colour in
 * the same cell counts double, any paint over paint counts once, paint over
 * empty counts against, and a cell pushed off the board costs most of all —
 * that is art lost, not art moved. */
function alignToBase(
    q: Recon,
    box: { x: number; y: number; w: number; h: number },
    W: number, H: number,
    base: BaseArt,
    baseBox: { x: number; y: number; w: number; h: number },
): FitGrid | null {
    const palHex = q.palette.map(c => (c ? rgbToHex(c[0], c[1], c[2]).toUpperCase() : ''))
    const baseHex = new Map<string, string>()
    for (const key of Object.keys(base.pixels)) {
        const hex = base.colors[base.pixels[key]!]
        if (hex) baseHex.set(key, hex.toUpperCase())
    }

    const idealX = Math.round(baseBox.x + (baseBox.w - box.w) / 2)
    const idealY = Math.round(baseBox.y + (baseBox.h - box.h) / 2)
    let bestX = idealX, bestY = idealY, bestScore = -Infinity
    for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
            const ox = idealX + dx, oy = idealY + dy
            let score = 0
            for (let y = 0; y < box.h; y++) {
                const row = q.indexed[box.y + y]
                if (!row) continue
                for (let x = 0; x < box.w; x++) {
                    const idx = row[box.x + x]
                    if (!idx) continue
                    const bx = ox + x, by = oy + y
                    if (bx < 0 || bx >= W || by < 0 || by >= H) { score -= 3; continue }
                    const b = baseHex.get(`${bx}_${by}`)
                    if (b === palHex[idx]) score += 2
                    else if (b) score += 1
                    else score -= 1
                }
            }
            if (score > bestScore) { bestScore = score; bestX = ox; bestY = oy }
        }
    }

    const pixels: Record<string, number> = {}
    const remap = new Map<number, number>()
    const colors: string[] = []
    for (let y = 0; y < box.h; y++) {
        const row = q.indexed[box.y + y]
        if (!row) continue
        for (let x = 0; x < box.w; x++) {
            const idx = row[box.x + x]
            if (!idx) continue
            const bx = bestX + x, by = bestY + y
            if (bx < 0 || bx >= W || by < 0 || by >= H) continue
            let mapped = remap.get(idx)
            if (mapped === undefined) {
                mapped = colors.length
                colors.push(palHex[idx]!)
                remap.set(idx, mapped)
            }
            pixels[`${bx}_${by}`] = mapped
        }
    }
    if (!colors.length) return null
    return {colors, pixels, w: W, h: H}
}

/** Turn the model's picture into the grid a W×H board will receive.
 *
 * Drawing the 1024px render into a W×H canvas with smoothing off keeps one
 * source pixel per ~64×64 block and discards the rest — so this goes through
 * aiImageToGrid, the same reconstruction the image importer uses: a colour
 * histogram per destination cell picks the dominant colour, the flat
 * background is peeled off, and the subject is cropped.
 *
 * With `base` — the art this render is an edit of — the result is held to
 * that art: rescaled to its bounding box, snapped to its palette, and placed
 * at its position (see the helpers above). Without it, the subject is fit to
 * the board and centred, as a fresh drawing should be. */
export async function fitRedrawToBoard(
    dataUrl: string, W: number, H: number, base?: BaseArt | null,
): Promise<FitGrid | null> {
    const side = Math.max(W, H)
    let q = await reconstructAt(dataUrl, side)
    let box = q && paintedBox(q.indexed)
    if (!q || !box) return null

    const baseBox = base ? pixelBox(base.pixels) : null
    if (baseBox) {
        // An edit lands at the size of the art it edits. The reconstruction
        // fits the subject into (side − 2) cells, so re-run it at the N that
        // makes the subject come out at the base art's own span.
        const target = Math.max(baseBox.w, baseBox.h)
        const got = Math.max(box.w, box.h)
        if (Math.abs(got - target) >= 2) {
            const n = Math.max(8, Math.min(128, Math.round((side - 2) * target / got) + 2))
            if (n !== side) {
                const retry = await reconstructAt(dataUrl, n)
                const rbox = retry && paintedBox(retry.indexed)
                if (retry && rbox
                    && Math.abs(Math.max(rbox.w, rbox.h) - target) < Math.abs(got - target)) {
                    q = retry
                    box = rbox
                }
            }
        }
        snapPalette(q.palette, base!.colors)
        return alignToBase(q, box, W, H, base!, baseBox)
    }

    // No art to hold it to: fit the subject to the square and centre it. On a
    // tall or wide board it can come back too big — reconstruct one size down
    // rather than cropping the sprite's arms off.
    if (box.w > W || box.h > H) {
        const smaller = Math.max(8, Math.floor(side * Math.min(W / box.w, H / box.h)))
        if (smaller < side) {
            const retry = await reconstructAt(dataUrl, smaller)
            const retryBox = retry && paintedBox(retry.indexed)
            if (retry && retryBox) { q = retry; box = retryBox }
        }
    }
    return cutGrid(q, box, W, H)
}

/** The model's own grid, at the size it actually drew.
 *
 * The board-fit version has to answer "what fits in 32x32". This one asks the
 * reconstruction to detect the render's own pixel pitch instead, so a sprite
 * the model drew at 48 across stays 48 across on a board of its own. */
export async function imageToNativeGrid(dataUrl: string): Promise<FitGrid | null> {
    const q = await reconstructAt(dataUrl, 'auto')
    if (!q) return null
    const box = paintedBox(q.indexed)
    if (!box) return null
    // The board is the art's own extent — no margin, nothing to centre in.
    return cutGrid(q, box, box.w, box.h)
}
