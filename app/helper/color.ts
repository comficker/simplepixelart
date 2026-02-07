export const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}

export function hexColorDelta(hex1: string, hex2: string) {
  // get red/green/blue int values of hex1
  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);
  // get red/green/blue int values of hex2
  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);
  // calculate differences between reds, greens and blues
  let r = 255 - Math.abs(r1 - r2);
  let g = 255 - Math.abs(g1 - g2);
  let b = 255 - Math.abs(b1 - b2);
  // limit differences between 0 and 1
  r /= 255;
  g /= 255;
  b /= 255;
  // 0 means opposite colors, 1 means same colors
  return (r + g + b) / 3;
}

export function isSameColor(hex1: string, hex2: string) {
  return hexColorDelta(hex1, hex2) > 0.95
}
