<script setup lang="ts">
import type {APIResponse, Collection} from "~/types";
import {toast} from "vue-sonner";

interface PickerCollection {
  id: number
  id_string: string
  title: string
  status: string
  isNew?: boolean
}

const selected = defineModel<PickerCollection[]>({default: () => []})

const all = ref<PickerCollection[]>([])
const query = ref('')
const open = ref(false)
const loading = ref(false)
const creating = ref(false)
const rootEl = ref<HTMLElement | null>(null)

async function fetchCollections() {
  loading.value = true
  try {
    const res = await useNativeFetch<APIResponse<Collection & {status: string}>>(
        '/coloring/collections/',
        {params: {mine: 1, page_size: 200, ordering: '-updated'}},
    )
    all.value = res.results.map(c => ({
      id: c.id!,
      id_string: c.id_string,
      title: c.title,
      status: (c as any).status || 'public',
    }))
  } catch {
    toast.error('Could not load collections')
  } finally {
    loading.value = false
  }
}

const selectedIds = computed(() => new Set(selected.value.map(c => c.id)))

const suggestions = computed(() => {
  const q = query.value.trim().toLowerCase()
  const pool = all.value.filter(c => !selectedIds.value.has(c.id))
  if (!q) return pool.slice(0, 8)
  return pool.filter(c => c.title.toLowerCase().includes(q)).slice(0, 8)
})

const canCreate = computed(() => {
  const q = query.value.trim()
  if (!q) return false
  return !all.value.some(c => c.title.trim().toLowerCase() === q.toLowerCase())
})

function add(c: PickerCollection) {
  if (selectedIds.value.has(c.id)) return
  selected.value = [...selected.value, c]
  query.value = ''
}

function remove(id: number) {
  selected.value = selected.value.filter(c => c.id !== id)
}

async function createAndAdd() {
  const title = query.value.trim()
  if (!title) return
  creating.value = true
  try {
    const created = await useNativeFetch<Collection & {status: string}>(
        '/coloring/collections/',
        {
          method: 'POST',
          body: {
            title,
            name: title,
            type: 'saved',
            status: 'public',
          },
        },
    )
    const item: PickerCollection = {
      id: created.id!,
      id_string: created.id_string,
      title: created.title,
      status: (created as any).status || 'public',
      isNew: true,
    }
    all.value.unshift(item)
    add(item)
  } catch {
    toast.error('Could not create collection')
  } finally {
    creating.value = false
  }
}

function onFocus() {
  open.value = true
  if (all.value.length === 0) fetchCollections()
}

function onBlur(e: FocusEvent) {
  // delay close so click on suggestion fires
  const next = e.relatedTarget as HTMLElement | null
  if (rootEl.value && next && rootEl.value.contains(next)) return
  setTimeout(() => {
    open.value = false
  }, 120)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (suggestions.value.length > 0) {
      add(suggestions.value[0]!)
    } else if (canCreate.value) {
      createAndAdd()
    }
  } else if (e.key === 'Backspace' && !query.value && selected.value.length > 0) {
    remove(selected.value[selected.value.length - 1]!.id)
  }
}
</script>

<template>
  <div class="cl-picker" ref="rootEl">
    <div class="cl-picker-input" @click="($refs.inputEl as HTMLInputElement)?.focus()">
      <span
          v-for="c in selected"
          :key="c.id"
          class="cl-picker-chip"
      >
        <span class="cl-picker-chip-label">{{ c.title }}</span>
        <button
            type="button"
            class="cl-picker-chip-x"
            @click.stop="remove(c.id)"
            :aria-label="`Remove ${c.title}`"
        >
          <span class="icon icon-x"/>
        </button>
      </span>
      <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="cl-picker-text"
          :placeholder="selected.length ? '' : 'Search or create…'"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
      />
    </div>

    <div v-if="open" class="cl-picker-menu">
      <div v-if="loading" class="cl-picker-row cl-picker-muted">Loading…</div>
      <template v-else>
        <button
            v-for="c in suggestions"
            :key="c.id"
            type="button"
            class="cl-picker-row"
            @mousedown.prevent="add(c)"
        >
          <span class="cl-picker-row-title">{{ c.title }}</span>
          <span class="cl-picker-row-badge" :class="c.status === 'public' ? 'badge-public' : 'badge-draft'">
            {{ c.status === 'public' ? 'PUBLIC' : 'PRIVATE' }}
          </span>
        </button>
        <button
            v-if="canCreate"
            type="button"
            class="cl-picker-row cl-picker-create"
            @mousedown.prevent="createAndAdd"
            :disabled="creating"
        >
          <span class="icon icon-plus"/>
          <span>Create "{{ query.trim() }}"</span>
        </button>
        <div
            v-if="!suggestions.length && !canCreate"
            class="cl-picker-row cl-picker-muted"
        >
          {{ all.length ? 'No matches' : 'No collections yet — type a name to create one' }}
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cl-picker {
  position: relative;
  width: 100%;
}

.cl-picker-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: text;
  min-height: 2.25rem;
}

.cl-picker-input:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent);
}

.cl-picker-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.25rem 0 0.5rem;
  height: 22px;
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border: 1px solid color-mix(in oklab, var(--primary) 40%, transparent);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
}

.cl-picker-chip-label {
  max-width: 12ch;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-picker-chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}

.cl-picker-chip-x:hover {
  background: color-mix(in oklab, var(--primary) 25%, transparent);
}

.cl-picker-chip-x .icon {
  font-size: 10px;
}

.cl-picker-text {
  flex: 1 1 6rem;
  min-width: 6rem;
  border: 0;
  background: transparent;
  outline: none;
  padding: 0 0.25rem;
  height: 22px;
  color: var(--foreground);
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
}

.cl-picker-menu {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-hover);
  overflow: hidden;
  max-height: 240px;
  overflow-y: auto;
}

.cl-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--foreground);
}

.cl-picker-row:hover:not([disabled]) {
  background: var(--surface-2);
}

.cl-picker-row-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}

.cl-picker-row-badge {
  flex-shrink: 0;
  padding: 0 0.25rem;
  font-size: 11px;
  letter-spacing: 0.04em;
  border-radius: 4px;
}

.cl-picker-row-badge.badge-public {
  background: var(--primary);
  color: var(--primary-foreground);
}

.cl-picker-row-badge.badge-draft {
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.cl-picker-create {
  border-top: 1px solid var(--border);
  font-weight: 700;
  color: var(--primary);
}

.cl-picker-create .icon {
  margin-right: 0.25rem;
}

.cl-picker-muted {
  color: var(--muted);
  cursor: default;
}
</style>
