// The board read as ONE terrain laid out the way the tileset editor exports
// it (sheet-layout buildSheet): slot i of the terrain's slot list at column
// i % n, row ⌊i / n⌋, n = 7 for blob47 and 4 otherwise. A sample map is then
// joined with the tilemap's own rules (terrainMask / cornerMask /
// resolveTerrainTile), so what this shows is what the tilemap will draw.
import {cornerMask, resolveTerrainTile, terrainMask, type Terrain, type TerrainType} from '~/helper/autotile'
import {terrainGridNOf, terrainSlotsOf} from '~/helper/sheet-layout'

export type SampleMap = 'island' | 'paths' | 'random'

/** The terrain type to read a w×h board as when the user left it on auto. */
// A size like 112 splits both ways; the one giving a usual tile size wins.
const USUAL = new Set([8, 10, 12, 16, 20, 24, 32, 48, 64])
export function guessTerrainType(w: number, h: number): TerrainType {
  const blob = w % 7 === 0 && h % 7 === 0, wang = w % 4 === 0 && h % 4 === 0
  if (blob && !wang) return 'blob47'
  if (wang && !blob) return 'wang16'
  return USUAL.has(w / 7) && !USUAL.has(w / 4) ? 'blob47' : 'wang16'
}

const ISLAND = [
  '..............',
  '..####....##..',
  '.######...##..',
  '.##..###......',
  '.##..####..#..',
  '.#######...#..',
  '..#####..###..',
  '...........#..',
  '.#.#..####....',
  '..............',
]
const PATHS = [
  '..............',
  '.#######......',
  '.#.....#..#...',
  '.#.....####...',
  '.###...#......',
  '...#...#..###.',
  '...#####..#.#.',
  '..........###.',
  '..#...........',
  '..............',
]

export function sampleCells(kind: SampleMap, seed: number): { cols: number, rows: number, painted: Set<string> } {
  const painted = new Set<string>()
  if (kind === 'random') {
    const cols = 14, rows = 10
    let s = (seed * 2654435761) >>> 0 || 1
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let r = 1; r < rows - 1; r++)
      for (let c = 1; c < cols - 1; c++)
        if (rnd() < 0.55) painted.add(`${c}_${r}`)
    return {cols, rows, painted}
  }
  const rowsOf = kind === 'paths' ? PATHS : ISLAND
  rowsOf.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') painted.add(`${c}_${r}`) }))
  return {cols: rowsOf[0]!.length, rows: rowsOf.length, painted}
}

export function drawAutotile(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, w: number, h: number,
                             type: TerrainType, map: { cols: number, rows: number, painted: Set<string> }) {
  const n = terrainGridNOf(type)
  const tw = Math.floor(src.width / n), th = Math.floor(src.height / n)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (!tw || !th) return
  // Tile "ids" are slot index + 1 (0 would read as "no tile").
  const slots = terrainSlotsOf(type)
  const t: Terrain = {id: 't', name: 't', type, map: Object.fromEntries(slots.map((m, i) => [String(m), i + 1]))}
  const terrain: Record<string, string> = {}
  for (const k of map.painted) terrain[k] = 't'

  const s = Math.max(0.25, Math.min(w / (map.cols * tw), h / (map.rows * th)))
  const ox = Math.round((w - map.cols * tw * s) / 2), oy = Math.round((h - map.rows * th * s) / 2)
  ctx.imageSmoothingEnabled = false
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      let id: number | null = null
      if (type === 'corner16') {
        const m = cornerMask(terrain, c, r, 't')
        if (m) id = resolveTerrainTile(t, m)
      } else if (terrain[`${c}_${r}`]) {
        id = resolveTerrainTile(t, terrainMask(terrain, c, r, 't', type))
      }
      if (!id) continue
      const i = id - 1
      ctx.drawImage(src, (i % n) * tw, Math.floor(i / n) * th, tw, th,
          ox + c * tw * s, oy + r * th * s, tw * s, th * s)
    }
  }
}
