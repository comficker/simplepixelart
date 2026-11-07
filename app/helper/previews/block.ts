// A square texture shown as a block: the same picture on all six faces of a
// cube, turning (see box3d).
import {boxFaces, drawFaces} from './box3d'

export interface BlockView {
  yaw: number
  pitch: number
  shade: boolean
  bg?: string
}

export function drawBlock(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, w: number, h: number,
                          view: BlockView, stamp = 0) {
  const n = src.width
  const r: [number, number, number, number] = [0, 0, n, src.height]
  const faces = boxFaces(-0.5, -0.5, -0.5, 1, 1, 1, {top: r, bottom: r, right: r, front: r, left: r, back: r})
  drawFaces(ctx, src, w, h, faces, {
    ...view,
    // The cube's widest outline (a corner-on diagonal) still fits.
    scale: Math.min(w, h) / 2.1,
    center: [0, 0, 0],
  }, stamp)
}
