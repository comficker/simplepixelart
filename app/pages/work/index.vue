<script setup lang="ts">
import type {APIResponse, Collection, EditorData, SharedPage} from "~/types";
import {getStorageItem} from "~/helper/utils";
import {toast} from "vue-sonner";

type Tab = 'artworks' | 'collections'

type WorkItem = (SharedPage | EditorData) & {
  id: string | number
  id_string?: string
  name?: string
  width?: number
  height?: number
  status?: string
  updated?: string
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

const tab = ref<Tab>(route.query.tab === 'collections' ? 'collections' : 'artworks')

watch(tab, (v) => {
  const q = {...route.query}
  if (v === 'artworks') delete q.tab
  else q.tab = v
  router.replace({query: q})
})

useCustomSeoMeta({
  title: "Your Work - Simple Pixel Art",
  description: "Manage your pixel art drafts, published works, and collections.",
  canonical: "https://simplepixelart.com/work",
  robots: 'noindex, follow',
})

// ===== Artworks =====
const workspaces = ref<WorkItem[]>([])
const loadingWorks = ref(false)
const workFilter = ref<'all' | 'public' | 'private'>('all')
const confirmingWorkId = ref<string | number | null>(null)
let workConfirmTimer: ReturnType<typeof setTimeout> | null = null

async function fetchWorks() {
  loadingWorks.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/`, {
        params: {
          user: auth.logged.username,
          page_size: 100,
          is_template: true,
          ordering: '-updated',
        },
      })
      workspaces.value = res.results as WorkItem[]
    } else {
      workspaces.value = Object.values(getStorageItem('workspaces')) as WorkItem[]
    }
  } finally {
    loadingWorks.value = false
  }
}

function isCloud(item: WorkItem): boolean {
  return typeof item.id === 'number' && !!item.id_string
}

function thumbUrl(item: WorkItem): string {
  return `${config.public.api}/coloring/files/art-original/${item.id_string}.png`
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

  const currentId = localStorage.getItem('workspace_current')
  const idx = workspaces.value.findIndex(w => w.id === item.id)
  if (idx !== -1) workspaces.value.splice(idx, 1)
  if (currentId === item.id.toString()) {
    localStorage.setItem('workspace_current', "")
  }

  try {
    if (auth.isLogged && typeof item.id === 'number') {
      await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/${item.id}/`, {
        method: "DELETE",
      })
    } else {
      const data = getStorageItem('workspaces')
      delete data[item.id]
      localStorage.setItem('workspaces', JSON.stringify(data))
    }
    toast.success('Deleted')
  } catch {
    toast.error('Delete failed')
    if (idx !== -1) workspaces.value.splice(idx, 0, item)
  }
}

function isPublic(w: WorkItem): boolean {
  return w.status === 'public'
}

function statusLabel(w: WorkItem): string {
  if (w.status === 'public') return 'PUBLIC'
  if (w.status === 'pending') return 'PENDING'
  return 'DRAFT'
}

function statusClass(w: WorkItem): string {
  if (w.status === 'public') return 'badge-public'
  if (w.status === 'pending') return 'badge-pending'
  return 'badge-draft'
}

const filteredWorks = computed(() => {
  if (workFilter.value === 'all') return workspaces.value
  const wantPublic = workFilter.value === 'public'
  return workspaces.value.filter(w => isPublic(w) === wantPublic)
})

const workStats = computed(() => ({
  total: workspaces.value.length,
  publicCount: workspaces.value.filter(isPublic).length,
  privateCount: workspaces.value.filter(w => !isPublic(w)).length,
}))

// ===== Collections =====
const collections = ref<CollectionItem[]>([])
const loadingColls = ref(false)
const collFilter = ref<'all' | 'public' | 'private'>('all')
const confirmingCollId = ref<number | null>(null)
let collConfirmTimer: ReturnType<typeof setTimeout> | null = null
const editingColl = ref<CollectionItem | null>(null)
const editForm = ref({title: '', desc: '', status: 'public' as 'public' | 'private'})
const showCollModal = ref(false)
const savingColl = ref(false)

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

function openCreateColl() {
  editingColl.value = null
  editForm.value = {title: '', desc: '', status: 'public'}
  showCollModal.value = true
}

function openEditColl(c: CollectionItem) {
  editingColl.value = c
  editForm.value = {
    title: c.title || '',
    desc: c.desc || '',
    status: (c.status === 'private' ? 'private' : 'public'),
  }
  showCollModal.value = true
}

function closeCollForm() {
  showCollModal.value = false
  editingColl.value = null
}

