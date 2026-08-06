import {ref} from 'vue'
import type {EditorData} from '~/types'
import {cloneDeep, generateUUID} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'

// Guest (signed-out) tilesets live entirely in localStorage: the picker in the
// Tileset Slicer and the editor's tileset strip read/write here, and everything
// is pushed to the cloud once the user signs in (then the local copy is dropped).
const KEY = 'sp_local_tilesets'

export interface LocalTile {
  key: string        // unique within the tileset
  tid: number        // stable numeric id — the tileset-editor registry key
  name: string
  thumb: string      // dataURL, for the strip/picker preview
  ed: EditorData     // full pixel data — replayable in the editor + uploadable
}

export interface LocalTileset {
  id: string         // 'local:<uuid>'
  name: string
  tiles: LocalTile[] // local-pixel tiles (from the slicer / editor strip)
  created: number
  // The full tileset-editor state saved back here — the ONE source of truth for
  // a guest tileset (also what /work + the load browser read). `registry` may
  // reference cloud slugs too; `tiles` supplies the pixel data for local ones.
  meta?: {
    registry?: Record<string, string>
    groups?: any[]
    cell?: { w: number; h: number }
    iso?: boolean          // tiles are isometric diamonds (drives the tilemap's mode)
    board?: any
    pends?: any
  }
}

// Shared across every consumer so the slicer, the strip and the login-sync all
// see the same list. Client-only (guarded); the server never populates it.
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
  // Backfill stable numeric tids on tiles saved before the editor bridge.
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

// Paint an EditorData onto a 1:1 canvas → PNG dataURL (fallback thumbnail when
// the caller hasn't already rendered one).
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
    // Idempotent: the same art (matched by ed.id) is never duplicated — update
    // the existing tile in place so a re-add just refreshes it.
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
    list.value = [...list.value]   // reassign so watchers/computed refresh
    write()
    return result
  }

  // ── Tileset-editor bridge ──────────────────────────────────────────
  // Local tiles have no cloud slug, so the editor renders them from their
  // stored thumbnails. `ed.id` doubles as the registry "slug"; the editor
  // pre-caches an <img> from `thumbs[slug]` under that key.
  function editorModel(id: string) {
    const ts = get(id)
    if (!ts) return null
    // Thumbnails for local-pixel tiles, keyed by their slug (ed.id).
    const thumbs: Record<string, string> = {}
    for (const t of ts.tiles) thumbs[t.ed.id] = t.thumb
    // Prefer the editor's saved registry (has cloud slugs too); else derive it
    // from the local tiles (fresh entry that's only been fed by the slicer).
    const registry: Record<string, string> = ts.meta?.registry
      ? {...ts.meta.registry}
      : Object.fromEntries(ts.tiles.filter(t => t.tid != null).map(t => [String(t.tid), t.ed.id]))
    const groups = Array.isArray(ts.meta?.groups) && ts.meta!.groups!.length
      ? cloneDeep(ts.meta!.groups)
      : [{id: 'g0', name: 'Tiles', kind: 'group', tiles: ts.tiles.map(t => t.tid).filter(v => v != null)}]
    const cell = ts.meta?.cell || {w: 16, h: 16}
    return {id: ts.id, name: ts.name, registry, groups, cell, iso: !!ts.meta?.iso, thumbs, board: ts.meta?.board, pends: ts.meta?.pends}
  }

  // Persist the editor's full state back to the local entry (the source of truth).
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

  // The pixel editor saves an art to `workspaces`, not here — so when a guest
  // edits an art that's a tile in a local tileset, push the new pixels + a fresh
  // thumbnail back into every tileset that references it (matched by ed.id).
  // Keeps the tileset editor / ?tileset= reload in sync with edits. No-op (and
  // no thumbnail render) when the art isn't a tile anywhere.
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

  // Find a tile's EditorData by its ed.id across every local tileset. Lets the
  // editor open a guest tile straight from a /work link (or any id lookup)
  // without it having been staged into `workspaces` first.
  function findTileEd(id: string): EditorData | null {
    for (const ts of list.value) {
      const t = ts.tiles.find(x => String(x.ed.id) === String(id))
      if (t) return cloneDeep(t.ed)
    }
    return null
  }

  // Stage a local tile into the editor's local workspace so store.load(id)
  // opens it — the same code path cloud tiles use via their id_string.
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

  // On sign-in: upload each local tileset (+ its tiles) to the cloud, then drop
  // the local copy. Best-effort per item — a failed upload stays local to retry.
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
          // Local-pixel tiles must survive — losing one is permanent data loss,
          // so the local copy is only dropped when EVERY local tile uploaded.
          let localFailed = 0
          const localSlugs = new Set(ts.tiles.map(t => t.ed.id))
          const slugMap: Record<string, string> = {}   // local ed.id → cloud id_string
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
          // Cloud-slug tiles (e.g. public art added in the editor) — best-effort
          // attach; a failure here isn't data loss (the art still exists in cloud).
          for (const slug of Object.values(ts.meta?.registry || {})) {
            if (localSlugs.has(slug)) continue
            try {
              await useNativeFetch(`/coloring/tilesets/${cloud.id_string}/add-tile/`, {
                method: 'POST', body: {page_id_string: slug},
              })
            } catch { /* keep going — not a local loss */ }
          }
          if (!localFailed) {
            // Carry the editor state over — groups reference stable tids, the
            // registry's LOCAL slugs remap to the freshly created cloud slugs.
            // Best-effort: tiles are already safe in the cloud either way.
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
