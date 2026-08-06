// Sprite-strip import: slice a spritesheet PNG (frames laid out on a grid)
// into per-frame RGB grids for the editor's animation model.

// One frame: rows of pixels; null = transparent.
export type FrameGrid = (number[] | null)[][]

// Guess the frame layout of a sheet.
// 1. GameMaker naming convention: "..._strip<N>.png" → N frames in a row.
// 2. Even multiple of a square: 96×24 → 4 frames of 24×24 (and the vertical twin).
// 3. Give up → single frame (user adjusts cols/rows in the dialog).
export function detectStripLayout(width: number, height: number, filename = ''): { cols: number; rows: number } {
    const m = /_strip(\d+)/i.exec(filename)
    if (m) {
        const n = parseInt(m[1]!, 10)
        if (n > 1 && n <= 256 && width % n === 0) return {cols: n, rows: 1}
    }
    if (height > 0 && width > height && width % height === 0) {
        const n = width / height
        if (n <= 64) return {cols: n, rows: 1}
    }
    if (width > 0 && height > width && height % width === 0) {
        const n = height / width
        if (n <= 64) return {cols: 1, rows: n}
    }
    return {cols: 1, rows: 1}
}

// Cut the image into cols×rows frames, reading pixels 1:1 (sprite strips are
// true pixel art — no resampling). Alpha < 128 → transparent. Trailing frames
// that are fully empty (unused sheet cells) are dropped.
export function sliceStrip(img: HTMLImageElement, cols: number, rows: number): FrameGrid[] {
    const fw = Math.floor(img.naturalWidth / cols)
    const fh = Math.floor(img.naturalHeight / rows)
    if (fw < 1 || fh < 1) return []

    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth
    cv.height = img.naturalHeight
    const ctx = cv.getContext('2d', {willReadFrequently: true})
    if (!ctx) return []
    ctx.drawImage(img, 0, 0)

    const frames: { grid: FrameGrid; empty: boolean }[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const data = ctx.getImageData(c * fw, r * fh, fw, fh).data
            const grid: FrameGrid = []
            let empty = true
            for (let y = 0; y < fh; y++) {
                const row: (number[] | null)[] = []
                for (let x = 0; x < fw; x++) {
                    const i = (y * fw + x) * 4
                    if ((data[i + 3] ?? 0) < 128) {
                        row.push(null)
                    } else {
                        row.push([data[i]!, data[i + 1]!, data[i + 2]!])
                        empty = false
                    }
                }
                grid.push(row)
            }
            frames.push({grid, empty})
        }
    }
    while (frames.length > 1 && frames[frames.length - 1]!.empty) frames.pop()
    return frames.map(f => f.grid)
}
