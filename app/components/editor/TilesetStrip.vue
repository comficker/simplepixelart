<script setup lang="ts">
import {toast} from 'vue-sonner'
import type {EditorData} from '~/types'
import type {LocalTile} from '~/composables/useLocalTilesets'

interface Ts {
  id: number | string    // cloud pk, or 'local:<uuid>' for guest tilesets
  id_string: string
  title: string
  local?: boolean
}

// A display tile: cloud (thumb by slug) or local (dataURL + pixel data).
interface DispTile {
  key: string | number
  src: string
  active: boolean
  local: boolean
  selectId?: string      // cloud: the id_string to open
  tile?: LocalTile       // local: the stored tile (staged into the editor on click)
}

const props = defineProps<{
  activeId?: number | string       // the art open in the editor (highlight)
  activeSaved?: boolean            // current art is a saved cloud art
  activeData?: EditorData | null   // current art data (for a guest "Add current art")
  activeTilesetId?: string | null  // the tileset this editor session belongs to
}>()

const emit = defineEmits<{ select: [idString: string, tilesetId: string]; 'tileset-change': [id: string] }>()

const config = useRuntimeConfig()
const auth = useAuthStore()
const localTs = useLocalTilesets()

const tilesets = ref<Ts[]>([])              // signed-in → cloud, guest → local
const selectedId = ref<number | string | null>(null)
// The tileset the current art actually belongs to. When set, the picker acts as
// "move this art": choosing another tileset reassigns the art to it.
const boundId = ref<number | string | null>(null)
const moving = ref(false)
const tiles = ref<DispTile[]>([])
const loadingItems = ref(false)
const failedThumb = reactive<Record<string, boolean>>({})

// Picker dropdown (teleported, Pinterest-style — same as the Tileset Slicer).
const pickerRoot = ref<HTMLElement | null>(null)
const pickerPanel = ref<HTMLElement | null>(null)
const pickerOpen = ref(false)
const pickerRect = ref({top: 0, left: 0, width: 0})
const showNew = ref(false)
const newTitle = ref('')
const creating = ref(false)

const selectedTs = computed(() => tilesets.value.find(c => c.id === selectedId.value) || null)
const selectedTitle = computed(() => selectedTs.value?.title || 'Choose tileset')

function cloudThumb(slug: string): string {
  return `${config.public.api}/coloring/files/art-original/${slug}.png`
}

async function loadTilesets() {
  if (!auth.isLogged) {
    // Guest: mirror the local tileset library.
    tilesets.value = localTs.list.value.map(t => ({id: t.id, id_string: t.id, title: t.name, local: true}))
    await bindToActive()
    return
  }
  try {
    // Tileset list is owner-only server-side, so no ?mine needed.
    const res = await useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {
      params: {page_size: 100, ordering: '-updated'},
    })
    tilesets.value = res.results.map(c => ({id: c.id, id_string: c.id_string, title: c.name || 'Untitled'}))
  } catch {
    /* non-fatal */
  }
  await bindToActive()
}

// id_string of the currently bound tileset (to compare against the prop).
function boundIdString(): string | null {
  if (boundId.value == null) return null
  const t = tilesets.value.find(x => x.id === boundId.value)
  return t ? (t.id_string || String(t.id)) : String(boundId.value)
}

// Follow the active board's tileset (`activeTilesetId` = its meta.tileset.id):
// show that tileset + its tiles in the widget. Rebinds when the active board
// switches to an art from another tileset; clears to "None" for an art that
// belongs to no tileset.
async function bindToActive() {
  const want = props.activeTilesetId || null
  if (want === boundIdString()) return
  if (!want) { boundId.value = null; selectedId.value = null; return }
  let match = tilesets.value.find(t => t.id_string === want || String(t.id) === want)
  // Owned tileset beyond the first 100 (or just not in the list yet) — fetch it.
  if (!match && auth.isLogged && !want.startsWith('local:')) {
    try {
      const t = await useNativeFetch<any>(`/coloring/tilesets/${want}/`)
      match = {id: t.id, id_string: t.id_string, title: t.name || 'Untitled'}
      tilesets.value = [match, ...tilesets.value]
    } catch { /* not owned / gone — leave unbound */ }
  }
  if (match) { boundId.value = match.id; selectedId.value = match.id }
  else { boundId.value = null; selectedId.value = null }
}

