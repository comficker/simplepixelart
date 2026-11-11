// A painted world (tilemap) out to game engines and files: Tiled, Godot,
// JSON. Shared by the tilemap editor and a world's public page, so both
// export the same thing. The caller loads the tile images first (they are
// what the atlases are cut from) and hands them over with the slugs.

import {type TilemapConfig, placedIds, tileImageUrl, tileOf} from '~/helper/tilemap'
import type {TileAnim} from '~/helper/tile-anim'
import {buildTiledMap} from '~/helper/tilemap-export'
import {buildGodotMap, buildTiledMapShared, packSprites} from '~/helper/map-export'
import {buildGodotTileSet, buildTiledTileset} from '~/helper/engine-export'
import {canvasBytes, packTileset} from '~/helper/tileset-pack'
import type {SheetGroup} from '~/helper/sheet-layout'
import {createZip} from '~/helper/zip'

export interface WorldExportSource {
  config: TilemapConfig
  /** The world's name, shown in READMEs; files take a slug of it. */
  name: string
  tilesetIdString?: string | null
  tilesetName?: string | null
  /** The tileset's meta (groups, terrains, solid tiles). */
  tilesetMeta?: any
  /** Tile id -> art slug, for every tile the map or tileset uses. */
  slugs: Record<number, string>
  /** Tile id -> its loaded image. */
  images: Map<number, HTMLImageElement>
  /** Animated tiles' frames, for the tileset atlas. */
  loadAnims: (ids: number[]) => Promise<Map<number, TileAnim>>
  /** Makes sure these tiles' images are loaded (or have failed). */
  ensureImages: (ids: number[]) => Promise<void>
}

export interface ExportFile { blob: Blob; filename: string; missing: number }

export function exportSlug(name: string): string {
  return (name || 'tilemap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tilemap'
}

/** Whether there is anything to export. */
export function hasContent(c: TilemapConfig): boolean {
  return placedIds(c).length > 0 || c.layers.some(l => l.objects?.length)
}

export function exportJSON(src: WorldExportSource, apiBase: string): ExportFile {
  const c = src.config
  const tiles: Record<string, string> = {}
  for (const id of placedIds(c)) {
    if (src.slugs[id]) tiles[String(id)] = tileImageUrl(apiBase, src.slugs[id]!)
  }
  const data = {
    format: 'simplepixelart.tilemap',
    version: 1,
    name: src.name || 'Untitled',
    mode: c.mode,
    cols: c.cols,
    rows: c.rows,
    cellW: c.cellW,
    cellH: c.cellH,
    isoRatio: c.isoRatio,
    seed: c.seed,
    bg: c.bg,
    layers: c.layers.map(l => ({
      id: l.id, name: l.name, kind: l.kind, visible: l.visible, ySort: l.ySort,
      cells: l.cells, terrain: l.terrain,
      ...(l.offsets && Object.keys(l.offsets).length ? {offsets: l.offsets} : {}),
    })),
    tiles,
  }
  return {
    blob: new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}),
    filename: `${exportSlug(src.name)}.json`,
    missing: 0,
  }
}

