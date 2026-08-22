export const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

export function hexColorDelta(hex1: string, hex2: string) {
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  let r = 255 - Math.abs(r1 - r2);
  let g = 255 - Math.abs(g1 - g2);
  let b = 255 - Math.abs(b1 - b2);
  r /= 255;
  g /= 255;
  b /= 255;
  return (r + g + b) / 3;
}

export function isSameColor(hex1: string, hex2: string) {
  return hexColorDelta(hex1, hex2) > 0.95
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l)
  return rgbToHex(r, g, b).toUpperCase()
}

export type SchemeType =
    | 'complementary' | 'analogous' | 'triadic'
    | 'split' | 'tetradic' | 'monochromatic' | 'shades'

export const SCHEME_TYPES: { key: SchemeType; label: string; hint: string }[] = [
  {key: 'complementary', label: 'Complementary', hint: 'The base color and its opposite on the wheel — maximum contrast.'},
  {key: 'analogous', label: 'Analogous', hint: 'Neighbours on the wheel — calm, cohesive blends.'},
  {key: 'triadic', label: 'Triadic', hint: 'Three colors evenly spaced — vivid yet balanced.'},
  {key: 'split', label: 'Split', hint: 'The base plus the two colors beside its complement — softer contrast.'},
  {key: 'tetradic', label: 'Square', hint: 'Four colors evenly spaced — rich, four-way harmony.'},
  {key: 'monochromatic', label: 'Monochrome', hint: 'One hue at different saturation and lightness — clean and tonal.'},
  {key: 'shades', label: 'Shades & tints', hint: 'The base color stepped from dark shade to light tint.'},
]

const HUE_OFFSETS: Record<string, number[]> = {
  complementary: [0, 180],
  analogous: [-60, -30, 0, 30, 60],
  triadic: [0, 120, 240],
  split: [0, 150, 210],
  tetradic: [0, 90, 180, 270],
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generatePalette(
    baseHex: string,
    type: SchemeType,
    count = 6,
    spread = 0.34,
    seed = 0, // 0 = canonical (deterministic); > 0 = a variation of the same base
): string[] {
  const [r, g, b] = hexToRgb(baseHex)
  const {h, s, l} = rgbToHsl(r, g, b)
  count = Math.max(2, Math.min(16, Math.round(count)))

  const rng = seed ? mulberry32(seed) : null
  const lBase = clamp01(l + (rng ? (rng() * 2 - 1) * 0.10 : 0))
  const sBase = clamp01(s * (rng ? 0.85 + rng() * 0.30 : 1))

  const offsets = (type === 'monochromatic' || type === 'shades')
      ? [0]
      : (HUE_OFFSETS[type] || HUE_OFFSETS.complementary)
  const H = offsets.length
  const perHue = Math.max(1, Math.ceil(count / H))

  const toneDelta = (t: number, n: number) => (n <= 1 ? 0 : (t / (n - 1) - 0.5) * spread)

  const out: string[] = []
  for (const off of offsets) {
    const hueWobble = (rng && off !== 0) ? (rng() * 2 - 1) * 12 : 0
    for (let t = 0; t < perHue; t++) {
      const d = toneDelta(t, perHue)
      const L = clamp01(lBase + d)
      let S = sBase
      if (type === 'monochromatic' && perHue > 1) S = clamp01(sBase * (1 - (d / spread) * 0.5))
      if (L > 0.85 || L < 0.12) S = clamp01(S * 0.8)
      out.push(hslToHex(h + off + hueWobble, S, L))
    }
  }

  const seen = new Set<string>()
  return out.filter(c => (seen.has(c) ? false : (seen.add(c), true))).slice(0, count)
}