async function loadTiles() {
  const ts = selectedTs.value
  if (!ts) { tiles.value = []; return }
  if (ts.local) {
    const lt = localTs.get(String(ts.id))
    tiles.value = (lt?.tiles || []).slice().reverse().map(t => ({
      key: t.key, src: t.thumb,
      active: props.activeId != null && String(t.ed.id) === String(props.activeId),
      local: true, tile: t,
    }))
    return
  }
  loadingItems.value = true
  try {
    const t = await useNativeFetch<any>(`/coloring/tilesets/${ts.id_string}/`)
    const registry: Record<string, string> = t?.meta?.registry || {}
    // Newest first — registry preserves insertion order (ascending id).
    tiles.value = Object.entries(registry).map(([id, slug]) => ({
      key: Number(id),
      src: cloudThumb(String(slug)),
      active: props.activeId != null && String(slug) === props.activeId,
      local: false,
      selectId: String(slug),
    })).reverse()
  } catch {
    tiles.value = []
  } finally {
    loadingItems.value = false
  }
}

watch(selectedId, loadTiles)
// Follow the active board: rebind whenever its tileset changes (incl. to none).
watch(() => props.activeTilesetId, () => { bindToActive() })
// Switching the active board (outside the strip) should move the highlight AND
// bring the matching tile into view — the reverse of clicking a tile to focus
// its board.
const thumbsWrap = ref<HTMLElement | null>(null)
watch(() => props.activeId, () => {
  for (const t of tiles.value) {
    const openId = t.selectId ?? t.tile?.ed.id
    t.active = props.activeId != null && String(openId) === String(props.activeId)
  }
  nextTick(() => {
    thumbsWrap.value?.querySelector('.cstrip-thumb.active')
      ?.scrollIntoView({block: 'nearest', inline: 'nearest'})
  })
})

// The id_string of the tileset currently shown in the widget — passed along so
// a freshly-opened tile stays bound to it.
function shownTilesetIdString(): string {
  const t = selectedTs.value
  return t ? (t.id_string || String(t.id)) : ''
}

function openTile(item: DispTile) {
  const ts = shownTilesetIdString()
  if (item.local && item.tile) emit('select', localTs.stageForEditor(item.tile), ts)
  else if (item.selectId) emit('select', item.selectId, ts)
}

// The picker IS the art↔tileset relation. Choosing a tileset adds the current
// art to it (or moves it from its old one); choosing "None" detaches it. Every
// change writes the membership back onto the art (`tileset-change` → the art's
// meta.tileset), so it survives a refresh and can't be double-added.
async function pick(id: number | string | null) {
  pickerOpen.value = false
  showNew.value = false
  const cur = boundId.value
  if (id === cur) { selectedId.value = id ?? null; return }   // already there
  if (moving.value) return
  moving.value = true
  try {
    const from = cur != null ? tilesets.value.find(t => t.id === cur) : null
    const to = id != null ? tilesets.value.find(t => t.id === id) : null

    // Detach — "None" while the art is in a tileset.
    if (id == null) {
      if (from) await removeFromTileset(from)
      emit('tileset-change', '')           // clears the art's meta.tileset
      boundId.value = null
      selectedId.value = null
      if (from) toast.success(`Removed from “${from.title}”`)
      return
    }
    if (!to) return

    // Move: drop it from the old tileset first (best-effort), then add.
    if (from && from.id !== to.id) await removeFromTileset(from)
    if (!(await addToTileset(to))) return   // guarded (unsaved cloud art, etc.)
    emit('tileset-change', String(to.id_string || to.id))
    boundId.value = to.id
    selectedId.value = to.id
    toast.success(from ? `Moved to “${to.title}”` : `Added to “${to.title}”`)
  } finally {
    moving.value = false
  }
}

