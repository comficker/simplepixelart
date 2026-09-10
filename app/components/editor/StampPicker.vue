<script setup lang="ts">
import {toast} from 'vue-sonner'
import {debounce} from '~/helper/utils'
import {layers2MapNumbers} from '~/helper/canvas'
import type {LocalTile} from '~/composables/useLocalTilesets'

interface Source {
  kind: 'mine' | 'explore' | 'ts'
  title: string
  id?: string
  local?: boolean
}

interface Thumb {
  key: string
  name: string
  src: string
  slug?: string
  tile?: LocalTile
}

const store = useEditor()
const auth = useAuthStore()
const config = useRuntimeConfig()
const localTs = useLocalTilesets()

const sources = ref<Source[]>([])
const sourceIndex = ref(0)
const items = ref<Thumb[]>([])
const loading = ref(false)
const picking = ref(false)
const query = ref('')
const failedThumb = reactive<Record<string, boolean>>({})

const source = computed(() => sources.value[sourceIndex.value] || null)

function srcIcon(s: Source | null): string {
  if (!s) return 'icon-image'
  return s.kind === 'mine' ? 'icon-image' : s.kind === 'explore' ? 'icon-explore' : 'icon-grid'
}

const shown = computed(() => {
  if (source.value?.kind === 'explore') return items.value
  const term = query.value.trim().toLowerCase()
  if (!term) return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(term))
})

function artThumb(slug: string): string {
  return `${config.public.api}/coloring/files/art-original/${slug}.png`
}

async function loadSources() {
  const list: Source[] = []
  if (auth.isLogged) list.push({kind: 'mine', title: 'My arts'})
  list.push({kind: 'explore', title: 'Explore'})
  if (auth.isLogged) {
    try {
      const res = await useNativeFetch<{ results: any[] }>('/coloring/tilesets/', {
        params: {page_size: 100, ordering: '-updated'},
      })
      for (const t of res.results) {
        list.push({kind: 'ts', title: t.name || 'Untitled', id: t.id_string})
      }
    } catch {  }
  }
  for (const t of localTs.list.value) {
    list.push({kind: 'ts', title: t.name, id: t.id, local: true})
  }
  sources.value = list
  sourceIndex.value = 0
  await loadItems()
}

let loadRun = 0

async function loadItems() {
  const s = source.value
  if (!s) { items.value = []; return }
  const run = ++loadRun
  loading.value = true
  let list: Thumb[] = []
  try {
    if (s.kind === 'ts' && s.local) {
      const ts = localTs.get(String(s.id))
      list = (ts?.tiles || []).map(t => ({
        key: `lt:${s.id}:${t.key}`, name: t.name || 'Tile', src: t.thumb, tile: t,
      }))
    } else if (s.kind === 'ts') {
      const t = await useNativeFetch<any>(`/coloring/tilesets/${s.id}/`)
      const registry: Record<string, string> = t?.meta?.registry || {}
      list = Object.values(registry).map(slug => ({
        key: `art:${slug}`, name: String(slug), src: artThumb(String(slug)), slug: String(slug),
      }))
    } else if (s.kind === 'mine') {
      const res = await useNativeFetch<{ results: any[] }>('/coloring/shared-pages/', {
        params: {user: auth.logged?.username, page_size: 48, ordering: '-updated'},
      })
      list = (res.results || []).filter(r => r?.id_string).map(r => ({
        key: `art:${r.id_string}`, name: r.name || r.id_string, src: artThumb(r.id_string), slug: r.id_string,
      }))
    } else {
      const res = await useNativeFetch<{ results: any[] }>('/coloring/shared-pages/', {
        params: {
          status: 'public', has_pages: 1, page_size: 48,
          search: query.value.trim() || undefined,
        },
      })
      list = (res.results || []).filter(r => r?.id_string).map(r => ({
        key: `art:${r.id_string}`, name: r.name || r.id_string, src: artThumb(r.id_string), slug: r.id_string,
      }))
    }
  } catch {
    list = []
  }
  if (run !== loadRun) return
  items.value = list
  loading.value = false
}

function setSource(i: number) {
  if (i === sourceIndex.value) return
  sourceIndex.value = i
  query.value = ''
  loadItems()
}

const debouncedExplore = debounce(() => {
  if (source.value?.kind === 'explore') loadItems()
}, 350)

watch(query, () => {
  if (source.value?.kind === 'explore') debouncedExplore()
})