async function saveColl() {
  const title = editForm.value.title.trim()
  if (!title) {
    toast.error('Title is required')
    return
  }
  savingColl.value = true
  try {
    if (editingColl.value) {
      const updated = await useNativeFetch<CollectionItem>(
          `/coloring/collections/${editingColl.value.id}/`,
          {
            method: 'PATCH',
            body: {
              title,
              desc: editForm.value.desc,
              status: editForm.value.status,
              name: title,
            },
          },
      )
      const idx = collections.value.findIndex(c => c.id === editingColl.value!.id)
      if (idx !== -1) collections.value[idx] = {...collections.value[idx], ...updated}
      toast.success('Collection updated')
    } else {
      const created = await useNativeFetch<CollectionItem>('/coloring/collections/', {
        method: 'POST',
        body: {
          title,
          desc: editForm.value.desc,
          status: editForm.value.status,
          name: title,
          type: 'saved',
        },
      })
      collections.value.unshift(created)
      toast.success('Collection created')
    }
    closeCollForm()
  } catch {
    toast.error('Save failed')
  } finally {
    savingColl.value = false
  }
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
  if (collFilter.value === 'all') return collections.value
  return collections.value.filter(c => c.status === collFilter.value)
})

const collStats = computed(() => ({
  total: collections.value.length,
  publicCount: collections.value.filter(c => c.status === 'public').length,
  privateCount: collections.value.filter(c => c.status !== 'public').length,
}))

onMounted(() => {
  fetchWorks()
  if (auth.isLogged) fetchCollections()
})
</script>

