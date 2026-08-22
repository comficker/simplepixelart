import {ref} from 'vue'
import type {EditorData} from '~/types'
import {cloneDeep, generateUUID} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'

const KEY = 'sp_local_tilesets'

export interface LocalTile {
  key: string
  tid: number
  name: string
  thumb: string
  ed: EditorData
}

export interface LocalTileset {
  id: string
  name: string
  tiles: LocalTile[]
  created: number
  meta?: {
    registry?: Record<string, string>
    groups?: any[]
    cell?: { w: number; h: number }
    iso?: boolean
    board?: any
    pends?: any
  }
}

const list = ref<LocalTileset[]>([])
let loaded = false
let syncing = false

function read(): LocalTileset[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function write() {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify(list.value)) } catch { /* quota — degrade */ }
}

function ensureLoaded() {
  if (loaded || typeof localStorage === 'undefined') return
  const data = read()
  let changed = false
  for (const ts of data) {
    let next = Math.max(0, ...ts.tiles.map((t: any) => t.tid || 0))
    for (const t of ts.tiles) {
      if (t.tid == null) { t.tid = ++next; changed = true }
    }
  }
  list.value = data
  loaded = true
  if (changed) write()
}

function edToThumb(ed: EditorData): string {
  if (typeof document === 'undefined') return ''
  const cv = document.createElement('canvas')
  cv.width = ed.width
  cv.height = ed.height
  const ctx = cv.getContext('2d')
  if (!ctx) return ''
  for (const layer of ed.layers || []) {
    for (const [k, idx] of Object.entries(layer.pixels || {})) {
      const [x, y] = k.split('_').map(Number)
      ctx.fillStyle = ed.colors[idx as number] || '#000'
      ctx.fillRect(x!, y!, 1, 1)
    }
  }
  return cv.toDataURL('image/png')
}