// Add the current art to a tileset. Guest → local library (idempotent);
// signed-in → cloud registry (keyed by page id, so re-add is a no-op too).
async function addToTileset(to: Ts): Promise<boolean> {
  if (to.local) {
    const ed = props.activeData
    if (!ed) { toast.error('Nothing to add yet'); return false }
    localTs.addTile(String(to.id), {name: ed.name, ed, thumb: localTs.edToThumb(ed)})
    return true
  }
  const slug = props.activeId
  if (!slug || !props.activeSaved) { toast.error('Save the art first, then add it'); return false }
  try {
    await useNativeFetch(`/coloring/tilesets/${to.id_string}/add-tile/`, {
      method: 'POST', body: {page_id_string: slug},
    })
    return true
  } catch {
    toast.error('Could not add the art')
    return false
  }
}

// Remove the current art from a tileset (best-effort — a missing tile is fine).
async function removeFromTileset(from: Ts): Promise<void> {
  if (from.local) {
    const ed = props.activeData
    const oldTs = localTs.get(String(from.id))
    const tile = oldTs?.tiles.find(t => t.ed.id === ed?.id)
    if (tile) localTs.removeTile(String(from.id), tile.key)
    return
  }
  const slug = props.activeId
  if (!slug) return
  try {
    await useNativeFetch(`/coloring/tilesets/${from.id_string}/remove-tile/`, {
      method: 'POST', body: {page_id_string: slug},
    })
  } catch { /* not there — treat as removed */ }
}

function togglePicker() {
  if (pickerOpen.value) { pickerOpen.value = false; showNew.value = false; return }
  // Drop below the cog, but align the panel to the widget's LEFT edge and span
  // its full width (the cog sits at the top-right of the widget).
  const cog = pickerRoot.value?.getBoundingClientRect()
  const host = (pickerRoot.value?.closest('.widget') as HTMLElement | null)?.getBoundingClientRect()
  if (cog) {
    pickerRect.value = {
      top: cog.bottom + 4,
      left: host?.left ?? cog.left,
      width: host?.width ?? Math.max(180, cog.width),
    }
  }
  pickerOpen.value = true
}

function closePicker() {
  pickerOpen.value = false
  showNew.value = false
}

async function createTileset() {
  const title = newTitle.value.trim()
  if (!title || creating.value) return
  creating.value = true
  try {
    if (auth.isLogged) {
      const c = await useNativeFetch<any>('/coloring/tilesets/', {
        method: 'POST',
        body: {name: title, meta: {registry: {}, groups: [{id: 'g0', name: 'Tiles', kind: 'group', tiles: []}]}},
      })
      tilesets.value.unshift({id: c.id, id_string: c.id_string, title: c.name || title})
      selectedId.value = c.id
    } else {
      const t = localTs.create(title)
      tilesets.value.unshift({id: t.id, id_string: t.id, title: t.name, local: true})
      selectedId.value = t.id
    }
    newTitle.value = ''
    showNew.value = false
    pickerOpen.value = false
  } catch {
    /* ignore */
  } finally {
    creating.value = false
  }
}

function onOutside(e: MouseEvent) {
  if (!pickerOpen.value) return
  const t = e.target as Node
  if (pickerRoot.value?.contains(t) || pickerPanel.value?.contains(t)) return
  closePicker()
}

function onMove(e?: Event) {
  if (!pickerOpen.value) return
  if (e?.target && pickerPanel.value?.contains(e.target as Node)) return
  closePicker()
}

