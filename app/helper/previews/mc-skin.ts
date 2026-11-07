// A 64×64 Minecraft-format skin drawn as a turning figure, with plain
// Canvas 2D: an orthographic camera turns every box face into a
// parallelogram, which one affine transform maps the texture onto exactly.
// Only the public UV layout is used; no game asset ships with this.

export type SkinArms = 'classic' | 'slim'

type V3 = [number, number, number]

interface Face {
  // Texture rect in the 64×64 image.
  sx: number, sy: number, sw: number, sh: number
  // 3D corners: texture top-left, top-right, bottom-left.
  p0: V3, pu: V3, pv: V3
  outer: boolean
}

// Box at x0..x1, y0..y1 (up), z0..z1 (front is +z), textured from UV origin
// (u, v) with the usual unfold: top/bottom above, then right, front, left,
// back along the middle strip.
function box(x0: number, y0: number, z0: number, w: number, h: number, d: number,
             u: number, v: number, grow: number, outer: boolean): Face[] {
  const a = x0 - grow, b = x0 + w + grow
  const c = y0 - grow, e = y0 + h + grow
  const f = z0 - grow, g = z0 + d + grow
  const t = (sx: number, sy: number, sw: number, sh: number, p0: V3, pu: V3, pv: V3): Face =>
      ({sx, sy, sw, sh, p0, pu, pv, outer})
  return [
    t(u + d, v + d, w, h, [a, e, g], [b, e, g], [a, c, g]),             // front
    t(u + 2 * d + w, v + d, w, h, [b, e, f], [a, e, f], [b, c, f]),     // back
    t(u, v + d, d, h, [a, e, f], [a, e, g], [a, c, f]),                 // right (-x)
    t(u + d + w, v + d, d, h, [b, e, g], [b, e, f], [b, c, g]),         // left (+x)
    t(u + d, v, w, d, [a, e, f], [b, e, f], [a, e, g]),                 // top
    t(u + d + w, v, w, d, [a, c, g], [b, c, g], [a, c, f]),             // bottom
  ]
}

export function skinFaces(arms: SkinArms): Face[] {
  const aw = arms === 'slim' ? 3 : 4
  return [
    ...box(-4, 24, -4, 8, 8, 8, 0, 0, 0, false),
    ...box(-4, 12, -2, 8, 12, 4, 16, 16, 0, false),
    ...box(-4 - aw, 12, -2, aw, 12, 4, 40, 16, 0, false),
    ...box(4, 12, -2, aw, 12, 4, 32, 48, 0, false),
    ...box(-4, 0, -2, 4, 12, 4, 0, 16, 0, false),
    ...box(0, 0, -2, 4, 12, 4, 16, 48, 0, false),
    ...box(-4, 24, -4, 8, 8, 8, 32, 0, 0.5, true),
    ...box(-4, 12, -2, 8, 12, 4, 16, 32, 0.25, true),
    ...box(-4 - aw, 12, -2, aw, 12, 4, 40, 32, 0.25, true),
    ...box(4, 12, -2, aw, 12, 4, 48, 48, 0.25, true),
    ...box(-4, 0, -2, 4, 12, 4, 0, 32, 0.25, true),
    ...box(0, 0, -2, 4, 12, 4, 0, 48, 0.25, true),
  ]
}

export interface SkinView {
  yaw: number    // radians, 0 = facing the viewer
  pitch: number  // radians, tilt toward the viewer from above
  arms: SkinArms
  outer: boolean
}

/** Draw `src` (a 64×64 skin image) as a figure filling the w×h canvas. */
export function drawSkin(ctx: CanvasRenderingContext2D, src: CanvasImageSource, w: number, h: number, view: SkinView) {
  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw)
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch)
  // The figure is 32 tall (plus the outer layer) and about 17 wide.
  const scale = Math.min(h / 40, w / 26)
  const ox = w / 2, oy = h / 2
  const proj = (p: V3) => {
    const x = p[0] * cy + p[2] * sy
    const z1 = -p[0] * sy + p[2] * cy
    const y0 = p[1] - 16
    const y = y0 * cp - z1 * sp
    const z = y0 * sp + z1 * cp
    return {x: ox + x * scale, y: oy - y * scale, z}
  }
  const drawn = skinFaces(view.arms)
      .filter(f => view.outer || !f.outer)
      .map(f => {
        const a = proj(f.p0), b = proj(f.pu), c = proj(f.pv)
        // Facing the viewer when the screen-space winding is clockwise.
        const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
        const depth = (b.z + c.z) / 2
        return {f, a, b, c, cross, depth}
      })
      .filter(d => d.cross > 0)
      .sort((p, q) => (p.depth - q.depth) || (Number(p.f.outer) - Number(q.f.outer)))

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  for (const {f, a, b, c} of drawn) {
    ctx.setTransform(
        (b.x - a.x) / f.sw, (b.y - a.y) / f.sw,
        (c.x - a.x) / f.sh, (c.y - a.y) / f.sh,
        a.x, a.y,
    )
    // A hair of overdraw hides the seams between neighbouring faces.
    const pad = f.outer ? 0 : 0.03
    ctx.drawImage(src, f.sx, f.sy, f.sw, f.sh, -pad, -pad, f.sw + pad * 2, f.sh + pad * 2)
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}
