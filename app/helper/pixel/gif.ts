/**
 * An animated GIF read back to pixel-art frames.
 *
 * Every frame goes through the same scale and phase, found once on the first
 * frame, and the same crop, found over all of them: run the single-image
 * import on each frame instead and each would be trimmed to its own content,
 * so a sprite that bobs would stop bobbing and one that walks would jitter.
 *
 * Decoding uses the browser's ImageDecoder. Where it is missing, null comes
 * back and the caller treats the file as one still image.
 */
import {detectPixelScale, modeDownscale, shiftCrop} from './reconstruct'

const ALPHA_ON = 16
const MAX_FRAMES = 64

export interface GifCells {
  width: number
  height: number
  frames: ([number, number, number] | null)[][][]
  durations: number[]
}

export async function gifToFrames(file: File): Promise<GifCells | null> {
  const Decoder = (globalThis as any).ImageDecoder
  if (!Decoder || !/gif$/i.test(file.type)) return null
  let decoder: any
  try {
    decoder = new Decoder({data: await file.arrayBuffer(), type: file.type})
    await decoder.tracks.ready
    const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack?.frameCount || 0)
    if (count < 2) return null

    const raw: { data: Uint8ClampedArray; w: number; h: number; ms: number }[] = []
    for (let i = 0; i < count; i++) {
      const {image} = await decoder.decode({frameIndex: i})
      const w = image.displayWidth, h = image.displayHeight
      const cv = new OffscreenCanvas(w, h)
      const ctx = cv.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      raw.push({data: ctx.getImageData(0, 0, w, h).data, w, h, ms: Math.round((image.duration || 100000) / 1000)})
      image.close()
    }

    const first = raw[0]!
    const {f, ox, oy} = detectPixelScale(first.data, first.w, first.h)
    const small = raw.map(r => {
      const s = f > 1 ? shiftCrop(r.data, r.w, r.h, ox, oy) : r
      return f > 1 ? modeDownscale(s.data, s.w, s.h, f) : {data: r.data, w: r.w, h: r.h}
    })

    // One box around everything any frame draws.
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
    for (const s of small) {
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
        if (s.data[(y * s.w + x) * 4 + 3]! < ALPHA_ON) continue
        if (x < x0) x0 = x
        if (y < y0) y0 = y
        if (x > x1) x1 = x
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) return null

    const frames = small.map(s => {
      const rows: ([number, number, number] | null)[][] = []
      for (let y = y0; y <= y1; y++) {
        const row: ([number, number, number] | null)[] = []
        for (let x = x0; x <= x1; x++) {
          const i = (y * s.w + x) * 4
          row.push(s.data[i + 3]! < ALPHA_ON ? null : [s.data[i]!, s.data[i + 1]!, s.data[i + 2]!])
        }
        rows.push(row)
      }
      return rows
    })
    return {width: x1 - x0 + 1, height: y1 - y0 + 1, frames, durations: raw.map(r => Math.max(20, r.ms))}
  } catch {
    return null
  } finally {
    decoder?.close?.()
  }
}
