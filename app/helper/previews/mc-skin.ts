// A 64×64 Minecraft-format skin drawn as a figure (see box3d). Only the public
// UV layout is used; no game asset ships with this.
import {boxFaces, drawFaces, type Face, type Kind, type V3} from './box3d'

export type SkinArms = 'classic' | 'slim'
export type SkinPose = 'stand' | 'walk' | 'wave'
type Limb = 'armR' | 'armL' | 'legR' | 'legL'

// The usual unfold of a w×h×d box from UV origin (u, v): top/bottom above,
// then right, front, left, back along the middle strip.
function unfold(u: number, v: number, w: number, h: number, d: number): Record<Kind, [number, number, number, number]> {
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  }
}

export function skinFaces(arms: SkinArms): Face[] {
  const aw = arms === 'slim' ? 3 : 4
  const parts: [number, number, number, number, number, number, number, number, number, number, number, Limb | undefined][] = [
    // x0, y0, z0, w, h, d, base u, v, outer u, v, outer grow, limb
    [-4, 24, -4, 8, 8, 8, 0, 0, 32, 0, 0.5, undefined],
    [-4, 12, -2, 8, 12, 4, 16, 16, 16, 32, 0.25, undefined],
    [-4 - aw, 12, -2, aw, 12, 4, 40, 16, 40, 32, 0.25, 'armR'],
    [4, 12, -2, aw, 12, 4, 32, 48, 48, 48, 0.25, 'armL'],
    [-4, 0, -2, 4, 12, 4, 0, 16, 0, 32, 0.25, 'legR'],
    [0, 0, -2, 4, 12, 4, 16, 48, 0, 48, 0.25, 'legL'],
  ]
  return parts.flatMap(([x, y, z, w, h, d, bu, bv, ou, ov, grow, limb]) => [
    ...boxFaces(x, y, z, w, h, d, unfold(bu, bv, w, h, d), 0, false, limb),
    ...boxFaces(x, y, z, w, h, d, unfold(ou, ov, w, h, d), grow, true, limb),
  ])
}

// Shoulders and hips: where each limb swings from (y, z).
const PIVOT: Record<Limb, [number, number]> = {armR: [22, 0], armL: [22, 0], legR: [12, 0], legL: [12, 0]}

function limbAngle(limb: Limb, pose: SkinPose, phase: number): number {
  if (pose === 'stand') return 0
  const s = Math.sin(phase)
  if (pose === 'walk') return (limb === 'armR' || limb === 'legL' ? 1 : -1) * s * 0.6
  // wave: the right arm up and swinging, the rest still
  return limb === 'armR' ? -(Math.PI - 0.5) + s * 0.35 : 0
}

export interface SkinView {
  yaw: number
  pitch: number
  arms: SkinArms
  outer: boolean
  pose: SkinPose
  phase: number    // animation clock for walk / wave, radians
  shade: boolean
  framing: 'body' | 'head'
  bg?: string
}

/** Draw `src` (a 64×64 skin image) as a figure filling the w×h canvas.
 *  `stamp` changes whenever the art does, to refresh the shading cache. */
export function drawSkin(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number,
                         view: SkinView, stamp = 0) {
  const head = view.framing === 'head'
  const angles = {} as Record<Limb, number>
  for (const l of ['armR', 'armL', 'legR', 'legL'] as Limb[]) angles[l] = limbAngle(l, view.pose, view.phase)
  const faces = skinFaces(view.arms).filter(f => view.outer || !f.outer)
  drawFaces(ctx, src, w, h, faces, {
    yaw: view.yaw, pitch: view.pitch, shade: view.shade, bg: view.bg,
    scale: head ? Math.min(h, w) / 19 : Math.min(h / 40, w / 26),
    center: [0, head ? 28 : 16, 0],
    warp: (p: V3, f: Face) => {
      const limb = f.tag as Limb | undefined
      const ang = limb ? angles[limb] : 0
      if (!ang) return p
      const [py, pz] = PIVOT[limb!]
      const ca = Math.cos(ang), sa = Math.sin(ang)
      const dy = p[1] - py, dz = p[2] - pz
      return [p[0], py + dy * ca - dz * sa, pz + dy * sa + dz * ca]
    },
  }, stamp)
}
