<script setup lang="ts">
import {ref, computed} from 'vue'

// One shared "load" browser for the pixel, tileset and tilemap editors so the
// three pickers look and behave identically — /work-style cards + a control bar
// with search, an optional status filter, and ordering.
export interface LoadItem {
  id: string
  name: string
  previewImgs: string[]
  status?: string     // enables the status filter chip on the card
  updated?: string    // drives "Recent" ordering
}

const props = defineProps<{
  title: string
  items: LoadItem[]
  loading?: boolean
  emptyText?: string
  newLabel?: string        // shows a "+ <newLabel>" action in the bar
  filterable?: boolean     // shows the All / Public / Private filter
  folder?: boolean         // folder-style cards (tilesets / worlds)
  emptyIcon?: string       // per-type empty-preview icon
}>()

const emit = defineEmits<{ select: [id: string]; create: []; close: [] }>()

const q = ref('')
const filter = ref<'all' | 'public' | 'private'>('all')
const order = ref<'recent' | 'name'>('recent')

const filterLabel = computed(() => filter.value === 'all' ? 'All' : filter.value === 'public' ? 'Public' : 'Private')
const orderLabel = computed(() => order.value === 'name' ? 'Name' : 'Recent')

const shown = computed(() => {
  let list = props.items
  const term = q.value.trim().toLowerCase()
  if (term) list = list.filter(i => i.name.toLowerCase().includes(term))
  if (props.filterable && filter.value !== 'all') {
    const wantPublic = filter.value === 'public'
    list = list.filter(i => (i.status === 'public') === wantPublic)
  }
  const arr = [...list]
  if (order.value === 'name') arr.sort((a, b) => a.name.localeCompare(b.name))
  else arr.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')))
  return arr
})
</script>

<template>
  <UiModal class="lb-modal" width="680px" @close="emit('close')">
    <h3 class="publish-heading">{{ title }}</h3>

    <div class="lb-bar">
      <label class="lb-search">
        <span class="icon icon-search"/>
        <input v-model="q" type="search" placeholder="Search…">
      </label>

      <ui-dropdown-menu v-if="filterable" class="lb-sel">
        <button type="button" class="btn lb-sel-btn">
          <span>{{ filterLabel }}</span><span class="icon icon-chevron-down lb-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button v-for="f in (['all','public','private'] as const)" :key="f" class="file-menu-item" @click="filter = f">
              <span class="file-menu-label">
                <span>{{ f === 'all' ? 'All' : f === 'public' ? 'Public' : 'Private' }}</span>
                <span v-if="filter === f" class="icon icon-check"/>
              </span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>

      <ui-dropdown-menu class="lb-sel">
        <button type="button" class="btn lb-sel-btn">
          <span>{{ orderLabel }}</span><span class="icon icon-chevron-down lb-caret"/>
        </button>
        <template #menu>
          <div class="file-menu">
            <button class="file-menu-item" @click="order = 'recent'">
              <span class="file-menu-label"><span>Recent</span><span v-if="order === 'recent'" class="icon icon-check"/></span>
            </button>
            <button class="file-menu-item" @click="order = 'name'">
              <span class="file-menu-label"><span>Name</span><span v-if="order === 'name'" class="icon icon-check"/></span>
            </button>
          </div>
        </template>
      </ui-dropdown-menu>

      <button v-if="newLabel" type="button" class="btn primary lb-new" @click="emit('create')">
        <span class="icon icon-plus"/><span>{{ newLabel }}</span>
      </button>
    </div>

    <div class="lb-body no-scrollbar">
      <div v-if="loading" class="lb-grid">
        <div v-for="i in 8" :key="i" class="skeleton skeleton-square"/>
      </div>
      <p v-else-if="!shown.length" class="lb-empty text-xs text-muted">
        {{ q ? `Nothing matches “${q}”.` : (emptyText || 'Nothing here yet.') }}
      </p>
      <div v-else class="lb-grid">
        <ItemWorkTile
            v-for="it in shown"
            :key="it.id"
            :name="it.name"
            :preview-imgs="it.previewImgs"
            :status="it.status"
            :folder="folder"
            :empty-icon="emptyIcon"
            @click="emit('select', it.id)"
        />
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.lb-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.lb-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
  height: 2.25rem;
  padding: 0 0.625rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
}

.lb-search:focus-within {
  border-color: var(--primary);
}

.lb-search .icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.lb-search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  font-size: var(--text-sm);
  color: var(--foreground);
}

.lb-sel-btn,
.lb-new {
  flex-shrink: 0;
  gap: var(--space-2);
  white-space: nowrap;
}

.lb-caret {
  font-size: 13px;
  color: var(--muted);
}

/* Fixed height so the modal doesn't jump between few and many results — the
   grid area stays constant and scrolls internally. */
.lb-body {
  height: 56vh;
  overflow-y: auto;
}

.lb-empty {
  padding: var(--space-6) 0;
  text-align: center;
}

.lb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: var(--space-3);
  align-content: start;
}

@media (max-width: 560px) {
  .lb-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
