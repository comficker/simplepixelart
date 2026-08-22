<script setup lang="ts">
import type {APIResponse, Collection, EditorData, SharedPage} from "~/types";
import {getStorageItem} from "~/helper/utils";
import {loadWorkspaceFull, saveWorkspaceFull, clearWorkspaceFull} from "~/helper/workspaceSnapshot";
import {toast} from "vue-sonner";

type Tab = 'artworks' | 'collections' | 'worlds' | 'tilesets'

type WorkItem = (SharedPage | EditorData) & {
  id: string | number
  id_string?: string
  name?: string
  width?: number
  height?: number
  status?: string
  updated?: string
  has_image?: boolean
  is_tile?: boolean
}

interface CollectionItem extends Collection {
  status: string
  type: string
  items: SharedPage[] | number[]
  featured: any[][]
}

const auth = useAuthStore()
const config = useRuntimeConfig()
const route = useRoute()
const router = useRouter()

const TABS: Tab[] = ['artworks', 'tilesets', 'worlds', 'collections']
const tab = ref<Tab>(TABS.includes(route.query.tab as Tab) ? route.query.tab as Tab : 'artworks')

const TAB_META: Record<Tab, { label: string; icon: string; auth?: boolean }> = {
  artworks: {label: 'Artworks', icon: 'icon-grid'},
  tilesets: {label: 'Tilesets', icon: 'icon-select'},
  worlds: {label: 'Worlds', icon: 'icon-grid'},
  collections: {label: 'Collections', icon: 'icon-rhombus', auth: true},
}
const activeTabMeta = computed(() => TAB_META[tab.value])

function setTab(t: Tab) {
  if (TAB_META[t].auth && !auth.isLogged) return
  tab.value = t
}

watch(tab, (v) => {
  const q = {...route.query}
  if (v === 'artworks') delete q.tab
  else q.tab = v
  router.replace({query: q})
})

const selectMode = ref(false)
const selectedIds = ref<Set<string | number>>(new Set())
const confirmingBulk = ref(false)
let bulkConfirmTimer: ReturnType<typeof setTimeout> | null = null
const bulkDeleting = ref(false)
let lastSelectedId: string | number | null = null

const selectedCount = computed(() => selectedIds.value.size)

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) deselectAll()
}

function deselectAll() {
  selectedIds.value = new Set()
  confirmingBulk.value = false
  lastSelectedId = null
  if (bulkConfirmTimer) clearTimeout(bulkConfirmTimer)
}

function toggleSelected(id: string | number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
  confirmingBulk.value = false
}

const visibleIds = computed<(string | number)[]>(() => {
  if (tab.value === 'artworks') return filteredWorks.value.map(w => w.id)
  if (tab.value === 'collections') return pagedColls.value.map(c => c.id as number)
  if (tab.value === 'worlds') return pagedWorlds.value.map(w => w.id)
  return pagedTilesets.value.map(t => t.id)
})

function onSelectClick(e: MouseEvent, id: string | number) {
  if (e.shiftKey && lastSelectedId != null && lastSelectedId !== id) {
    const ids = visibleIds.value
    const a = ids.indexOf(lastSelectedId)
    const b = ids.indexOf(id)
    if (a !== -1 && b !== -1) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const next = new Set(selectedIds.value)
      for (let i = lo; i <= hi; i++) next.add(ids[i]!)
      selectedIds.value = next
      confirmingBulk.value = false
      lastSelectedId = id
      return
    }
  }
  toggleSelected(id)
  lastSelectedId = id
}

watch(tab, () => {
  selectMode.value = false
  deselectAll()
})

async function bulkDelete() {
  if (!selectedCount.value || bulkDeleting.value) return
  if (!confirmingBulk.value) {
    confirmingBulk.value = true
    if (bulkConfirmTimer) clearTimeout(bulkConfirmTimer)
    bulkConfirmTimer = setTimeout(() => { confirmingBulk.value = false }, 3000)
    return
  }
  if (bulkConfirmTimer) clearTimeout(bulkConfirmTimer)
  confirmingBulk.value = false
  bulkDeleting.value = true
  const ids = new Set(selectedIds.value)
  try {
    if (tab.value === 'artworks') {
      await Promise.all([...ids].map(async (id) => {
        if (auth.isLogged && typeof id === 'number') {
          await useNativeFetch(`/coloring/shared-pages/${id}/`, {method: 'DELETE'})
        }
        await purgeLocalArt(id)
        purgeLocalTile(id)
      }))
      workspaces.value = workspaces.value.filter(w => !ids.has(w.id))
      if (!workspaces.value.length && workPage.value > 1) workPage.value--
      else if (auth.logged?.id) fetchWorks()
    } else if (tab.value === 'collections') {
      await Promise.all([...ids].map(id => useNativeFetch(`/coloring/collections/${id}/`, {method: 'DELETE'})))
      collections.value = collections.value.filter(c => !ids.has(c.id!))
    } else if (tab.value === 'worlds') {
      if (auth.isLogged) {
        const rows = worldsList.value.filter(w => ids.has(w.id))
        await Promise.all(rows.map(w => useNativeFetch(`/coloring/worlds/${w.id_string}/`, {method: 'DELETE'})))
      } else {
        try { localStorage.removeItem(FREESTYLE_KEY) } catch { /* ignore */ }
      }
      worldsList.value = worldsList.value.filter(w => !ids.has(w.id))
    } else {
      const rows = tilesetsList.value.filter(t => ids.has(t.id))
      if (auth.isLogged) {
        await Promise.all(rows.map(t => useNativeFetch(`/coloring/tilesets/${t.id_string}/`, {method: 'DELETE'})))
        const slugs = new Set(rows.map(t => t.id_string))
        worldsList.value = worldsList.value.filter(w => !slugs.has(w.tileset_id_string))
      } else {
        rows.forEach(t => localTs.remove(String(t.id)))
      }
      tilesetsList.value = tilesetsList.value.filter(t => !ids.has(t.id))
    }
    toast.success(`Deleted ${ids.size} item${ids.size === 1 ? '' : 's'}`)
    deselectAll()
  } catch {
    toast.error('Some deletes failed')
    if (tab.value === 'artworks') fetchWorks()
    else if (tab.value === 'collections') fetchCollections()
    else if (tab.value === 'worlds') fetchWorlds()
    else fetchTilesets()
    deselectAll()
  } finally {
    bulkDeleting.value = false
  }
}

