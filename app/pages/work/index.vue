<script setup lang="ts">
import type {APIResponse, EditorData, SharedPage} from "~/types";
import {getStorageItem, sharedPage2EditorData} from "~/helper/utils";
import {toast} from "vue-sonner";

const auth = useAuthStore()
const workspaces = ref<EditorData[]>([])
const loading = ref(false)
const filter = ref<'all' | 'public' | 'private'>('all')
const confirmingId = ref<string | number | null>(null)
let confirmTimer: ReturnType<typeof setTimeout> | null = null

useCustomSeoMeta({
  title: "Your Work - Simple Pixel Art",
  description: "Manage your pixel art drafts and published works. Edit, share, or delete.",
  canonical: "https://simplepixelart.com/work",
  robots: 'noindex, follow',
})

async function fetchData() {
  loading.value = true
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<APIResponse<SharedPage>>(`/coloring/shared-pages/`, {
        params: {
          user: auth.logged.username,
          full_schema: true,
          page_size: 100,
          is_template: true,
        },
      })
      workspaces.value = res.results.map(x => sharedPage2EditorData(x))
    } else {
      workspaces.value = Object.values(getStorageItem('workspaces'))
    }
  } finally {
    loading.value = false
  }
}

async function destroy(item: EditorData) {
  if (confirmingId.value !== item.id) {
    confirmingId.value = item.id
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      confirmingId.value = null
    }, 3000)
    return
  }
  if (confirmTimer) clearTimeout(confirmTimer)
  confirmingId.value = null

  const currentId = localStorage.getItem('workspace_current')
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
    if (currentId === item.id.toString()) {
      localStorage.setItem('workspace_current', "")
    }
    toast.success('Deleted')
    await fetchData()
  } catch {
    toast.error('Delete failed')
  }
}

function pixelCount(item: EditorData): number {
  let n = 0
  for (const layer of item.layers || []) {
    n += Object.keys(layer.pixels || {}).length
  }
  return n
}

// Use API status field — only cloud SharedPage has status='public'.
// Local workspaces have no status, treated as draft.
function isPublic(w: EditorData): boolean {
  return w.status === 'public'
}

const filtered = computed(() => {
  if (filter.value === 'all') return workspaces.value
  const wantPublic = filter.value === 'public'
  return workspaces.value.filter(w => isPublic(w) === wantPublic)
})

const stats = computed(() => ({
  total: workspaces.value.length,
  publicCount: workspaces.value.filter(isPublic).length,
  privateCount: workspaces.value.filter(w => !isPublic(w)).length,
}))

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="page">
    <!-- Header -->
    <section class="work-hero">
      <div>
        <h1 class="work-title">Your Work</h1>
        <p class="text-xs text-gray-500 mt-1">
          <template v-if="auth.isLogged">Synced to your account</template>
          <template v-else>Saved in browser — <nuxt-link to="/" class="underline">log in</nuxt-link> to sync</template>
        </p>
      </div>
      <nuxt-link to="/editor?new=true" class="btn primary">
        <span class="icon icon-plus"/>
        <span>New</span>
      </nuxt-link>
    </section>

    <!-- Stats + filters -->
    <div v-if="workspaces.length" class="work-toolbar">
      <div class="work-stats">
        <button
            class="stat"
            :class="{active: filter === 'all'}"
            @click="filter = 'all'"
        >
          <span class="stat-n">{{ stats.total }}</span>
          <span class="stat-label">All</span>
        </button>
        <button
            class="stat"
            :class="{active: filter === 'public'}"
            @click="filter = 'public'"
        >
          <span class="stat-n">{{ stats.publicCount }}</span>
          <span class="stat-label">Public</span>
        </button>
        <button
            class="stat"
            :class="{active: filter === 'private'}"
            @click="filter = 'private'"
        >
          <span class="stat-n">{{ stats.privateCount }}</span>
          <span class="stat-label">Draft</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="work-empty">
      <p class="text-xs">Loading…</p>
    </div>

    <!-- Empty -->
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

    <!-- Grid -->
    <div v-else-if="filtered.length" class="work-grid">
      <div v-for="item in filtered" :key="item.id as any" class="work-card">
        <nuxt-link class="work-canvas" :to="`/editor?id=${item.id_string || item.id}`">
          <div class="square">
            <div class="inside p-2">
              <Thumb :data="item"/>
            </div>
          </div>
        </nuxt-link>
        <div class="work-meta">
          <div class="work-name" :title="item.name || 'Untitled'">
            {{ item.name || 'Untitled' }}
          </div>
          <div class="work-info">
            <span>{{ item.width }}×{{ item.height }}</span>
            <span class="dot">·</span>
            <span>{{ pixelCount(item) }} px</span>
            <span v-if="isPublic(item)" class="badge">PUBLIC</span>
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
                :class="confirmingId === item.id ? 'confirm' : 'danger'"
                @click="destroy(item)"
                :title="confirmingId === item.id ? 'Click again to confirm' : 'Delete'"
            >
              <span class="icon" :class="confirmingId === item.id ? 'icon-check' : 'icon-trash'"/>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- No results for current filter -->
    <div v-else class="work-empty">
      <p class="text-xs">No {{ filter }} artworks.</p>
    </div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.work-hero {
  @apply flex items-start justify-between gap-3;
}

.work-title {
  @apply text-lg md:text-2xl;
}

.work-toolbar {
  @apply py-1;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.work-stats {
  @apply flex gap-0.5;
}

.stat {
  @apply flex flex-col items-center justify-center px-4 py-2 cursor-pointer;
  background: transparent;
  border: none;
  color: var(--muted);
  transition: color 60ms steps(2), background 60ms steps(2);
  min-width: 64px;
}

.stat:hover {
  color: var(--primary);
}

.stat.active {
  color: var(--primary);
  background: var(--surface);
}

.stat-n {
  @apply text-lg font-bold;
  line-height: 1;
}

.stat-label {
  @apply text-xs mt-1 uppercase;
  letter-spacing: 0.08em;
}

.work-empty {
  @apply flex flex-col items-center justify-center text-center gap-2 py-12;
}

.empty-icon {
  font-size: 48px;
  color: var(--primary);
}

.empty-title {
  @apply text-base font-bold;
  color: var(--foreground);
}

.empty-actions {
  @apply flex gap-2 mt-3;
}

.work-grid {
  @apply grid gap-2;
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
  @apply flex flex-col;
  background: var(--surface);
  border: 2px solid var(--shadow-px);
  box-shadow: 3px 3px 0 0 var(--shadow-px);
  transition: transform 80ms steps(2), box-shadow 80ms steps(2);
}

.work-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 0 var(--shadow-px);
  border-color: var(--primary);
}

.work-canvas {
  display: block;
  background: #fff;
}

.work-meta {
  @apply flex flex-col gap-1 p-2 text-xs;
  border-top: 1px solid var(--border);
}

.work-name {
  @apply truncate font-bold;
  color: var(--foreground);
}

.work-info {
  @apply flex items-center gap-1 text-xs;
  color: var(--muted);
}

.work-info .dot {
  opacity: 0.5;
}

.badge {
  @apply ml-auto px-1;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.work-actions {
  @apply flex gap-1 mt-1;
}

.work-action {
  @apply flex items-center justify-center size-7 cursor-pointer;
  background: var(--surface-2);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.work-action:hover {
  color: var(--primary);
  border-color: var(--primary);
}

.work-action.danger:hover {
  color: #ff4444;
  border-color: #ff4444;
}

.work-action.confirm {
  background: #ff4444;
  color: #fff;
  border-color: #ff4444;
}
</style>