function tiledReadme(src: WorldExportSource, base: string): string {
  const c = src.config
  if (c.mode === 'iso') {
    return [
      `${src.name || 'Tilemap'} — Tiled map export from https://simplepixelart.com`,
      '',
      `Files: ${base}.tmj (Tiled 1.10 JSON map) + one tileset PNG per tile size.`,
      'Tiled: File > Open and pick the .tmj — keep the PNGs next to it.',
      '',
    ].join('\n')
  }
  const ts = src.tilesetIdString ? `${src.tilesetIdString}_tileset` : `${base}_tileset`
  return [
    `${src.name || 'Tilemap'} — Tiled map export from https://simplepixelart.com`,
    '',
    `${base}.tmj       the map (Tiled 1.10 JSON). Its tileset is embedded: the same`,
    `                  atlas, terrains (Wang sets) and collision as ${ts}.tsx.`,
    `${ts}.tsx  that tileset on its own, for other Tiled maps.`,
    `${base}_sprites.png  sprite layers' art, at its own size; sprite layers are`,
    '                  object layers of tile objects. Object layers are named points.',
    '',
    'Tiled: File > Open and pick the .tmj — keep the PNGs next to it.',
    '',
    'Phaser 3:',
    '  preload() {',
    `    this.load.tilemapTiledJSON('map', '${base}.tmj')`,
    `    this.load.image('tiles', '${ts}_${c.cellW}x${c.cellH}.png')`,
    '  }',
    '  create() {',
    "    const map = this.make.tilemap({key: 'map'})",
    `    const tiles = map.addTilesetImage(map.tilesets[0].name, 'tiles')`,
    `    map.createLayer('${c.layers.find(l => l.kind === 'ground')?.name || 'Layer 1'}', tiles)`,
    '  }',
    '',
    'Godot 4: use the Godot export instead — it is a ready scene.',
    'Unity: import with SuperTiled2Unity.',
    '',
  ].join('\n')
}

function godotReadme(src: WorldExportSource, base: string, tilesetBase: string): string {
  return [
    `${src.name || 'Tilemap'} — Godot 4 scene from https://simplepixelart.com`,
    '',
    `1. Copy every file into one folder of your Godot 4 project (4.3 or newer).`,
    `2. Open ${base}.tscn. Ground layers are TileMapLayers on ${tilesetBase}.tres —`,
    '   keep painting them, terrains included, from the TileMap panel.',
    '3. Sprite layers are Sprite2D / AnimatedSprite2D nodes, y-sorted where the map was.',
    '   Object layers are Marker2D nodes named as on the map.',
    '',
    'Solid tiles collide on physics layer 1. For crisp pixels set',
    'Project Settings > Rendering > Textures > Default Texture Filter to Nearest.',
    '',
  ].join('\n')
}

/** Everything both engine exports share: the tileset rebuilt from its own
 * meta (plus any tile the map uses that the tileset does not list), its
 * animations, and the map's sprites in an atlas of their own. */