useCustomSeoMeta({
  title: "Your Work - Simple Pixel Art",
  description: "Manage your pixel art drafts, published works, and collections.",
  canonical: "https://simplepixelart.com/work",
  robots: 'noindex, follow',
})

type SortKey = 'newest' | 'oldest' | 'name-az' | 'name-za'
const sortBy = ref<SortKey>('newest')
const SORT_META: Record<SortKey, { label: string; ordering: string }> = {
  'newest': {label: 'Newest', ordering: '-updated'},
  'oldest': {label: 'Oldest', ordering: 'updated'},
  'name-az': {label: 'Name A–Z', ordering: 'name'},
  'name-za': {label: 'Name Z–A', ordering: '-name'},
}

function sortItems<T extends { name?: string; title?: string; updated?: string }>(list: T[]): T[] {
  const name = (i: T) => (i.name || (i as any).title || '').toLowerCase()
  const time = (i: T) => Date.parse(i.updated || '') || 0
  const sorted = [...list]
  switch (sortBy.value) {
    case 'newest': sorted.sort((a, b) => time(b) - time(a)); break
    case 'oldest': sorted.sort((a, b) => time(a) - time(b)); break
    case 'name-az': sorted.sort((a, b) => name(a).localeCompare(name(b))); break
    case 'name-za': sorted.sort((a, b) => name(b).localeCompare(name(a))); break
  }
  return sorted
}

const workspaces = ref<WorkItem[]>([])
const loadingWorks = ref(false)
const workFilter = ref<'all' | 'public' | 'private'>('all')
const workTileFilter = ref<'all' | 'art' | 'tiles'>('all')
const confirmingWorkId = ref<string | number | null>(null)
let workConfirmTimer: ReturnType<typeof setTimeout> | null = null

const PAGE_SIZE = 30
const workPage = ref(1)
const workNumPages = ref(1)

async function fetchWorks() {
  loadingWorks.value = true
  try {
    if (auth.logged?.id) {
      const status = workFilter.value === 'public' ? 'public'
          : workFilter.value === 'private' ? 'draft,pending' : undefined
      const res = await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/`, {
        params: {
          user: auth.logged.username,
          page: workPage.value,
          page_size: PAGE_SIZE,
          is_template: true,
          ordering: SORT_META[sortBy.value].ordering,
          ...(status ? {status} : {}),
          ...(workTileFilter.value === 'tiles' ? {is_tile: true}
              : workTileFilter.value === 'art' ? {is_tile: false} : {}),
        },
      })
      workspaces.value = res.results as WorkItem[]
      workNumPages.value = res.num_pages || 1
    } else {
      localTs.reload()
      const tiles = localTs.list.value.flatMap(ts =>
          ts.tiles.map(t => ({...t.ed, is_tile: true} as WorkItem)))
      const tileIds = new Set(tiles.map(t => String(t.id)))
      const boards = (Object.values(getStorageItem('workspaces')) as WorkItem[])
          .filter(b => !tileIds.has(String(b.id)))
          .map(b => ({...b, is_tile: false}))
      workspaces.value = [...boards, ...tiles]
    }
  } finally {
    loadingWorks.value = false
  }
}

watch([workFilter, workTileFilter], () => {
  workPage.value = 1
  if (auth.logged?.id) fetchWorks()
})
watch(sortBy, () => {
  workPage.value = 1
  collPage.value = 1
  worldPage.value = 1
  tilesetPage.value = 1
  if (auth.logged?.id) fetchWorks()
})
watch(workPage, () => {
  if (auth.logged?.id) fetchWorks()
})

function isCloud(item: WorkItem): boolean {
  return typeof item.id === 'number' && !!item.id_string
}

const failedThumb = reactive<Record<string | number, boolean>>({})
const failedCover = reactive<Record<string | number, boolean>>({})

function artUrl(idString: string): string {
  return `${config.public.api}/coloring/files/art-original/${idString}.png`
}

function thumbUrl(item: WorkItem): string {
  return artUrl(item.id_string!)
}

function registryPreview(reg: Record<string, string> | null | undefined): string[] {
  return Object.values(reg || {}).slice(0, 4)
}

async function purgeLocalArt(id: string | number) {
  const key = id.toString()
  try {
    const ws = getStorageItem('workspaces')
    if (ws[key] !== undefined) {
      delete ws[key]
      localStorage.setItem('workspaces', JSON.stringify(ws))
    }
    const hs = getStorageItem('histories')
    if (hs[key] !== undefined) {
      delete hs[key]
      localStorage.setItem('histories', JSON.stringify(hs))
    }
    const full = await loadWorkspaceFull()
    if (full && Array.isArray(full.boards)) {
      const kept = full.boards.filter((b: any) => String(b?.data?.id) !== key)
      if (kept.length !== full.boards.length) {
        if (kept.length <= 1) {
          await clearWorkspaceFull()
          if (kept[0]?.data?.id != null) localStorage.setItem('workspace_current', String(kept[0].data.id))
        } else {
          const removedIdx = full.boards.findIndex((b: any) => String(b?.data?.id) === key)
          let ai = full.activeIndex ?? 0
          if (removedIdx <= ai) ai = Math.max(0, ai - 1)
          await saveWorkspaceFull({boards: kept, activeIndex: Math.min(ai, kept.length - 1)})
        }
      }
    }
    if (localStorage.getItem('workspace_current') === key) {
      localStorage.setItem('workspace_current', '')
    }
  } catch { /* storage unavailable / malformed — ignore */ }
}

function purgeLocalTile(id: string | number) {
  const key = String(id)
  for (const ts of localTs.list.value) {
    const tile = ts.tiles.find(t => String(t.ed.id) === key)
    if (tile) localTs.removeTile(ts.id, tile.key)
  }
}

async function destroyWork(item: WorkItem) {
  if (confirmingWorkId.value !== item.id) {
    confirmingWorkId.value = item.id
    if (workConfirmTimer) clearTimeout(workConfirmTimer)
    workConfirmTimer = setTimeout(() => {
      confirmingWorkId.value = null
    }, 3000)
    return
  }
  if (workConfirmTimer) clearTimeout(workConfirmTimer)
  confirmingWorkId.value = null

  const idx = workspaces.value.findIndex(w => w.id === item.id)
  if (idx !== -1) workspaces.value.splice(idx, 1)

  try {
    if (auth.isLogged && typeof item.id === 'number') {
      await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/${item.id}/`, {
        method: "DELETE",
      })
    }
    await purgeLocalArt(item.id)
    purgeLocalTile(item.id)
    toast.success('Deleted')
    if (!workspaces.value.length && workPage.value > 1) workPage.value--
  } catch {
    toast.error('Delete failed')
    if (idx !== -1) workspaces.value.splice(idx, 0, item)
  }
}