export function useLocalTilesets() {
  ensureLoaded()
  const auth = useAuthStore()

  function reload() { list.value = read() }
  function get(id: string) { return list.value.find(t => t.id === id) }

  function create(name: string): LocalTileset {
    const ts: LocalTileset = {
      id: `local:${generateUUID()}`,
      name: name.trim() || 'Untitled',
      tiles: [],
      created: Date.now(),
    }
    list.value = [ts, ...list.value]
    write()
    return ts
  }

  function remove(id: string) {
    list.value = list.value.filter(t => t.id !== id)
    write()
  }

  function addTile(tilesetId: string, tile: {name?: string; ed: EditorData; thumb?: string}): LocalTile | null {
    const ts = get(tilesetId)
    if (!ts) return null
    const ed = cloneDeep(tile.ed)
    const thumb = tile.thumb || edToThumb(ed)
    const name = tile.name || ed.name || 'Tile'
    const existing = ed.id != null ? ts.tiles.find(t => t.ed.id === ed.id) : undefined
    let result: LocalTile
    if (existing) {
      existing.ed = ed
      existing.thumb = thumb
      existing.name = name
      result = existing
    } else {
      const nextTid = Math.max(0, ...ts.tiles.map(t => t.tid || 0)) + 1
      result = {key: generateUUID(), tid: nextTid, name, thumb, ed}
      ts.tiles.push(result)
    }
    list.value = [...list.value]
    write()
    return result
  }

  function editorModel(id: string) {
    const ts = get(id)
    if (!ts) return null
    const thumbs: Record<string, string> = {}
    for (const t of ts.tiles) thumbs[t.ed.id] = t.thumb
    const registry: Record<string, string> = ts.meta?.registry
      ? {...ts.meta.registry}
      : Object.fromEntries(ts.tiles.filter(t => t.tid != null).map(t => [String(t.tid), t.ed.id]))
    const groups = Array.isArray(ts.meta?.groups) && ts.meta!.groups!.length
      ? cloneDeep(ts.meta!.groups)
      : [{id: 'g0', name: 'Tiles', kind: 'group', tiles: ts.tiles.map(t => t.tid).filter(v => v != null)}]
    const cell = ts.meta?.cell || {w: 16, h: 16}
    return {id: ts.id, name: ts.name, registry, groups, cell, iso: !!ts.meta?.iso, thumbs, board: ts.meta?.board, pends: ts.meta?.pends}
  }

  function saveEditorModel(id: string, patch: {name?: string; registry?: Record<string, string>; groups?: any[]; cell?: {w: number; h: number}; iso?: boolean; board?: any; pends?: any}) {
    const ts = get(id)
    if (!ts) return
    if (typeof patch.name === 'string' && patch.name.trim()) ts.name = patch.name.trim()
    ts.meta = {
      registry: patch.registry ? {...patch.registry} : ts.meta?.registry,
      groups: Array.isArray(patch.groups) ? cloneDeep(patch.groups) : ts.meta?.groups,
      cell: patch.cell || ts.meta?.cell,
      iso: patch.iso !== undefined ? patch.iso : ts.meta?.iso,
      board: patch.board !== undefined ? patch.board : ts.meta?.board,
      pends: patch.pends !== undefined ? patch.pends : ts.meta?.pends,
    }
    list.value = [...list.value]
    write()
  }

  function removeTile(tilesetId: string, key: string) {
    const ts = get(tilesetId)
    if (!ts) return
    ts.tiles = ts.tiles.filter(t => t.key !== key)
    list.value = [...list.value]
    write()
  }

  function syncEditedArt(ed: EditorData, thumb?: string): boolean {
    if (!ed?.id) return false
    ensureLoaded()
    let changed = false
    for (const ts of list.value) {
      const tile = ts.tiles.find(t => t.ed.id === ed.id)
      if (!tile) continue
      tile.ed = cloneDeep(ed)
      tile.thumb = thumb || edToThumb(ed)
      if (ed.name) tile.name = ed.name
      changed = true
    }
    if (changed) { list.value = [...list.value]; write() }
    return changed
  }

  function findTileEd(id: string): EditorData | null {
    for (const ts of list.value) {
      const t = ts.tiles.find(x => String(x.ed.id) === String(id))
      if (t) return cloneDeep(t.ed)
    }
    return null
  }

  function stageForEditor(tile: LocalTile): string {
    if (typeof localStorage !== 'undefined') {
      try {
        const ws = JSON.parse(localStorage.getItem('workspaces') || '{}')
        ws[tile.ed.id] = tile.ed
        localStorage.setItem('workspaces', JSON.stringify(ws))
      } catch { /* ignore */ }
    }
    return tile.ed.id
  }

  async function syncToCloud(): Promise<number> {
    if (syncing || !auth.isLogged) return 0
    ensureLoaded()
    if (!list.value.length) return 0
    syncing = true
    let done = 0
    try {
      for (const ts of [...list.value]) {
        try {
          const cloud = await useNativeFetch<any>('/coloring/tilesets/', {
            method: 'POST',
            body: {name: ts.name, meta: {registry: {}, cell: ts.meta?.cell || {w: 16, h: 16}, groups: [{id: 'g0', name: 'Tiles', kind: 'group', tiles: []}]}},
          })
          let localFailed = 0
          const localSlugs = new Set(ts.tiles.map(t => t.ed.id))
          const slugMap: Record<string, string> = {}
          for (const tile of ts.tiles) {
            try {
              const page = await useNativeFetch<any>('/coloring/shared-pages/', {
                method: 'POST',
                body: {
                  name: tile.ed.name || 'Tile', desc: '', tags: [],
                  width: tile.ed.width, height: tile.ed.height,
                  colors: tile.ed.colors, layers: tile.ed.layers,
                  map_numbers: layers2MapNumbers(tile.ed),
                  is_template: true, is_public: false, is_tile: true, meta: {},
                },
              })
              await useNativeFetch(`/coloring/tilesets/${cloud.id_string}/add-tile/`, {
                method: 'POST', body: {page_id: page.id},
              })
              if (page?.id_string) slugMap[tile.ed.id] = page.id_string
            } catch { localFailed++ }
          }
          for (const slug of Object.values(ts.meta?.registry || {})) {
            if (localSlugs.has(slug)) continue
            try {
              await useNativeFetch(`/coloring/tilesets/${cloud.id_string}/add-tile/`, {
                method: 'POST', body: {page_id_string: slug},
              })
            } catch { /* keep going — not a local loss */ }
          }
          if (!localFailed) {
            const remapped: Record<string, string> = {}
            if (ts.meta?.registry) {
              for (const [tid, slug] of Object.entries(ts.meta.registry)) {
                remapped[tid] = slugMap[slug] || slug
              }
            } else {
              for (const t of ts.tiles) {
                if (t.tid != null && slugMap[t.ed.id]) remapped[String(t.tid)] = slugMap[t.ed.id]!
              }
            }
            await useNativeFetch(`/coloring/tilesets/${cloud.id_string}/`, {
              method: 'PATCH',
              body: {
                meta: {
                  registry: remapped,
                  cell: ts.meta?.cell || {w: 16, h: 16},
                  iso: !!ts.meta?.iso,
                  groups: Array.isArray(ts.meta?.groups) && ts.meta!.groups!.length
                      ? ts.meta!.groups
                      : [{id: 'g0', name: 'Tiles', kind: 'group', tiles: ts.tiles.map(t => t.tid).filter(v => v != null)}],
                  ...(ts.meta?.board !== undefined ? {board: ts.meta.board} : {}),
                },
              },
            }).catch(() => { /* meta is a nicety; the tiles themselves are safe */ })
            remove(ts.id)
            done++
          }
        } catch { /* tileset create failed → keep local for a later retry */ }
      }
    } finally {
      syncing = false
    }
    return done
  }

  return {list, reload, get, create, remove, addTile, removeTile, syncEditedArt, stageForEditor, findTileEd, syncToCloud, edToThumb, editorModel, saveEditorModel}
}