async function prepareGameExport(src: WorldExportSource) {
  const c = src.config
  const meta = src.tilesetMeta || {}
  const known = (id: number) => !!src.slugs[id]
  const groups: SheetGroup[] = (Array.isArray(meta.groups) ? meta.groups : [])
      .filter((g: any) => g && (g.kind === 'group' || g.kind === 'terrain'))
      .map((g: any) => ({
        id: String(g.id), name: String(g.name || 'Tiles'), kind: g.kind,
        tiles: (Array.isArray(g.tiles) ? g.tiles : []).map(Number).filter(known),
        ...(g.pos ? {pos: g.pos} : {}),
        ...(g.random ? {random: true, weights: g.weights || {}} : {}),
        ...(g.kind === 'terrain' ? {
          type: g.type,
          map: Object.fromEntries(Object.entries(g.map || {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => known(v as number))),
        } : {}),
      }))
  const inTileset = new Set<number>()
  for (const g of groups) {
    for (const id of g.tiles) inTileset.add(id)
    for (const id of Object.values(g.map || {})) inTileset.add(id)
  }
  const placed = [...new Set(placedIds(c))].filter(known)
  const loose = placed.filter(id => !inTileset.has(id))
  if (loose.length) groups.push({id: 'map-loose', name: 'Map tiles', kind: 'group', tiles: loose})
  const all = [...new Set([...inTileset, ...loose])]
  await src.ensureImages(all)

  const bySlug = new Map<string, HTMLImageElement>()
  for (const id of all) {
    const img = src.images.get(id)
    if (img?.naturalWidth && src.slugs[id]) bySlug.set(src.slugs[id]!, img)
  }
  const anims = await src.loadAnims(all)
  const base = exportSlug(src.name)
  const tilesetBase = src.tilesetIdString ? `${src.tilesetIdString}_tileset` : `${base}_tileset`
  const cell = {w: c.cellW, h: c.cellH}
  const tilesetImage = `${tilesetBase}_${cell.w}x${cell.h}.png`
  const solid = new Set<number>((Array.isArray(meta.solid) ? meta.solid : []).map(Number))
  const pack = packTileset({
    name: meta.name || src.tilesetName || base, image: tilesetImage, animImage: `${tilesetBase}_anim.png`,
    groups,
    src: {
      cell,
      slugOf: id => src.slugs[id] || null,
      sizeOf: slug => {
        const img = slug ? bySlug.get(slug) : null
        return img ? {w: img.naturalWidth, h: img.naturalHeight} : null
      },
    },
    imageOf: slug => bySlug.get(slug) || null,
    solid, anims,
  })
  const spriteIds = c.layers.filter(l => l.kind === 'sprite').flatMap(l => Object.values(l.cells).map(tileOf))
  const sprites = packSprites(spriteIds, src.images, anims)
  return {
    base, tilesetBase, tilesetImage, pack, sprites,
    input: {
      config: c, name: src.name || base, spritesImage: `${base}_sprites.png`,
      tilesetBase, tilesetImage, pack, sprites, solid, animated: new Set(pack.animOf.keys()),
    },
  }
}

/** A zip for Tiled: the .tmj map, its tileset and art, and a README. */
export async function exportTiled(src: WorldExportSource): Promise<ExportFile> {
  const base = exportSlug(src.name)
  const enc = new TextEncoder()
  if (src.config.mode === 'iso') {
    // Isometric maps keep the per-size export until the shared one draws them.
    await src.ensureImages([...new Set(placedIds(src.config))])
    const {tmj, images, missing} = buildTiledMap(src.config, src.images, base)
    const files: { name: string; data: Uint8Array }[] = [{name: `${base}.tmj`, data: enc.encode(tmj)}]
    for (const im of images) files.push({name: im.name, data: await canvasBytes(im.canvas)})
    files.push({name: 'README.txt', data: enc.encode(tiledReadme(src, base))})
    return {blob: createZip(files), filename: `${base}_tiled.zip`, missing}
  }
  const x = await prepareGameExport(src)
  const {tmj, missing} = buildTiledMapShared(x.input)
  const files = [
    {name: `${base}.tmj`, data: enc.encode(tmj)},
    {name: `${x.tilesetBase}.tsx`, data: enc.encode(buildTiledTileset(x.pack.engine))},
    {name: x.tilesetImage, data: await canvasBytes(x.pack.canvas)},
    {name: `${base}_sprites.png`, data: await canvasBytes(x.sprites.canvas)},
    {name: 'README.txt', data: enc.encode(tiledReadme(src, base))},
  ]
  return {blob: createZip(files), filename: `${base}_tiled.zip`, missing}
}

/** A zip for Godot 4: a ready .tscn scene on its .tres tileset. Grid maps
 *  only (isometric is not drawn yet). */
export async function exportGodot(src: WorldExportSource): Promise<ExportFile> {
  const x = await prepareGameExport(src)
  const {tscn, missing} = buildGodotMap({...x.input, slugOf: (id: number) => src.slugs[id] || `tile_${id}`})
  const enc = new TextEncoder()
  const files = [
    {name: `${x.base}.tscn`, data: enc.encode(tscn)},
    {name: `${x.tilesetBase}.tres`, data: enc.encode(buildGodotTileSet(x.pack.engine).text)},
    {name: x.tilesetImage, data: await canvasBytes(x.pack.canvas)},
    ...(x.pack.animCanvas ? [{name: `${x.tilesetBase}_anim.png`, data: await canvasBytes(x.pack.animCanvas)}] : []),
    {name: `${x.base}_sprites.png`, data: await canvasBytes(x.sprites.canvas)},
    {name: 'README.txt', data: enc.encode(godotReadme(src, x.base, x.tilesetBase))},
  ]
  return {blob: createZip(files), filename: `${x.base}_godot.zip`, missing}
}