function isPublic(w: WorkItem): boolean {
  return w.status === 'public'
}

function statusClass(w: {status?: string}): string {
  if (w.status === 'public') return 'badge-public'
  if (w.status === 'pending') return 'badge-pending'
  return 'badge-draft'
}

const localFilteredWorks = computed(() => {
  let list = workspaces.value
  if (workTileFilter.value === 'art') list = list.filter(w => !w.is_tile)
  else if (workTileFilter.value === 'tiles') list = list.filter(w => w.is_tile)
  if (workFilter.value !== 'all') {
    const wantPublic = workFilter.value === 'public'
    list = list.filter(w => isPublic(w) === wantPublic)
  }
  return sortItems(list)
})

const filteredWorks = computed(() => {
  if (auth.logged?.id) return workspaces.value
  const start = (workPage.value - 1) * PAGE_SIZE
  return localFilteredWorks.value.slice(start, start + PAGE_SIZE)
})

const workNumPagesShown = computed(() =>
    auth.logged?.id ? workNumPages.value : Math.max(1, Math.ceil(localFilteredWorks.value.length / PAGE_SIZE)),
)

const collections = ref<CollectionItem[]>([])
const loadingColls = ref(false)
const collFilter = ref<'all' | 'public' | 'private'>('all')
const confirmingCollId = ref<number | null>(null)
let collConfirmTimer: ReturnType<typeof setTimeout> | null = null
const showCreateColl = ref(false)

async function fetchCollections() {
  if (!auth.logged?.id) return
  loadingColls.value = true
  try {
    const res = await useNativeFetch<APIResponse<CollectionItem>>('/coloring/collections/', {
      params: {mine: 1, page_size: 100, ordering: '-updated'},
    })
    collections.value = res.results
  } catch {
    toast.error('Could not load collections')
  } finally {
    loadingColls.value = false
  }
}

function onCollCreated(created: CollectionItem) {
  collections.value.unshift(created)
  showCreateColl.value = false
}

async function destroyColl(c: CollectionItem) {
  if (confirmingCollId.value !== c.id) {
    confirmingCollId.value = c.id!
    if (collConfirmTimer) clearTimeout(collConfirmTimer)
    collConfirmTimer = setTimeout(() => {
      confirmingCollId.value = null
    }, 3000)
    return
  }
  if (collConfirmTimer) clearTimeout(collConfirmTimer)
  confirmingCollId.value = null

  const idx = collections.value.findIndex(x => x.id === c.id)
  if (idx !== -1) collections.value.splice(idx, 1)

  try {
    await useNativeFetch(`/coloring/collections/${c.id}/`, {method: 'DELETE'})
    toast.success('Deleted')
  } catch {
    toast.error('Delete failed')
    if (idx !== -1) collections.value.splice(idx, 0, c)
  }
}

function itemCount(c: CollectionItem): number {
  return Array.isArray(c.items) ? c.items.length : 0
}

function coverUrl(c: CollectionItem): string | null {
  if (Array.isArray(c.items) && c.items.length > 0) {
    const first = c.items[0]
    if (typeof first === 'object' && first?.id_string) {
      return `${config.public.api}/coloring/files/art-original/${first.id_string}.png`
    }
  }
  return null
}

const filteredColls = computed(() => {
  const list = collFilter.value === 'all' ? collections.value
      : collections.value.filter(c => c.status === collFilter.value)
  return sortItems(list)
})

const collPage = ref(1)
watch(collFilter, () => { collPage.value = 1 })
const collNumPages = computed(() => Math.max(1, Math.ceil(filteredColls.value.length / PAGE_SIZE)))
const pagedColls = computed(() => {
  const start = (collPage.value - 1) * PAGE_SIZE
  return filteredColls.value.slice(start, start + PAGE_SIZE)
})

const tilesetsList = ref<any[]>([])
const loadingTilesets = ref(false)
const confirmingTilesetId = ref<number | string | null>(null)
let tilesetConfirmTimer: ReturnType<typeof setTimeout> | null = null

const localTs = useLocalTilesets()

async function fetchTilesets() {
  loadingTilesets.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<any>('/coloring/tilesets/', {params: {page_size: 100}})
      tilesetsList.value = (Array.isArray(res?.results) ? res.results : []).map(t => ({
        ...t,
        previewImgs: registryPreview(t.meta?.registry).map(artUrl),
        editUrl: `/tilesets/editor?id=${t.id_string}`,
      }))
    } else {
      tilesetsList.value = localTs.list.value.map(t => ({
        id: t.id, id_string: t.id, name: t.name, status: 'draft', local: true,
        tileCount: t.tiles.length,
        previewImgs: t.tiles.slice(0, 4).map(x => x.thumb),
        editUrl: `/tilesets/editor?id=${t.id}`,
      }))
    }
  } catch {
    if (auth.logged?.id) toast.error('Could not load tilesets')
  } finally {
    loadingTilesets.value = false
  }
}

async function destroyTileset(t: any) {
  if (confirmingTilesetId.value !== t.id) {
    confirmingTilesetId.value = t.id
    if (tilesetConfirmTimer) clearTimeout(tilesetConfirmTimer)
    tilesetConfirmTimer = setTimeout(() => { confirmingTilesetId.value = null }, 3000)
    return
  }
  if (tilesetConfirmTimer) clearTimeout(tilesetConfirmTimer)
  confirmingTilesetId.value = null
  const idx = tilesetsList.value.findIndex(x => x.id === t.id)
  if (idx !== -1) tilesetsList.value.splice(idx, 1)
  if (t.local) {
    localTs.remove(String(t.id))
    toast.success('Deleted')
    return
  }
  try {
    await useNativeFetch(`/coloring/tilesets/${t.id_string}/`, {method: 'DELETE'})
    worldsList.value = worldsList.value.filter(w => w.tileset_id_string !== t.id_string)
    toast.success('Deleted')
  } catch {
    toast.error('Delete failed')
    if (idx !== -1) tilesetsList.value.splice(idx, 0, t)
  }
}