<template>
  <div class="page">
    <section class="work-hero">
      <div>
        <h1 class="work-title">Your Work</h1>
        <p class="text-xs text-muted mt-1">
          <template v-if="auth.isLogged">Synced to your account</template>
          <template v-else>Saved in browser — <nuxt-link to="/" class="underline">log in</nuxt-link> to sync</template>
        </p>
      </div>
      <nuxt-link v-if="tab === 'artworks'" to="/editor?new=true" class="btn primary">
        <span class="icon icon-plus"/>
        <span>New</span>
      </nuxt-link>
      <button v-else-if="auth.isLogged" class="btn primary" @click="openCreateColl">
        <span class="icon icon-plus"/>
        <span>New collection</span>
      </button>
    </section>

    <div class="work-tabs">
      <button
          type="button"
          class="work-tab"
          :class="{active: tab === 'artworks'}"
          @click="tab = 'artworks'"
      >
        <span class="icon icon-grid"/>
        <span>Artworks</span>
      </button>
      <button
          type="button"
          class="work-tab"
          :class="{active: tab === 'collections'}"
          :disabled="!auth.isLogged"
          :title="auth.isLogged ? '' : 'Sign in to use collections'"
          @click="auth.isLogged && (tab = 'collections')"
      >
        <span class="icon icon-rhombus"/>
        <span>Collections</span>
      </button>
    </div>

    <!-- ====== ARTWORKS TAB ====== -->
    <template v-if="tab === 'artworks'">
      <div v-if="workspaces.length" class="work-toolbar">
        <div class="work-stats">
          <button
              class="stat"
              :class="{active: workFilter === 'all'}"
              @click="workFilter = 'all'"
          >
            <span class="stat-n">{{ workStats.total }}</span>
            <span class="stat-label">All</span>
          </button>
          <button
              class="stat"
              :class="{active: workFilter === 'public'}"
              @click="workFilter = 'public'"
          >
            <span class="stat-n">{{ workStats.publicCount }}</span>
            <span class="stat-label">Public</span>
          </button>
          <button
              class="stat"
              :class="{active: workFilter === 'private'}"
              @click="workFilter = 'private'"
          >
            <span class="stat-n">{{ workStats.privateCount }}</span>
            <span class="stat-label">Draft</span>
          </button>
        </div>
      </div>

      <div v-if="loadingWorks" class="work-empty">
        <p class="text-xs">Loading…</p>
      </div>

      <div v-else-if="!workspaces.length" class="work-empty">
        <span class="icon icon-brush empty-icon"/>
        <h2 class="empty-title">No artworks yet</h2>
        <p class="text-xs">Create something — it takes seconds.</p>
        <div class="empty-actions">
          <nuxt-link to="/editor?new=true" class="btn primary">
            <span class="icon icon-brush"/>
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
          name="work-item"
      >
        <div v-for="item in filteredWorks" :key="item.id as any" class="work-card">
          <nuxt-link class="work-canvas" :to="`/editor?id=${item.id_string || item.id}`">
            <div class="square">
              <div class="inside p-2">
                <img
                    v-if="isCloud(item)"
                    :src="thumbUrl(item)"
                    :alt="item.name || 'Pixel art'"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                />
                <Thumb v-else :data="item as EditorData"/>
              </div>
            </div>
          </nuxt-link>
          <div class="work-meta">
            <div class="work-name" :title="item.name || 'Untitled'">
              {{ item.name || 'Untitled' }}
            </div>
            <div class="work-info">
              <span>{{ item.width }}×{{ item.height }}</span>
              <span class="badge" :class="statusClass(item)">{{ statusLabel(item) }}</span>
            </div>
            <div class="work-actions">
              <nuxt-link :to="`/editor?id=${item.id_string || item.id}`" class="work-action" title="Edit">
                <span class="icon icon-brush"/>
              </nuxt-link>
              <nuxt-link v-if="item.id_string" :to="`/art/${item.id_string}`" class="work-action" title="View">
                <span class="icon icon-link"/>
              </nuxt-link>
              <button
                  class="work-action"
                  :class="confirmingWorkId === item.id ? 'confirm' : 'danger'"
                  @click="destroyWork(item)"
                  :title="confirmingWorkId === item.id ? 'Click again to confirm' : 'Delete'"
              >
                <span class="icon" :class="confirmingWorkId === item.id ? 'icon-check' : 'icon-trash'"/>
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <div v-else class="work-empty">
        <p class="text-xs">No {{ workFilter }} artworks.</p>
      </div>
    </template>

    <!-- ====== COLLECTIONS TAB ====== -->
    <template v-else>
      <div v-if="collections.length" class="work-toolbar">
        <div class="work-stats">
          <button class="stat" :class="{active: collFilter === 'all'}" @click="collFilter = 'all'">
            <span class="stat-n">{{ collStats.total }}</span>
            <span class="stat-label">All</span>
          </button>
          <button class="stat" :class="{active: collFilter === 'public'}" @click="collFilter = 'public'">
            <span class="stat-n">{{ collStats.publicCount }}</span>
            <span class="stat-label">Public</span>
          </button>
          <button class="stat" :class="{active: collFilter === 'private'}" @click="collFilter = 'private'">
            <span class="stat-n">{{ collStats.privateCount }}</span>
            <span class="stat-label">Private</span>
          </button>
        </div>
      </div>

      <div v-if="loadingColls" class="work-empty">
        <p class="text-xs">Loading…</p>
      </div>

      <div v-else-if="!collections.length" class="work-empty">
        <span class="icon icon-rhombus empty-icon"/>
        <h2 class="empty-title">No collections yet</h2>
        <p class="text-xs">Create one to group artworks by theme or style.</p>
        <div class="empty-actions">
          <button class="btn primary" @click="openCreateColl">
            <span class="icon icon-plus"/>
            <span>New collection</span>
          </button>
        </div>
      </div>

      <TransitionGroup
          v-else-if="filteredColls.length"
          tag="div"
          class="work-grid"
          name="work-item"
      >
        <div v-for="c in filteredColls" :key="c.id as any" class="work-card">
          <nuxt-link class="work-canvas" :to="`/collections/${c.id_string}`">
            <div class="square">
              <div class="inside">
                <img
                    v-if="coverUrl(c)"
                    :src="coverUrl(c)!"
                    :alt="c.title"
                    class="size-full"
                    loading="lazy"
                    decoding="async"
                />
                <div v-else class="coll-cover-empty">
                  <span class="icon icon-image"/>
                </div>
              </div>
            </div>
          </nuxt-link>
          <div class="work-meta">
            <div class="work-name" :title="c.title">{{ c.title || 'Untitled' }}</div>
            <div class="work-info">
              <span>{{ itemCount(c) }} {{ itemCount(c) === 1 ? 'item' : 'items' }}</span>
              <span class="badge" :class="c.status === 'public' ? 'badge-public' : 'badge-draft'">
                {{ c.status === 'public' ? 'PUBLIC' : 'PRIVATE' }}
              </span>
            </div>
            <div class="work-actions">
              <button class="work-action" @click="openEditColl(c)" title="Edit">
                <span class="icon icon-brush"/>
              </button>
              <nuxt-link
                  v-if="c.status === 'public'"
                  :to="`/collections/${c.id_string}`"
                  class="work-action"
                  title="View public page"
              >
                <span class="icon icon-link"/>
              </nuxt-link>
              <button
                  class="work-action"
                  :class="confirmingCollId === c.id ? 'confirm' : 'danger'"
                  @click="destroyColl(c)"
                  :title="confirmingCollId === c.id ? 'Click again to confirm' : 'Delete'"
              >
                <span class="icon" :class="confirmingCollId === c.id ? 'icon-check' : 'icon-trash'"/>
              </button>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <div v-else class="work-empty">
        <p class="text-xs">No {{ collFilter }} collections.</p>
      </div>
    </template>

    <!-- Collection create / edit modal -->
    <div v-if="showCollModal" class="onb-overlay" @click.self="closeCollForm">
      <div class="onb-sheet">
        <h2 class="onb-title">{{ editingColl ? 'Edit collection' : 'New collection' }}</h2>
        <div class="onb-field">
          <label class="onb-label" for="cl-title">Title</label>
          <input
              id="cl-title"
              v-model="editForm.title"
              class="input"
              type="text"
              placeholder="e.g. Retro RPG sprites"
              maxlength="120"
              @keydown.enter="saveColl"
          />
        </div>
        <div class="onb-field">
          <label class="onb-label" for="cl-desc">Description</label>
          <textarea
              id="cl-desc"
              v-model="editForm.desc"
              class="input"
              rows="2"
              placeholder="Optional"
              maxlength="200"
          />
        </div>
        <div class="onb-field">
          <span class="onb-label">Visibility</span>
          <div class="coll-vis">
            <button
                class="coll-vis-btn"
                :class="{active: editForm.status === 'public'}"
                @click="editForm.status = 'public'"
            >
              <span class="icon icon-link"/>
              <span>Public</span>
              <span class="coll-vis-hint">Anyone with the link</span>
            </button>
            <button
                class="coll-vis-btn"
                :class="{active: editForm.status === 'private'}"
                @click="editForm.status = 'private'"
            >
              <span class="icon icon-eye-cross"/>
              <span>Private</span>
              <span class="coll-vis-hint">Only you</span>
            </button>
          </div>
        </div>
        <div class="coll-form-actions">
          <button class="btn" @click="closeCollForm" :disabled="savingColl">Cancel</button>
          <button class="btn primary" @click="saveColl" :disabled="savingColl || !editForm.title.trim()">
            {{ savingColl ? 'Saving…' : (editingColl ? 'Save' : 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.work-title {
  font-size: var(--text-lg);
  line-height: var(--text-lg-lh);
}

@media (min-width: 768px) {
  .work-title {
    font-size: var(--text-2xl);
    line-height: var(--text-2xl-lh);
  }
}

.work-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: 999px;
  width: max-content;
}

.work-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  background: transparent;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  font-weight: 700;
  color: var(--muted);
  transition: color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .work-tab:hover:not([disabled]):not(.active) {
    color: var(--foreground);
  }
}

.work-tab.active {
  color: var(--primary-foreground);
  background: var(--primary);
}

.work-tab[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

.work-tab .icon {
  font-size: 14px;
}

.work-toolbar {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.work-stats {
  display: flex;
  gap: 0.125rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  cursor: pointer;
  background: transparent;
  border: none;
  color: var(--muted);
  border-radius: var(--radius);
  transition: color var(--transition), background var(--transition);
  min-width: 64px;
}

@media (hover: hover) and (pointer: fine) {
  .stat:hover {
    color: var(--primary);
  }
}

.stat.active {
  color: var(--primary);
  background: var(--surface);
}

.stat-n {
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  margin-top: 0.25rem;
}

.work-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
  padding-top: 3rem;
  padding-bottom: 3rem;
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
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.work-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 480px) {
  .work-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 768px) {
  .work-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.work-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
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
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: var(--primary);
  }
}

.work-canvas {
  display: block;
  background: #fff;
  image-rendering: pixelated;
}

.work-canvas img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.coll-cover-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 32px;
}

