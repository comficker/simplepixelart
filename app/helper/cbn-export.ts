// Shareable images of a color by number picture: the painting on paper,
// sized for the usual social formats, signed "simplepixelart.com" in a
// handwritten hand at the bottom right.

export const EXPORT_FORMATS = [
  {id: 'square', name: 'Square', note: '1080×1080 · Instagram, Facebook', w: 1080, h: 1080},
  {id: 'portrait', name: 'Portrait', note: '1080×1350 · Instagram feed', w: 1080, h: 1350},
  {id: 'story', name: 'Story', note: '1080×1920 · Stories, Reels, TikTok', w: 1080, h: 1920},
  {id: 'picture', name: 'Picture', note: 'Just the painting, full size', w: 0, h: 0},
] as const
export type ExportFormat = typeof EXPORT_FORMATS[number]['id']

const PAPER = '#fbf8f1'
const INK = '#2f2a26'
const SIGNATURE = 'simplepixelart.com'
const FONT = 'CbnSignature'

// Caveat (SIL OFL), subset to Latin letters, digits and a little punctuation.
let fontReady: Promise<void> | null = null
function loadFont() {
  fontReady ??= new FontFace(FONT, 'url(/fonts/caveat-signature.woff2)', {weight: '600'})
    .load()
    .then(f => { document.fonts.add(f) })
    .catch(() => {})
  return fontReady
}

function sign(g: CanvasRenderingContext2D, right: number, bottom: number, size: number, artist?: string) {
  g.save()
  g.font = `600 ${size}px ${FONT}, "Segoe Script", "Bradley Hand", cursive`
  g.textAlign = 'right'
  g.textBaseline = 'alphabetic'
  const w = g.measureText(SIGNATURE).width
  // A slight upward slant, like a signature dashed off at the corner.
  g.translate(right, bottom)
  g.rotate(-0.05)
  g.globalAlpha = 0.82
  g.fillStyle = INK
  g.fillText(SIGNATURE, 0, 0)
  // The flourish under the name.
  g.strokeStyle = INK
  g.lineCap = 'round'
  g.lineWidth = Math.max(1.5, size * 0.055)
  g.beginPath()
  g.moveTo(-w * 1.02, size * 0.22)
  g.bezierCurveTo(-w * 0.62, size * 0.36, -w * 0.25, size * 0.08, size * 0.12, size * 0.2)
  g.stroke()
  // The player's name, when signed in, just above the site's.
  if (artist) {
    g.font = `600 ${size * 0.62}px ${FONT}, "Segoe Script", "Bradley Hand", cursive`
    g.globalAlpha = 0.7
    g.fillText(`colored by @${artist}`, -size * 0.1, -size * 0.95)
  }
  g.restore()
}

/** Renders the painting (the paint layer) into the given format. */
export async function renderExport(layer: HTMLCanvasElement, format: ExportFormat, artist?: string) {
  await loadFont()
  const f = EXPORT_FORMATS.find(x => x.id === format)!
  const lw = layer.width, lh = layer.height
  let W: number, H: number, s: number
  if (f.id === 'picture') {
    // Full paint resolution, with a paper margin and room for the signature.
    s = 1
    const pad = Math.round(Math.max(lw, lh) * 0.06)
    W = lw + pad * 2
    H = lh + pad * (artist ? 4 : 3.2)
  } else {
    W = f.w
    H = f.h
    s = Math.min((W * 0.8) / lw, (H * 0.72) / lh, (W * 0.8) / lh)
  }
  const c = document.createElement('canvas')
  c.width = W
  c.height = Math.round(H)
  const g = c.getContext('2d')!
  g.fillStyle = PAPER
  g.fillRect(0, 0, W, H)

  const pw = Math.round(lw * s), ph = Math.round(lh * s)
  const px = Math.round((W - pw) / 2)
  // Sit a touch above centre so the signature has room below.
  const py = f.id === 'picture' ? Math.round((W - pw) / 2) : Math.round((H - ph) / 2 - H * 0.03)

  // The sheet the painting is on, lifted slightly off the paper.
  g.save()
  g.shadowColor = 'rgba(40, 30, 20, 0.16)'
  g.shadowBlur = Math.max(8, W * 0.03)
  g.shadowOffsetY = Math.max(2, W * 0.008)
  g.fillStyle = '#fff'
  g.fillRect(px, py, pw, ph)
  g.restore()
  g.imageSmoothingEnabled = s < 1
  g.imageSmoothingQuality = 'high'
  g.drawImage(layer, px, py, pw, ph)

  const size = Math.max(18, W * 0.05)
  sign(g, W - Math.max(16, W * 0.06), H - Math.max(14, H * (f.id === 'story' ? 0.05 : 0.045)), size, artist)
  return c
}

export function toBlob(c: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png'))
}