const worldsList = ref<any[]>([])
const loadingWorlds = ref(false)
const confirmingWorldId = ref<number | string | null>(null)
let worldConfirmTimer: ReturnType<typeof setTimeout> | null = null

const FREESTYLE_KEY = 'spa_tilemap_freestyle_v1'

function readLocalWorld(): any[] {
  if (typeof localStorage === 'undefined') return []
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(FREESTYLE_KEY) || 'null') } catch { return [] }
  const registry = saved?.registry || {}
  const layers = Array.isArray(saved?.config?.layers) ? saved.config.layers : []
  const hasCells = layers.some((l: any) => l?.cells && Object.keys(l.cells).length)
  if (!hasCells) return []
  return [{
    id: 'local-world', id_string: '', name: 'Free-style map', status: 'draft', local: true,
    registry, previewImgs: registryPreview(registry).map(artUrl),
    editUrl: '/tilemaps/editor',
  }]
}

async function fetchWorlds() {
  loadingWorlds.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<any>('/coloring/worlds/', {params: {mine: 1, page_size: 100}})
      worldsList.value = (Array.isArray(res?.results) ? res.results : []).map(w => ({
        ...w,
        previewImgs: registryPreview(w.registry).map(artUrl),
        editUrl: `/tilemaps/editor?world=${w.id_string}`,
      }))
    } else {
      worldsList.value = readLocalWorld()
    }
  } catch {
    if (auth.logged?.id) toast.error('Could not load worlds')
  } finally {
    loadingWorlds.value = false
  }
}

async function destroyWorld(w: any) {
  if (confirmingWorldId.value !== w.id) {
    confirmingWorldId.value = w.id
    if (worldConfirmTimer) clearTimeout(worldConfirmTimer)
    worldConfirmTimer = setTimeout(() => { confirmingWorldId.value = null }, 3000)
    return
  }
  if (worldConfirmTimer) clearTimeout(worldConfirmTimer)
  confirmingWorldId.value = null
  const idx = worldsList.value.findIndex(x => x.id === w.id)
  if (idx !== -1) worldsList.value.splice(idx, 1)
  if (w.local) {
    try { localStorage.removeItem(FREESTYLE_KEY) } catch { /* ignore */ }
    toast.success('Deleted')
    return
  }
  try {
    await useNativeFetch(`/coloring/worlds/${w.id_string}/`, {method: 'DELETE'})
    toast.success('Deleted')
  } catch {
    toast.error('Delete failed')
    if (idx !== -1) worldsList.value.splice(idx, 0, w)
  }
}

type StatusFilter = 'all' | 'public' | 'private'
const worldFilter = ref<StatusFilter>('all')
const tilesetFilter = ref<StatusFilter>('all')
const worldPage = ref(1)
const tilesetPage = ref(1)
watch(worldFilter, () => { worldPage.value = 1 })
watch(tilesetFilter, () => { tilesetPage.value = 1 })

const filteredWorlds = computed(() => sortItems(worldFilter.value === 'all'
    ? worldsList.value
    : worldsList.value.filter(w => (w.status === 'public') === (worldFilter.value === 'public'))))
const worldNumPages = computed(() => Math.max(1, Math.ceil(filteredWorlds.value.length / PAGE_SIZE)))
const pagedWorlds = computed(() => filteredWorlds.value.slice((worldPage.value - 1) * PAGE_SIZE, worldPage.value * PAGE_SIZE))

const filteredTilesets = computed(() => sortItems(tilesetFilter.value === 'all'
    ? tilesetsList.value
    : tilesetsList.value.filter(t => (t.status === 'public') === (tilesetFilter.value === 'public'))))
const tilesetNumPages = computed(() => Math.max(1, Math.ceil(filteredTilesets.value.length / PAGE_SIZE)))
const pagedTilesets = computed(() => filteredTilesets.value.slice((tilesetPage.value - 1) * PAGE_SIZE, tilesetPage.value * PAGE_SIZE))

const curFilter = computed<StatusFilter>({
  get: () => tab.value === 'artworks' ? workFilter.value
      : tab.value === 'collections' ? collFilter.value
          : tab.value === 'worlds' ? worldFilter.value : tilesetFilter.value,
  set: (v) => {
    if (tab.value === 'artworks') workFilter.value = v
    else if (tab.value === 'collections') collFilter.value = v
    else if (tab.value === 'worlds') worldFilter.value = v
    else tilesetFilter.value = v
  },
})

const curPage = computed<number>({
  get: () => tab.value === 'artworks' ? workPage.value
      : tab.value === 'collections' ? collPage.value
          : tab.value === 'worlds' ? worldPage.value : tilesetPage.value,
  set: (v) => {
    if (tab.value === 'artworks') workPage.value = v
    else if (tab.value === 'collections') collPage.value = v
    else if (tab.value === 'worlds') worldPage.value = v
    else tilesetPage.value = v
  },
})

const curNumPages = computed(() => tab.value === 'artworks' ? workNumPagesShown.value
    : tab.value === 'collections' ? collNumPages.value
        : tab.value === 'worlds' ? worldNumPages.value : tilesetNumPages.value)

const curCount = computed(() => tab.value === 'artworks' ? filteredWorks.value.length
    : tab.value === 'collections' ? filteredColls.value.length
        : tab.value === 'worlds' ? filteredWorlds.value.length : filteredTilesets.value.length)

const privateChipLabel = computed(() => tab.value === 'artworks' ? 'Draft' : 'Private')

function statusIcon(status?: string): string {
  if (status === 'public') return 'icon-earth'
  if (status === 'pending') return 'icon-clock'
  return 'icon-earth-off'
}

function statusTitle(status?: string): string {
  if (status === 'public') return 'Public'
  if (status === 'pending') return 'Pending review'
  return 'Private draft'
}

onMounted(() => {
  fetchWorks()
  fetchTilesets()
  fetchWorlds()
  if (auth.isLogged) fetchCollections()
})
</script>

