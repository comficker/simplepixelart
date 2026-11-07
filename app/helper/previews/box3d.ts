// Textured boxes with plain Canvas 2D. An orthographic camera turns every box
// face into a parallelogram, which one affine transform maps the texture onto
// exactly -- no 3D library. Used by the skin and block previews.

export type V3 = [number, number, number]
export type Kind = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'

export interface Face {
  sx: number, sy: number, sw: number, sh: number // texture rect
  p0: V3, pu: V3, pv: V3                         // texture top-left, top-right, bottom-left
  outer: boolean                                 // drawn after inner faces at equal depth
  kind: Kind
  tag?: string                                   // free for the caller, e.g. which limb
}

/** Faces of the box x0..x0+w, y0..y0+h (up), z0..z0+d (front is +z). `uv`
 *  gives each side's texture rect. */
export function boxFaces(x0: number, y0: number, z0: number, w: number, h: number, d: number,
                         uv: Record<Kind, [number, number, number, number]>,
                         grow = 0, outer = false, tag?: string): Face[] {
  const a = x0 - grow, b = x0 + w + grow
  const c = y0 - grow, e = y0 + h + grow
  const f = z0 - grow, g = z0 + d + grow
  const t = (kind: Kind, p0: V3, pu: V3, pv: V3): Face => {
    const [sx, sy, sw, sh] = uv[kind]
    return {sx, sy, sw, sh, p0, pu, pv, outer, kind, tag}
  }
  return [
    t('front', [a, e, g], [b, e, g], [a, c, g]),
    t('back', [b, e, f], [a, e, f], [b, c, f]),
    t('right', [a, e, f], [a, e, g], [a, c, f]),
    t('left', [b, e, g], [b, e, f], [b, c, g]),
    t('top', [a, e, f], [b, e, f], [a, e, g]),
    t('bottom', [a, c, g], [b, c, g], [a, c, f]),
  ]
}

// Shaded copies of the texture: same pixels darkened, so transparent pixels
// stay transparent (a fill over the face would paint them too).
export const SHADE: Record<Kind, number> = {top: 0, front: 0.04, left: 0.16, right: 0.16, back: 0.24, bottom: 0.34}
let shadeSrc: CanvasImageSource | null = null
let shadeStamp = -1
const shadeCache = new Map<number, HTMLCanvasElement>()
function shaded(src: CanvasImageSource, a: number, stamp: number): CanvasImageSource {
  if (!a) return src
  if (src !== shadeSrc || stamp !== shadeStamp) { shadeCache.clear(); shadeSrc = src; shadeStamp = stamp }
  let c = shadeCache.get(a)
  if (!c) {
    const s = src as HTMLCanvasElement
    c = document.createElement('canvas')
    c.width = s.width
    c.height = s.height
    const x = c.getContext('2d')!
    x.drawImage(src, 0, 0)
    x.globalCompositeOperation = 'source-atop'
    x.fillStyle = `rgba(0,0,0,${a})`
    x.fillRect(0, 0, c.width, c.height)
    shadeCache.set(a, c)
  }
  return c
}

export interface Camera {
  yaw: number          // radians, 0 = front facing the viewer
  pitch: number        // radians, looking down from above when positive
  scale: number        // screen pixels per model unit
  center: V3           // model point drawn at the middle of the canvas
  shade: boolean
  bg?: string
  /** Move a point before the camera sees it (limb poses). */
  warp?: (p: V3, face: Face) => V3
}

export function drawFaces(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number,
                          faces: Face[], cam: Camera, stamp = 0) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw)
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch)
  const ox = w / 2, oy = h / 2
  const proj = (p: V3, f: Face) => {
    const [x, y, z] = cam.warp ? cam.warp(p, f) : p
    const dx = x - cam.center[0], dy = y - cam.center[1], dz = z - cam.center[2]
    const rx = dx * cy + dz * sy
    const rz = -dx * sy + dz * cy
    const ry = dy * cp - rz * sp
    const depth = dy * sp + rz * cp
    return {x: ox + rx * cam.scale, y: oy - ry * cam.scale, z: depth}
  }
  const drawn = faces
      .map(f => {
        const a = proj(f.p0, f), b = proj(f.pu, f), c = proj(f.pv, f)
        // Facing the viewer when the screen-space winding is clockwise.
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        const depth = (a.z + b.z + c.z + (b.z + c.z - a.z)) / 4
        return {f, a, b, c, cross, depth}
      })
      .filter(d => d.cross > 0)
      .sort((p, q) => (p.depth - q.depth) || (Number(p.f.outer) - Number(q.f.outer)))

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (cam.bg) {
    ctx.fillStyle = cam.bg
    ctx.fillRect(0, 0, w, h)
  }
  ctx.imageSmoothingEnabled = false
  for (const {f, a, b, c} of drawn) {
    ctx.setTransform(
        (b.x - a.x) / f.sw, (b.y - a.y) / f.sw,
        (c.x - a.x) / f.sh, (c.y - a.y) / f.sh,
        a.x, a.y,
    )
    // A hair of overdraw hides the seams between neighbouring faces.
    const pad = f.outer ? 0 : Math.max(0.03, 0.6 * f.sw / Math.hypot(b.x - a.x, b.y - a.y))
    const img = cam.shade ? shaded(src, SHADE[f.kind], stamp) : src
    ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, -pad, -pad, f.sw + pad * 2, f.sh + pad * 2)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