.work-meta {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  border-top: 1px solid var(--border);
}

.work-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 700;
  color: var(--foreground);
}

.work-info {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--muted);
}

.badge {
  margin-left: auto;
  padding: 0 0.25rem;
  font-size: 12px;
  letter-spacing: 0.04em;
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

.work-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.work-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  cursor: pointer;
  background: var(--surface-2);
  color: var(--foreground);
  border: 1px solid var(--border);
}

@media (hover: hover) and (pointer: fine) {
  .work-action:hover {
    color: var(--primary);
    border-color: var(--primary);
  }

  .work-action.danger:hover {
    color: #ff4444;
    border-color: #ff4444;
  }
}

.work-action.confirm {
  background: #ff4444;
  color: #fff;
  border-color: #ff4444;
}

.coll-vis {
  display: grid;
  gap: 0.375rem;
  grid-template-columns: repeat(2, 1fr);
}

.coll-vis-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  padding: 0.5rem 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--foreground);
  cursor: pointer;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  text-align: left;
}

.coll-vis-btn .icon {
  font-size: 16px;
  color: var(--muted);
}

.coll-vis-btn.active {
  border-color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, var(--surface));
}

.coll-vis-btn.active .icon {
  color: var(--primary);
}

.coll-vis-hint {
  font-size: 11px;
  color: var(--muted);
}

.coll-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