<template>
  <div class="page work-page">

    <section class="readme work-panel">
      <div class="readme-head work-head">
        <div class="work-controlbar">

      <ui-dropdown-menu class="work-sel work-sel-tab">
        <button class="btn work-sel-btn">
          <span class="icon" :class="activeTabMeta.icon"/>
          <span>{{ activeTabMeta.label }}</span>
          <span class="icon icon-chevron-down work-sel-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button
                v-for="t in TABS"
                :key="t"
                class="file-menu-item"
                :disabled="!!TAB_META[t].auth && !auth.isLogged"
                :title="TAB_META[t].auth && !auth.isLogged ? 'Sign in to use this' : ''"
                @click="setTab(t)"
            >
              <span class="icon" :class="TAB_META[t].icon"/>
              <span class="file-menu-label">
                <span>{{ TAB_META[t].label }}</span>
                <span v-if="tab === t" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>

      <ui-dropdown-menu class="work-sel">
        <button class="btn work-sel-btn">
          <span>{{ curFilter === 'all' ? 'All' : curFilter === 'public' ? 'Public' : privateChipLabel }}</span>
          <span class="icon icon-chevron-down work-sel-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button
                v-for="f in (['all', 'public', 'private'] as const)"
                :key="f"
                class="file-menu-item"
                @click="curFilter = f"
            >
              <span class="file-menu-label">
                <span>{{ f === 'all' ? 'All' : f === 'public' ? 'Public' : privateChipLabel }}</span>
                <span v-if="curFilter === f" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>

      <ui-dropdown-menu v-if="tab === 'artworks'" class="work-sel">
        <button class="btn work-sel-btn">
          <span>{{ workTileFilter === 'all' ? 'All types' : workTileFilter === 'art' ? 'Art' : 'Tiles' }}</span>
          <span class="icon icon-chevron-down work-sel-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button
                v-for="f in (['all', 'art', 'tiles'] as const)"
                :key="f"
                class="file-menu-item"
                @click="workTileFilter = f"
            >
              <span class="file-menu-label">
                <span>{{ f === 'all' ? 'All types' : f === 'art' ? 'Art' : 'Tiles' }}</span>
                <span v-if="workTileFilter === f" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>

      <ui-dropdown-menu class="work-sel work-sel-sort">
        <button class="btn work-sel-btn" title="Sort by">
          <span>{{ SORT_META[sortBy].label }}</span>
          <span class="icon icon-chevron-down work-sel-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button
                v-for="(m, k) in SORT_META"
                :key="k"
                class="file-menu-item"
                @click="sortBy = k"
            >
              <span class="file-menu-label">
                <span>{{ m.label }}</span>
                <span v-if="sortBy === k" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>
      <nuxt-link v-if="tab === 'artworks'" to="/editor?new=true" class="btn primary">
        <span class="icon icon-plus"/>
        <span>New</span>
      </nuxt-link>
      <nuxt-link
          v-else-if="tab === 'worlds' || tab === 'tilesets'"
          :to="tab === 'worlds' ? '/tilemaps/editor?new=true' : '/tilesets/editor?new=true'"
          class="btn primary"
      >
        <span class="icon icon-plus"/>
        <span>New</span>
      </nuxt-link>
      <button v-else-if="auth.isLogged" class="btn primary" @click="showCreateColl = true">
        <span class="icon icon-plus"/>
        <span>New</span>
      </button>
        </div>
      </div>

      <div class="work-body">

    <template v-if="tab === 'artworks'">
      <div v-if="loadingWorks" class="work-grid" aria-busy="true">
        <div v-for="i in 10" :key="i" class="skeleton skeleton-square"/>
      </div>

      <div v-else-if="!workspaces.length && workFilter === 'all'" class="work-empty">
        <span class="icon icon-pen empty-icon"/>
        <h2 class="empty-title">No artworks yet</h2>
        <p class="text-xs">Create something — it takes seconds.</p>
        <div class="empty-actions">
          <nuxt-link to="/editor?new=true" class="btn primary">
            <span class="icon icon-pen"/>
            <span>Start drawing</span>
          </nuxt-link>
          <nuxt-link to="/convert" class="btn">
            <span class="icon icon-adjust"/>
            <span>Convert image</span>
          </nuxt-link>
        </div>
      </div>

      <TransitionGroup
          v-else-if="filteredWorks.length"
          tag="div"
          class="work-grid"
          :class="{selecting: selectMode}"
          name="work-item"
      >
        <div v-for="item in filteredWorks" :key="item.id as any" class="work-card">
          <button
              v-if="selectMode"
              class="work-select-hit"
              :class="{on: selectedIds.has(item.id)}"
              :aria-label="selectedIds.has(item.id) ? 'Deselect item' : 'Select item'"
              @click="onSelectClick($event, item.id)"
          >
            <span class="work-select-dot"><span class="icon icon-check"/></span>
          </button>
          <nuxt-link class="work-canvas" :to="`/editor?id=${item.id_string || item.id}`">
            <div class="square">
              <div class="inside work-art-pad">
                <img
                    v-if="isCloud(item) && item.has_image !== false && !failedThumb[item.id]"
                    :src="thumbUrl(item)"
                    :alt="item.name || 'Pixel art'"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                    @error="failedThumb[item.id] = true"
                />
                <div v-else-if="isCloud(item)" class="coll-cover-empty">
                  <span class="icon icon-image"/>
                </div>
                <Thumb v-else :data="item as EditorData"/>
              </div>
            </div>
          </nuxt-link>
          <span class="work-status badge-ic" :class="statusClass(item)" :title="statusTitle(item.status)">
            <span class="icon" :class="statusIcon(item.status)"/>
          </span>
          <ui-dropdown-menu class="work-more-tl">
            <button class="work-more-btn" title="More" aria-label="Artwork actions">
              <span class="icon icon-dots"/>
            </button>
            <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" disabled>
                    <span>{{ item.name || 'Untitled' }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <nuxt-link class="file-menu-item" :to="`/editor?id=${item.id_string || item.id}`">
                    <span class="icon icon-pen"/><span>Edit</span>
                  </nuxt-link>
                  <nuxt-link v-if="item.id_string" class="file-menu-item" :to="`/art/${item.id_string}`">
                    <span class="icon icon-link"/><span>Open page</span>
                  </nuxt-link>

                  <button class="file-menu-item" data-keep-open @click="destroyWork(item)">
                    <span class="icon" :class="confirmingWorkId === item.id ? 'icon-check' : 'icon-trash'"/>
                    <span>{{ confirmingWorkId === item.id ? 'Confirm delete' : 'Delete' }}</span>
                  </button>
                </div>
            </template>
          </ui-dropdown-menu>
        </div>
      </TransitionGroup>

      <div v-else class="work-empty">
        <p class="text-xs">No {{ workFilter }} artworks.</p>
      </div>
    </template>

    <template v-else-if="tab === 'collections'">
      <div v-if="loadingColls" class="work-grid" aria-busy="true">
        <div v-for="i in 10" :key="i" class="skeleton skeleton-square"/>
      </div>

      <div v-else-if="!collections.length" class="work-empty">
        <span class="icon icon-rhombus empty-icon"/>
        <h2 class="empty-title">No collections yet</h2>
        <p class="text-xs">Create one to group artworks by theme or style.</p>
        <div class="empty-actions">
          <button class="btn primary" @click="showCreateColl = true">
            <span class="icon icon-plus"/>
            <span>New collection</span>
          </button>
        </div>
      </div>

      <TransitionGroup
          v-else-if="filteredColls.length"
          tag="div"
          class="work-grid"
          :class="{selecting: selectMode}"
          name="work-item"
      >
        <div v-for="c in pagedColls" :key="c.id as any" class="work-card work-card-folder">
          <button
              v-if="selectMode"
              class="work-select-hit"
              :class="{on: selectedIds.has(c.id)}"
              :aria-label="selectedIds.has(c.id) ? 'Deselect item' : 'Select item'"
              @click="onSelectClick($event, c.id)"
          >
            <span class="work-select-dot"><span class="icon icon-check"/></span>
          </button>
          <nuxt-link class="work-canvas" :to="`/collections/${c.id_string}`">
            <div class="square">
              <div class="inside">
                <img
                    v-if="coverUrl(c) && !failedCover[c.id]"
                    :src="coverUrl(c)!"
                    :alt="c.title"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                    @error="failedCover[c.id] = true"
                />
                <div v-else class="coll-cover-empty">
                  <span class="icon icon-image"/>
                </div>
              </div>
            </div>
          </nuxt-link>
          <span class="work-status badge-ic" :class="statusClass(c)" :title="statusTitle(c.status)">
            <span class="icon" :class="statusIcon(c.status)"/>
          </span>
          <div class="work-meta">
            <div class="work-name" :title="c.title">{{ c.title || 'Untitled' }}</div>
            <ui-dropdown-menu position="right">
              <button class="work-more-btn" title="More" aria-label="Collection actions">
                <span class="icon icon-dots"/>
              </button>
              <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" disabled>
                    <span>{{ c.title || 'Untitled' }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <nuxt-link class="file-menu-item" :to="`/collections/${c.id_string}`">
                    <span class="icon icon-pencil"/><span>Edit</span>
                  </nuxt-link>
                  <button class="file-menu-item" data-keep-open @click="destroyColl(c)">
                    <span class="icon" :class="confirmingCollId === c.id ? 'icon-check' : 'icon-trash'"/>
                    <span>{{ confirmingCollId === c.id ? 'Confirm delete' : 'Delete' }}</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>
        </div>
      </TransitionGroup>

      <div v-else class="work-empty">
        <p class="text-xs">No {{ collFilter }} collections.</p>
      </div>
    </template>

    <template v-else-if="tab === 'worlds'">
      <div v-if="loadingWorlds" class="work-grid" aria-busy="true">
        <div v-for="i in 8" :key="i" class="skeleton skeleton-square"/>
      </div>

      <div v-else-if="!worldsList.length" class="work-empty">
        <span class="icon icon-grid empty-icon"/>
        <h2 class="empty-title">No worlds yet</h2>
        <p class="text-xs">Arrange pixel art into grid or isometric scenes with the world editor.</p>
        <div class="empty-actions">
          <nuxt-link to="/tilemaps/editor?new=true" class="btn primary">
            <span class="icon icon-grid"/>
            <span>Open world editor</span>
          </nuxt-link>
        </div>
      </div>

      <TransitionGroup v-else tag="div" class="work-grid" :class="{selecting: selectMode}" name="work-item">
        <div v-for="w in pagedWorlds" :key="w.id" class="work-card work-card-folder">
          <button
              v-if="selectMode"
              class="work-select-hit"
              :class="{on: selectedIds.has(w.id)}"
              :aria-label="selectedIds.has(w.id) ? 'Deselect item' : 'Select item'"
              @click="onSelectClick($event, w.id)"
          >
            <span class="work-select-dot"><span class="icon icon-check"/></span>
          </button>
          <nuxt-link class="work-canvas" :to="w.editUrl" :title="`Edit ${w.name || 'world'}`">
            <div class="square">
              <div class="inside">
                <div v-if="w.previewImgs?.length" class="tile-collage" :class="`n${w.previewImgs.length}`">
                  <img v-for="(s, i) in w.previewImgs" :key="i" :src="s" alt="" loading="lazy" decoding="async"/>
                </div>
                <div v-else class="coll-cover-empty"><span class="icon icon-grid"/></div>
              </div>
            </div>
          </nuxt-link>
          <span class="work-status badge-ic" :class="statusClass(w)" :title="statusTitle(w.status)">
            <span class="icon" :class="statusIcon(w.status)"/>
          </span>
          <div class="work-meta">
            <div class="work-name" :title="w.name || 'Untitled'">{{ w.name || 'Untitled' }}</div>
            <ui-dropdown-menu position="right">
              <button class="work-more-btn" title="More" aria-label="World actions">
                <span class="icon icon-dots"/>
              </button>
              <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" disabled>
                    <span>{{ w.name || 'Untitled' }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <nuxt-link class="file-menu-item" :to="w.editUrl">
                    <span class="icon icon-pen"/><span>Edit</span>
                  </nuxt-link>
                  <nuxt-link v-if="!w.local" class="file-menu-item" :to="`/worlds/${w.id_string}`">
                    <span class="icon icon-link"/><span>Open page</span>
                  </nuxt-link>
                  <button class="file-menu-item" data-keep-open @click="destroyWorld(w)">
                    <span class="icon" :class="confirmingWorldId === w.id ? 'icon-check' : 'icon-trash'"/>
                    <span>{{ confirmingWorldId === w.id ? 'Confirm delete' : 'Delete' }}</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>
        </div>
      </TransitionGroup>
    </template>

    <template v-else>
      <div v-if="loadingTilesets" class="work-grid" aria-busy="true">
        <div v-for="i in 8" :key="i" class="skeleton skeleton-square"/>
      </div>

      <div v-else-if="!tilesetsList.length" class="work-empty">
        <span class="icon icon-select empty-icon"/>
        <h2 class="empty-title">No tilesets yet</h2>
        <p class="text-xs">A tileset is a curated set of tiles you can paint many worlds with.</p>
        <div class="empty-actions">
          <nuxt-link to="/tilesets/editor?new=true" class="btn primary">
            <span class="icon icon-grid"/>
            <span>Open tileset editor</span>
          </nuxt-link>
        </div>
      </div>

      <TransitionGroup v-else tag="div" class="work-grid" :class="{selecting: selectMode}" name="work-item">
        <div v-for="t in pagedTilesets" :key="t.id" class="work-card work-card-folder">
          <button
              v-if="selectMode"
              class="work-select-hit"
              :class="{on: selectedIds.has(t.id)}"
              :aria-label="selectedIds.has(t.id) ? 'Deselect item' : 'Select item'"
              @click="onSelectClick($event, t.id)"
          >
            <span class="work-select-dot"><span class="icon icon-check"/></span>
          </button>
          <nuxt-link class="work-canvas" :to="t.editUrl" :title="`Edit ${t.name || 'tileset'}`">
            <div class="square">
              <div class="inside">
                <div v-if="t.previewImgs?.length" class="tile-collage" :class="`n${t.previewImgs.length}`">
                  <img v-for="(s, i) in t.previewImgs" :key="i" :src="s" alt="" loading="lazy" decoding="async"/>
                </div>
                <div v-else class="coll-cover-empty"><span class="icon icon-select"/></div>
              </div>
            </div>
          </nuxt-link>
          <span class="work-status badge-ic" :class="statusClass(t)" :title="statusTitle(t.status)">
            <span class="icon" :class="statusIcon(t.status)"/>
          </span>
          <div class="work-meta">
            <div class="work-name" :title="t.name || 'Untitled'">{{ t.name || 'Untitled' }}</div>
            <ui-dropdown-menu position="right">
              <button class="work-more-btn" title="More" aria-label="Tileset actions">
                <span class="icon icon-dots"/>
              </button>
              <template #menu>
                <div class="file-menu">
                  <button class="file-menu-item" disabled>
                    <span>{{ t.name || 'Untitled' }}</span>
                  </button>
                  <div class="file-menu-sep"/>
                  <nuxt-link v-if="t.editUrl" class="file-menu-item" :to="t.editUrl">
                    <span class="icon icon-pen"/><span>Edit</span>
                  </nuxt-link>
                  <nuxt-link v-if="!t.local" class="file-menu-item" :to="`/tilesets/${t.id_string}`">
                    <span class="icon icon-link"/><span>Open page</span>
                  </nuxt-link>
                  <button class="file-menu-item" data-keep-open @click="destroyTileset(t)">
                    <span class="icon" :class="confirmingTilesetId === t.id ? 'icon-check' : 'icon-trash'"/>
                    <span>{{ confirmingTilesetId === t.id ? 'Deletes its worlds too — confirm' : 'Delete' }}</span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>
        </div>
      </TransitionGroup>
    </template>
      </div>

      <div class="readme-foot work-foot">
        <div class="work-foot-sel">
          <button
              class="work-ic-btn"
              :class="{active: selectMode}"
              :title="selectMode ? 'Exit select mode' : 'Select multiple items'"
              :aria-label="selectMode ? 'Exit select mode' : 'Select multiple items'"
              @click="toggleSelectMode"
          >
            <span class="icon" :class="selectMode ? 'icon-selected' : 'icon-select'"/>
          </button>
          <template v-if="selectedCount">
            <button class="work-ic-btn" title="Deselect all" aria-label="Deselect all" @click="deselectAll">
              <span class="icon icon-x"/>
            </button>
            <button
                class="work-ic-btn work-bulk-del"
                :class="{confirm: confirmingBulk}"
                :disabled="bulkDeleting"
                :title="bulkDeleting ? 'Deleting…' : confirmingBulk ? 'Click again to confirm' : `Delete ${selectedCount} selected`"
                :aria-label="`Delete ${selectedCount} selected items`"
                @click="bulkDelete"
            >
              <span class="icon" :class="confirmingBulk ? 'icon-check' : 'icon-trash'"/>
              <span class="work-bulk-n">{{ selectedCount }}</span>
            </button>
          </template>

        </div>
        <Paginator v-if="curNumPages > 1" v-model:page="curPage" :pages="curNumPages" class="work-paging"/>
        <span v-else class="work-count">{{ curCount }} {{ curCount === 1 ? 'item' : 'items' }}</span>
      </div>
    </section>

    <CollectionEditModal v-if="showCreateColl" @close="showCreateColl = false" @created="onCollCreated"/>
  </div>
</template>

<style scoped>

.work-controlbar {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.work-sel-btn {
  gap: var(--space-2);
  justify-content: space-between;
  min-width: 120px;
  white-space: nowrap;   
}

.work-sel-tab .work-sel-btn {
  width: 160px;
}

.work-sel-caret {
  font-size: 13px;
  color: var(--muted);
}

.work-sel-sort {
  margin-left: auto;
}

.work-panel {
  margin-top: 0;       
  overflow: visible;   
  flex: 1 1 auto;      
  min-height: 480px;   
  display: flex;
  flex-direction: column;
}

.work-head {
  display: block;
  padding: var(--space-2) var(--space-4);
  flex: 0 0 auto;      
}

.work-body {
  padding: var(--space-4);
  flex: 1 1 auto;      
  min-height: 0;       
  overflow-y: auto;
}

.work-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
  flex: 0 0 auto;      
}

.work-foot-sel {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.work-foot .work-paging {
  margin: 0;
}

.work-count {
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--muted);
}

.work-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-3);
  padding-top: 3rem;
  padding-bottom: 3rem;
  min-height: 100%;   
}

.empty-icon {
  font-size: 48px;
  color: var(--primary);
}

.empty-title {
  font-size: var(--text-base);
  line-height: var(--text-base-lh);
  font-weight: 700;
  color: var(--foreground);
}

.empty-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: 0.75rem;
}