onMounted(() => {
  loadTilesets()
  // Signed in with leftover guest tilesets → upload them, then refresh.
  if (auth.isLogged) localTs.syncToCloud().then(n => { if (n) loadTilesets() })
  document.addEventListener('click', onOutside)
  window.addEventListener('scroll', onMove, true)
  window.addEventListener('resize', onMove)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onOutside)
  window.removeEventListener('scroll', onMove, true)
  window.removeEventListener('resize', onMove)
})
// On sign-in, push any local (guest) tilesets to the cloud, then reload.
watch(() => auth.isLogged, async (v) => {
  if (v) {
    await localTs.syncToCloud()
    selectedId.value = null
  }
  await loadTilesets()
})

// Drop a deleted art from the shown list without refetching.
function removeItem(idOrString: string | number) {
  tiles.value = tiles.value.filter(r => r.selectId !== idOrString && r.key !== idOrString)
}

// Re-fetch the current tileset's tiles (e.g. after adding one).
function refresh() {
  loadTiles()
}

// Another tile in the shown tileset (used to open a sibling after a delete).
function siblingId(excludeIdStr?: string | number): string | null {
  const sib = tiles.value.find(t => {
    const openId = t.selectId ?? t.tile?.ed.id
    return openId !== excludeIdStr && t.key !== excludeIdStr
  })
  if (!sib) return null
  if (sib.local && sib.tile) return localTs.stageForEditor(sib.tile)
  return sib.selectId || null
}

defineExpose({removeItem, refresh, siblingId})
</script>

<template>
  <Widget class="cstrip" title="Tileset">
    <template #ctl>
      <div ref="pickerRoot" class="cstrip-pick">
        <button
            class="cstrip-pick-btn"
            type="button"
            :class="{open: pickerOpen}"
            :aria-expanded="pickerOpen"
            :title="`Choose tileset (${selectedTitle})`"
            @click="togglePicker"
        >
          <span class="icon icon-cog"/>
        </button>

        <Teleport to="body">
          <div
              v-if="pickerOpen"
              ref="pickerPanel"
              class="cstrip-panel"
              :style="{top: pickerRect.top + 'px', left: pickerRect.left + 'px', width: pickerRect.width + 'px'}"
              @click.stop
          >
            <div class="cstrip-panel-head">{{ boundId != null ? "Art's tileset" : 'Add to a tileset' }}</div>
            <ul class="cstrip-panel-list no-scrollbar">
              <li>
                <button class="cstrip-opt" :class="{active: selectedId == null}" @click="pick(null)">
                  <span class="cstrip-opt-name">None</span>
                  <span v-if="selectedId == null" class="icon icon-check"/>
                </button>
              </li>
              <li v-for="c in tilesets" :key="c.id">
                <button class="cstrip-opt" :class="{active: selectedId === c.id}" @click="pick(c.id)">
                  <span class="cstrip-opt-name">{{ c.title }}</span>
                  <span v-if="selectedId === c.id" class="icon icon-check"/>
                </button>
              </li>
              <li v-if="!tilesets.length" class="cstrip-opt-empty">No tilesets yet</li>
            </ul>
            <div class="cstrip-panel-create">
              <div v-if="showNew" class="cstrip-new">
                <input
                    v-model="newTitle"
                    class="cstrip-new-input"
                    placeholder="Tileset name"
                    maxlength="120"
                    @keydown.enter="createTileset"
                    @keydown.esc="showNew = false"
                >
                <div class="cstrip-new-actions">
                  <button class="btn" @click="showNew = false">Cancel</button>
                  <button class="btn primary" :disabled="!newTitle.trim() || creating" @click="createTileset">
                    {{ creating ? '…' : 'Create' }}
                  </button>
                </div>
              </div>
              <button v-else class="cstrip-create-btn" @click="showNew = true">
                <span class="icon icon-plus"/><span>Create tileset</span>
              </button>
            </div>
          </div>
        </Teleport>
      </div>
    </template>

    <div class="cstrip-body">
      <div v-if="loadingItems && !tiles.length" class="cstrip-thumbs">
        <div v-for="i in 8" :key="`s-${i}`" class="cstrip-thumb skeleton"/>
      </div>
      <div v-else-if="tiles.length" ref="thumbsWrap" class="cstrip-thumbs no-scrollbar">
        <button
            v-for="item in tiles"
            :key="item.key"
            type="button"
            class="cstrip-thumb"
            :class="{active: item.active}"
            :title="item.active ? 'Editing now' : 'Click to edit'"
            @click="openTile(item)"
        >
          <img
              v-if="!failedThumb[item.key]"
              :src="item.src"
              alt=""
              loading="lazy"
              decoding="async"
              @error="failedThumb[item.key] = true"
          />
          <span v-else class="cstrip-thumb-empty"><span class="icon icon-image"/></span>
        </button>
      </div>
      <p v-else class="cstrip-empty">
        {{ selectedId == null ? 'This art isn’t in a tileset. Pick one to add it.' : 'No tiles in this tileset yet.' }}
      </p>
    </div>
  </Widget>
