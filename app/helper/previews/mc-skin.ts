// A 64×64 Minecraft-format skin drawn as a figure, with plain Canvas 2D: an
// orthographic camera turns every box face into a parallelogram, which one
// affine transform maps the texture onto exactly. Only the public UV layout
// is used; no game asset ships with this.

export type SkinArms = 'classic' | 'slim'
export type SkinPose = 'stand' | 'walk' | 'wave'

type V3 = [number, number, number]
type Kind = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'
type Limb = 'armR' | 'armL' | 'legR' | 'legL' | null

interface Face {
  sx: number, sy: number, sw: number, sh: number // texture rect
  p0: V3, pu: V3, pv: V3                         // texture top-left, top-right, bottom-left
  outer: boolean
  kind: Kind
  limb: Limb
}

// Box at x0..x1, y0..y1 (up), z0..z1 (front is +z), textured from UV origin
// (u, v) with the usual unfold: top/bottom above, then right, front, left,
// back along the middle strip.
function box(x0: number, y0: number, z0: number, w: number, h: number, d: number,
             u: number, v: number, grow: number, outer: boolean, limb: Limb): Face[] {
  const a = x0 - grow, b = x0 + w + grow
  const c = y0 - grow, e = y0 + h + grow
  const f = z0 - grow, g = z0 + d + grow
  const t = (kind: Kind, sx: number, sy: number, sw: number, sh: number, p0: V3, pu: V3, pv: V3): Face =>
      ({sx, sy, sw, sh, p0, pu, pv, outer, kind, limb})
  return [
    t('front', u + d, v + d, w, h, [a, e, g], [b, e, g], [a, c, g]),
    t('back', u + 2 * d + w, v + d, w, h, [b, e, f], [a, e, f], [b, c, f]),
    t('right', u, v + d, d, h, [a, e, f], [a, e, g], [a, c, f]),
    t('left', u + d + w, v + d, d, h, [b, e, g], [b, e, f], [b, c, g]),
    t('top', u + d, v, w, d, [a, e, f], [b, e, f], [a, e, g]),
    t('bottom', u + d + w, v, w, d, [a, c, g], [b, c, g], [a, c, f]),
  ]
}

export function skinFaces(arms: SkinArms): Face[] {
  const aw = arms === 'slim' ? 3 : 4
  const parts: [number, number, number, number, number, number, number, number, number, number, number, Limb][] = [
    // x0, y0, z0, w, h, d, base u, v, outer u, v, outer grow, limb
    [-4, 24, -4, 8, 8, 8, 0, 0, 32, 0, 0.5, null],
    [-4, 12, -2, 8, 12, 4, 16, 16, 16, 32, 0.25, null],
    [-4 - aw, 12, -2, aw, 12, 4, 40, 16, 40, 32, 0.25, 'armR'],
    [4, 12, -2, aw, 12, 4, 32, 48, 48, 48, 0.25, 'armL'],
    [-4, 0, -2, 4, 12, 4, 0, 16, 0, 32, 0.25, 'legR'],
    [0, 0, -2, 4, 12, 4, 16, 48, 0, 48, 0.25, 'legL'],
  ]
  return parts.flatMap(([x, y, z, w, h, d, bu, bv, ou, ov, grow, limb]) => [
    ...box(x, y, z, w, h, d, bu, bv, 0, false, limb),
    ...box(x, y, z, w, h, d, ou, ov, grow, true, limb),
  ])
}

// Where each limb swings from: shoulders and hips.
const PIVOT: Record<Exclude<Limb, null>, [number, number]> = {
  armR: [22, 0], armL: [22, 0], legR: [12, 0], legL: [12, 0],
}

export interface SkinView {
  yaw: number      // radians, 0 = facing the viewer
  pitch: number    // radians, looking down from above when positive
  arms: SkinArms
  outer: boolean
  pose: SkinPose
  phase: number    // animation clock for walk / wave, radians
  shade: boolean   // darken sides, back and underside like a lit scene
  framing: 'body' | 'head'
  bg?: string      // fill colour, '' for transparent
}