async function pick(it: Thumb) {
  if (picking.value) return
  if (store.stampData?.key === it.key) { store.setStamp(null); return }
  picking.value = true
  try {
    let colors: string[]
    let grid: Record<string, number>
    let w: number
    let h: number
    let name: string
    if (it.tile) {
      const ed = it.tile.ed
      colors = Array.isArray(ed.colors) ? ed.colors.map(String) : []
      grid = layers2MapNumbers(ed)
      w = Number(ed.width) || 0
      h = Number(ed.height) || 0
      name = ed.name || it.name
    } else {
      const p = await useNativeFetch<any>(`/coloring/shared-pages/${it.slug}/`)
      colors = Array.isArray(p.colors) ? p.colors.map(String) : []
      grid = (p.map_numbers && typeof p.map_numbers === 'object') ? p.map_numbers : {}
      w = Number(p.width) || 0
      h = Number(p.height) || 0
      name = p.name || it.name
    }
    if (!w || !h) { toast.error('That art has no pixels to brush'); return }
    const cells: (string | null)[][] = Array.from({length: h}, () => Array(w).fill(null))
    for (const k in grid) {
      const hex = colors[grid[k]!]
      if (!hex) continue
      const [px, py] = k.split('_').map(Number)
      if (px! >= 0 && px! < w && py! >= 0 && py! < h) cells[py!]![px!] = hex
    }
    store.setStamp({key: it.key, name, w, h, cells})
  } catch {
    toast.error('Could not load that art')
  } finally {
    picking.value = false
  }
}

onMounted(loadSources)
watch(() => auth.isLogged, () => loadSources())
</script>

<template>
  <Widget class="stp" title="Brush art">
    <template #ctl>
      <ui-dropdown-menu>
        <button type="button" class="widget-ctl-btn" :title="`Source: ${source?.title || ''}`">
          <span class="icon" :class="srcIcon(source)"/>
          <span class="widget-ctl-name">{{ source?.title || 'Source' }}</span>
          <span class="icon icon-chevron-down"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button
                v-for="(s, i) in sources"
                :key="`${s.kind}:${s.id || ''}`"
                class="file-menu-item"
                @click="setSource(i)"
            >
              <span class="icon" :class="srcIcon(s)"/>
              <span class="file-menu-label">
                <span class="widget-ctl-name">{{ s.title }}</span>
                <span v-if="i === sourceIndex" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>
    </template>

    <div class="stp-body">
      <label class="stp-search">
        <span class="icon icon-search"/>
        <input v-model="query" type="search" placeholder="Search…">
      </label>

      <div v-if="loading && !shown.length" class="stp-thumbs">
        <div v-for="i in 8" :key="`s-${i}`" class="stp-thumb skeleton"/>
      </div>
      <div v-else-if="shown.length" class="stp-thumbs no-scrollbar">
        <button
            v-for="it in shown"
            :key="it.key"
            type="button"
            class="stp-thumb"
            :class="{active: store.stampData?.key === it.key}"
            :title="it.name"
            @click="pick(it)"
        >
          <img
              v-if="!failedThumb[it.key]"
              :src="it.src"
              alt=""
              loading="lazy"
              decoding="async"
              @error="failedThumb[it.key] = true"
          />
          <span v-else class="stp-thumb-empty"><span class="icon icon-image"/></span>
        </button>
      </div>
      <p v-else class="stp-empty">
        {{ query ? `Nothing matches “${query}”.` : 'Nothing here yet.' }}
      </p>
    </div>
  </Widget>
</template>

<style scoped>
.stp-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stp-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 2rem;
  padding: 0 0.5rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
}

.stp-search:focus-within {
  border-color: var(--primary);
}

.stp-search .icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

.stp-search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  font-size: var(--text-xs);
  color: var(--foreground);
}

.stp-thumbs {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-bottom: 2px;
}

.stp-thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: transparent;
  image-rendering: pixelated;
  cursor: pointer;
  transition: border-color var(--transition);
}

@media (min-width: 768px) {
  .stp-body {
    container-type: inline-size;
  }

  .stp-thumbs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    max-height: calc(3 * (100cqw - 3 * var(--space-2)) / 4 + 2 * var(--space-2));
    overflow-x: visible;
    overflow-y: auto;
  }

  .stp-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
  }
}

.stp-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.stp-thumb.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.stp-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.stp-thumb-empty .icon {
  width: 40%;
  height: 40%;
}

.stp-empty {
  font-size: var(--text-2xs);
  color: var(--muted);
  padding: 0.25rem 0;
}
</style>