</template>

<style scoped>
/* ===== Picker (in widget header) ===== */
.cstrip-pick {
  display: inline-flex;
}

.cstrip-pick-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  transition: color var(--transition);
}

.cstrip-pick-btn .icon {
  width: 15px;
  height: 15px;
}

.cstrip-pick-btn:hover,
.cstrip-pick-btn.open {
  color: var(--primary);
}

.cstrip-panel {
  position: fixed;
  z-index: 1000;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-modal, 0 8px 24px -12px rgba(0, 0, 0, 0.22));
  overflow: hidden;
}

.cstrip-panel-head {
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--muted);
}

.cstrip-panel-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 0 var(--space-1);
}

.cstrip-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .cstrip-opt:hover {
    background: var(--surface-2);
  }
}

.cstrip-opt.active {
  color: var(--primary);
  font-weight: 600;
}

.cstrip-opt .icon {
  flex-shrink: 0;
  width: 0.85em;
  height: 0.85em;
  color: var(--primary);
}

.cstrip-opt-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cstrip-opt-empty {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  color: var(--muted);
}

.cstrip-panel-create {
  padding: var(--space-1);
  border-top: 1px solid var(--border);
}

.cstrip-create-btn {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--foreground);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition);
}

.cstrip-create-btn .icon {
  width: 0.9em;
  height: 0.9em;
  color: var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .cstrip-create-btn:hover {
    background: var(--surface-2);
  }
}

.cstrip-new {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cstrip-new-input {
  width: 100%;
  height: 2.25rem;
  padding: 0 0.5rem;
  font-size: var(--text-sm);
  color: var(--foreground);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.cstrip-new-input:focus {
  border-color: var(--primary);
  outline: none;
}

.cstrip-new-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

/* ===== Items ===== */
.cstrip-body {
  display: flex;
  flex-direction: column;
}

/* Mobile: one horizontal row of fixed 64px tiles, scroll if they overflow. */
.cstrip-thumbs {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: 2px;
}

.cstrip-thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  /* Faint divider between items (not a highlight frame). */
  border: 1px solid color-mix(in oklab, var(--border) 45%, transparent);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: transparent;
  image-rendering: pixelated;
  cursor: pointer;
  transition: opacity var(--transition);
}

/* Desktop sidebar: 4 tiles per row, filling the column width. */
@media (min-width: 768px) {
  .cstrip-thumbs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    overflow-x: visible;
  }

  .cstrip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
}

.cstrip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cstrip-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.cstrip-thumb-empty .icon {
  width: 40%;
  height: 40%;
}

/* The art currently open in the editor — dimmed, no highlight border. */
.cstrip-thumb.active {
  opacity: 0.4;
}

.cstrip-empty {
  font-size: var(--text-2xs);
  color: var(--muted);
  padding: 0.25rem 0;
}
</style>
