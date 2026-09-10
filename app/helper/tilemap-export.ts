import type {TilemapConfig} from '~/helper/tilemap'
import {computeGeometry, placedIds} from '~/helper/tilemap'

export interface TiledMapExport {
  tmj: string
  images: { name: string; canvas: HTMLCanvasElement }[]
  missing: number
}

interface SlotGroup {
  key: string
  w: number
  h: number
  ids: number[]
}

export function buildTiledMap(
    c: TilemapConfig,
    images: Map<number, HTMLImageElement>,
    name: string,
): TiledMapExport {
  const g = computeGeometry(c)
  const iso = c.mode === 'iso'

  const used: number[] = []
  const seen = new Set<number>()
  let missing = 0
  for (const id of placedIds(c)) {
    if (seen.has(id)) continue
    seen.add(id)
    const img = images.get(id)
    if (img && img.complete && img.naturalWidth > 0) used.push(id)
    else missing++
  }

  const slotOf = (img: HTMLImageElement) => {
    if (iso) {
      const span = Math.max(1, Math.round(img.naturalWidth / g.tileW))
      const w = g.tileW * span
      return {w, h: Math.max(1, Math.round(img.naturalHeight * (w / img.naturalWidth)))}
    }
    const spanC = Math.max(1, Math.round(img.naturalWidth / g.tileW))
    const spanR = Math.max(1, Math.round(img.naturalHeight / g.tileH))
    return {w: spanC * g.tileW, h: spanR * g.tileH}
  }

  const groups: SlotGroup[] = []
  const groupByKey: Record<string, SlotGroup> = {}
  for (const id of used) {
    const {w, h} = slotOf(images.get(id)!)
    const key = `${w}x${h}`
    let grp = groupByKey[key]
    if (!grp) {
      grp = {key, w, h, ids: []}
      groupByKey[key] = grp
      groups.push(grp)
    }
    grp.ids.push(id)
  }

  const gidOf: Record<number, number> = {}
  const tilesets: any[] = []
  const out: { name: string; canvas: HTMLCanvasElement }[] = []
  let firstgid = 1
  for (const grp of groups) {
    const columns = Math.min(grp.ids.length, 8)
    const rows = Math.ceil(grp.ids.length / columns)
    const canvas = document.createElement('canvas')
    canvas.width = columns * grp.w
    canvas.height = rows * grp.h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    grp.ids.forEach((id, i) => {
      const img = images.get(id)!
      ctx.drawImage(img, (i % columns) * grp.w, Math.floor(i / columns) * grp.h, grp.w, grp.h)
      gidOf[id] = firstgid + i
    })
    const tsName = `tiles-${grp.key}`
    out.push({name: `${tsName}.png`, canvas})
    tilesets.push({
      firstgid,
      name: tsName,
      image: `${tsName}.png`,
      imagewidth: canvas.width,
      imageheight: canvas.height,
      tilewidth: grp.w,
      tileheight: grp.h,
      tilecount: grp.ids.length,
      columns,
      margin: 0,
      spacing: 0,
    })
    firstgid += grp.ids.length
  }

  const layers = c.layers.map((l, i) => {
    const data = new Array(c.cols * c.rows).fill(0)
    for (const [k, id] of Object.entries(l.cells)) {
      const sep = k.indexOf('_')
      const col = +k.slice(0, sep)
      const row = +k.slice(sep + 1)
      const gid = gidOf[id]
      if (gid && col >= 0 && col < c.cols && row >= 0 && row < c.rows) {
        data[row * c.cols + col] = gid
      }
    }
    return {
      id: i + 1,
      name: l.name,
      type: 'tilelayer',
      visible: l.visible,
      opacity: 1,
      x: 0,
      y: 0,
      width: c.cols,
      height: c.rows,
      data,
    }
  })

  const tmj = JSON.stringify({
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.2',
    orientation: iso ? 'isometric' : 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: c.cols,
    height: c.rows,
    tilewidth: g.tileW,
    tileheight: g.tileH,
    compressionlevel: -1,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    properties: [{name: 'exported_by', type: 'string', value: 'https://simplepixelart.com'}],
    class: name,
    layers,
    tilesets,
  }, null, 1)

  return {tmj, images: out, missing}
}