// Shaded copies of the skin: same pixels darkened, so transparent pixels
// stay transparent (a fill over the face would paint them too).
const SHADE: Record<Kind, number> = {top: 0, front: 0.04, left: 0.16, right: 0.16, back: 0.24, bottom: 0.34}
let shadeSrc: CanvasImageSource | null = null
let shadeStamp = -1
const shadeCache = new Map<number, HTMLCanvasElement>()
function shaded(src: CanvasImageSource, a: number, stamp: number): CanvasImageSource {
  if (!a) return src
  if (src !== shadeSrc || stamp !== shadeStamp) { shadeCache.clear(); shadeSrc = src; shadeStamp = stamp }
  let c = shadeCache.get(a)
  if (!c) {
    c = document.createElement('canvas')
    c.width = c.height = 64
    const x = c.getContext('2d')!
    x.drawImage(src, 0, 0)
    x.globalCompositeOperation = 'source-atop'
    x.fillStyle = `rgba(0,0,0,${a})`
    x.fillRect(0, 0, 64, 64)
    shadeCache.set(a, c)
  }
  return c
}

function limbAngle(limb: Limb, pose: SkinPose, phase: number): number {
  if (!limb || pose === 'stand') return 0
  const s = Math.sin(phase)
  if (pose === 'walk') return (limb === 'armR' || limb === 'legL' ? 1 : -1) * s * 0.6
  // wave: the right arm up and swinging, the rest still
  return limb === 'armR' ? -(Math.PI - 0.5) + s * 0.35 : 0
}

/** Draw `src` (a 64×64 skin image) as a figure filling the w×h canvas.
 *  `stamp` changes whenever the art does, to refresh the shading cache. */
export function drawSkin(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number,
                         view: SkinView, stamp = 0) {
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw)
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
  const head = view.framing === 'head'
  const scale = head ? Math.min(h, w) / 19 : Math.min(h / 40, w / 26)
  const cyModel = head ? 28 : 16
  const ox = w / 2, oy = h / 2
  const angles: Record<string, number> = {}
  for (const l of ['armR', 'armL', 'legR', 'legL']) angles[l] = limbAngle(l as Limb, view.pose, view.phase)

  const proj = (p: V3, limb: Limb) => {
    let [x, y, z] = p
    const ang = limb ? angles[limb]! : 0
    if (ang) {
      const [py, pz] = PIVOT[limb!]
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const dy = y - py, dz = z - pz
      y = py + dy * ca - dz * sa
      z = pz + dy * sa + dz * ca
    }
    const rx = x * cy + z * sy
    const rz = -x * sy + z * cy
    const y0 = y - cyModel
    const ry = y0 * cp - rz * sp
    const depth = y0 * sp + rz * cp
    return {x: ox + rx * scale, y: oy - ry * scale, z: depth}
  }

  const drawn = skinFaces(view.arms)
      .filter(f => view.outer || !f.outer)
      .map(f => {
        const a = proj(f.p0, f.limb), b = proj(f.pu, f.limb), c = proj(f.pv, f.limb)
        // Facing the viewer when the screen-space winding is clockwise.
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        const far = {x: b.x + c.x - a.x, y: 0, z: b.z + c.z - a.z}
        const depth = (a.z + b.z + c.z + far.z) / 4
        return {f, a, b, c, cross, depth}
      })
      .filter(d => d.cross > 0)
      .sort((p, q) => (p.depth - q.depth) || (Number(p.f.outer) - Number(q.f.outer)))

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (view.bg) {
    ctx.fillStyle = view.bg
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
    const pad = f.outer ? 0 : Math.max(0.03, 0.6 / scale)
    const img = view.shade ? shaded(src, SHADE[f.kind], stamp) : src
    ctx.drawImage(img, f.sx, f.sy, f.sw, f.sh, -pad, -pad, f.sw + pad * 2, f.sh + pad * 2)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