.work-card:has(.dropdown.active) {
  z-index: 5;
}

.work-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (min-width: 768px) {
  .work-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {

  .work-controlbar {
    flex-wrap: wrap;
  }
  .work-sel-btn {
    min-width: 0;
    gap: var(--space-1);
    padding-left: var(--space-2);
    padding-right: var(--space-2);
  }
  .work-sel-tab .work-sel-btn {
    width: auto;   
  }
  .work-controlbar .btn.primary {
    padding-left: var(--space-2);
    padding-right: var(--space-2);
  }
  .work-controlbar .btn.primary span:not(.icon) {
    display: none;
  }
}

.work-card {
  position: relative;

  --fold-size: 14px;
  transition: --fold-size 220ms cubic-bezier(.22,.61,.36,1);
  background: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), var(--surface) calc(var(--fold-size) * 0.7071 + 0.25px));
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.work-grid.selecting .work-card :deep(.dropdown) {
  visibility: hidden;
}

.work-select-hit {
  position: absolute;
  inset: 0;
  z-index: 5;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.work-select-dot {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 1px solid var(--border);
  color: transparent;
  box-shadow: var(--shadow);
}

.work-select-hit.on .work-select-dot {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}

.work-select-dot .icon {
  width: 13px;
  height: 13px;
}

.work-ic-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0.375rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.work-ic-btn:hover:not(:disabled) {
  color: var(--foreground);
}

.work-ic-btn.active {
  color: var(--primary);
}

.work-bulk-n {
  font-size: var(--text-2xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.work-bulk-del:hover:not(:disabled),
.work-bulk-del.confirm {
  color: var(--danger);
}

.work-card .square {
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

.work-card:not(.work-card-folder)::before {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
}

@media (hover: hover) and (pointer: fine) {
  .work-card:not(.work-card-folder):hover {
    --fold-size: 28px;
  }
}

.work-card:not(.work-card-folder)::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  width: var(--fold-size);
  height: var(--fold-size);

  background: linear-gradient(
    225deg,
    transparent calc(var(--fold-size) * 0.7071 - 0.25px),
    var(--border) calc(var(--fold-size) * 0.7071 + 0.25px) calc(50% + 1.25px),
    var(--surface) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.work-card-folder {
  border: 0;
  background: transparent;
}

.work-card-folder .work-canvas {
  position: relative;
  display: block;
  background: color-mix(in oklab, var(--primary) 55%, var(--surface));
  border-radius: var(--radius-sm);

  -webkit-mask:
    linear-gradient(#000, #000) 0 0 / 40% 17px no-repeat,
    linear-gradient(to top right, #000 calc(50% - 0.5px), transparent calc(50% + 0.5px)) calc(40% + 5.1px) 0 / 14px 17px no-repeat,
    linear-gradient(#000, #000) 0 16px / calc(100% - 5px) calc(100% - 16px) no-repeat,
    linear-gradient(#000, #000) 100% 21px / 5px calc(100% - 21px) no-repeat,
    radial-gradient(circle 5px at calc(100% - 5px) 21px, #000 4.5px, transparent 5px) 0 0 / 100% 100% no-repeat;
  mask:
    linear-gradient(#000, #000) 0 0 / 40% 17px no-repeat,
    linear-gradient(to top right, #000 calc(50% - 0.5px), transparent calc(50% + 0.5px)) calc(40% + 5.1px) 0 / 14px 17px no-repeat,
    linear-gradient(#000, #000) 0 16px / calc(100% - 5px) calc(100% - 16px) no-repeat,
    linear-gradient(#000, #000) 100% 21px / 5px calc(100% - 21px) no-repeat,
    radial-gradient(circle 5px at calc(100% - 5px) 21px, #000 4.5px, transparent 5px) 0 0 / 100% 100% no-repeat;
}

.work-card-folder .work-canvas .inside {
  inset: 24% 12% 34%;
  padding: 4%;
  background: var(--surface);
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

.work-card-folder .coll-cover-empty {
  background: transparent;
}

.work-card-folder .tile-collage {
  padding: 0;
  gap: 2px;
}

.work-card-folder .tile-collage img {
  object-fit: contain;
}

.work-card-folder .work-canvas::after {
  content: "";
  position: absolute;
  inset: 44% 0 0;
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--primary) 30%, var(--surface)),
    color-mix(in oklab, var(--primary) 46%, var(--surface))
  );
  border-radius: 8px 8px var(--radius-sm) var(--radius-sm);
  box-shadow: 0 -1px 2px rgba(0, 0, 0, 0.08);
  pointer-events: none;
  z-index: 1;
}

.work-card-folder .work-status {
  top: auto;
  bottom: calc(30px + 12px);
  left: 10px;
  z-index: 2;
}

.work-card-folder .work-canvas .inside img {
  object-fit: cover;
  border-radius: 2px;
}

.work-card-folder .work-meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  border-top: 0;
  padding: var(--space-2) var(--space-1) 0;
}

.work-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.work-more-btn:hover {
  background: var(--surface-2);
  color: var(--foreground);
}

.work-item-leave-active {
  transition: opacity 240ms ease, transform 240ms ease;
  position: absolute;
}

.work-item-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.work-item-move {
  transition: transform 300ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .work-card:hover {
    box-shadow: var(--shadow-hover);
  }
}

.work-canvas {
  display: block;
  background: transparent;
  image-rendering: pixelated;
}

.work-canvas img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.work-art-pad {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem;
}

.coll-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--muted);
  font-size: 32px;
}

.work-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.work-name {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 700;
  color: var(--foreground);
}

.badge-public {
  background: var(--primary);
  color: var(--primary-foreground);
}

.badge-pending {
  background: #f59e0b;
  color: #1a1a1a;
}

.badge-draft {
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.work-status {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  z-index: 2;
  margin: 0;
  pointer-events: none;
}

.work-status.badge-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: var(--radius-pill);
  pointer-events: auto; 
}

.work-status.badge-ic .icon {
  width: 13px;
  height: 13px;
}

.work-more-tl {
  position: absolute;
  top: 0.4rem;
  left: calc(0.4rem + 22px + 4px);
  z-index: 2;
}

.work-more-tl .work-more-btn {
  width: 22px;
  height: 22px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  color: var(--muted);
}

.tile-collage {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 1.25rem;
  image-rendering: pixelated;
}

.tile-collage.n1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
.tile-collage.n2 { grid-template-rows: 1fr; align-items: center; }

.tile-collage img {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
}
</style>

<style>
.main-wrapper:has(.work-page) {
  height: 100dvh;   
}
.main-wrapper:has(.work-page) > .main {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.main-wrapper:has(.work-page) > .main > .container {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.page.work-page {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
