<script setup lang="ts">
import {toRaw} from "vue";
import {toast} from "vue-sonner";
import {debounce} from "~/helper/utils";
import {extractPaletteFromFile} from "~/helper/palette";
import {PALETTE_THEMES} from "~/helper/constants";
import type {Palette, ResponsePalette} from "~/types";

const store = useEditor()
const open = defineModel<boolean>('open', {default: false})

type Tab = 'browse' | 'save' | 'image'
const tab = ref<Tab>('browse')
const mode = ref<'replace' | 'append'>('replace')

// ----- Browse -----
const q = ref('')
const sort = ref('-score')
const palettes = ref<Palette[]>([])
const loadingList = ref(false)

async function fetchList() {
  loadingList.value = true
  try {
    const res = await useNativeFetch<ResponsePalette>('/coloring/palettes/', {
      query: {search: q.value || undefined, ordering: sort.value, page_size: 30},
    })
    palettes.value = res.results || []
  } catch {
    palettes.value = []
  } finally {
    loadingList.value = false
  }
}

const onSearch = debounce((e: { target: { value: string } }) => {
  q.value = e.target.value
  fetchList()
}, 500)

function setSort(s: string) { sort.value = s; fetchList() }

function applyLibrary(p: Palette) {
  store.applyPalette(p.colors, mode.value, p.id)
  toast.success(`${mode.value === 'append' ? 'Added' : 'Applied'} "${p.name}"`)
  open.value = false
}

// ----- Save current -----
const saveName = ref('')
const saveTags = ref<string[]>([])
const saving = ref(false)

function toggleTag(t: string) {
  const i = saveTags.value.indexOf(t)
  if (i >= 0) saveTags.value.splice(i, 1)
  else saveTags.value.push(t)
}

async function saveCurrent() {
  const colors = toRaw(store.editorData.colors) || []
  if (!colors.length) { toast.error('No colors to save'); return }
  saving.value = true
  try {
    const res = await useNativeFetch<Palette>('/coloring/palettes/', {
      method: 'POST',
      body: {name: saveName.value.trim() || store.editorData.name || 'My palette', colors, tags: saveTags.value},
    })
    store.editorData.palette = res.id
    toast.success(`Saved "${res.name}"`)
    open.value = false
  } catch {
    toast.error('Save failed')
  } finally {
    saving.value = false
  }
}

// ----- From image -----
const count = ref(16)
const detecting = ref(false)
const detected = ref<string[]>([])
let lastFile: File | null = null

async function detect() {
  if (!lastFile) return
  detecting.value = true
  try {
    detected.value = await extractPaletteFromFile(lastFile, count.value)
  } catch {
    toast.error('Could not read image')
  } finally {
    detecting.value = false
  }
}

function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  lastFile = file
  detect()
}

const reDetect = debounce(detect, 250)
watch(count, () => { if (lastFile) reDetect() })

function applyImage() {
  if (!detected.value.length) return
  store.applyPalette(detected.value, mode.value, null)
  toast.success('Applied palette from image')
  open.value = false
}

watch(open, (v) => {
  if (v) {
    if (!palettes.value.length) fetchList()
    saveName.value = store.editorData.name || ''
    saveTags.value = []
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="share-overlay" @click.self="open = false">
      <div class="share-modal pp-modal" role="dialog" aria-modal="true" @keydown.escape="open = false">
        <header class="pp-head">
          <div class="pp-tabs">
            <button class="pp-tab" :class="{active: tab === 'browse'}" @click="tab = 'browse'">Browse</button>
            <button class="pp-tab" :class="{active: tab === 'save'}" @click="tab = 'save'">Save current</button>
            <button class="pp-tab" :class="{active: tab === 'image'}" @click="tab = 'image'">From image</button>
          </div>
          <button class="pp-close" aria-label="Close" @click="open = false">
            <span class="icon icon-x"/>
          </button>
        </header>

        <!-- Apply mode (browse + image) -->
        <div v-if="tab !== 'save'" class="pp-mode">
          <span class="pp-mode-label">Apply as</span>
          <div class="pp-seg">
            <button class="pp-seg-btn" :class="{active: mode === 'replace'}" @click="mode = 'replace'" title="Recolor by index">Replace</button>
            <button class="pp-seg-btn" :class="{active: mode === 'append'}" @click="mode = 'append'" title="Add to current palette">Add</button>
          </div>
        </div>

        <!-- BROWSE -->
        <div v-if="tab === 'browse'" class="pp-body">
          <div class="pp-toolbar">
            <input type="text" class="pp-search" placeholder="Search palettes..." @input="onSearch"/>
            <div class="pp-sorts">
              <button class="pp-chip" :class="{active: sort === '-score'}" @click="setSort('-score')">Popular</button>
              <button class="pp-chip" :class="{active: sort === '-usage_count'}" @click="setSort('-usage_count')">Used</button>
              <button class="pp-chip" :class="{active: sort === '-created'}" @click="setSort('-created')">New</button>
            </div>
          </div>
          <div v-if="loadingList" class="pp-list-state">Loading…</div>
          <div v-else-if="!palettes.length" class="pp-list-state">No palettes found.</div>
          <div v-else class="pp-list">
            <button v-for="p in palettes" :key="p.id" class="pp-item" @click="applyLibrary(p)" :title="`${p.name} — ${p.color_count} colors`">
              <span class="pp-item-strip">
                <span v-for="(c, i) in p.colors.slice(0, 16)" :key="i" class="pp-item-sw" :style="{ backgroundColor: c }"/>
              </span>
              <span class="pp-item-name">{{ p.name }}</span>
              <span class="pp-item-count">{{ p.color_count }}</span>
            </button>
          </div>
        </div>

        <!-- SAVE CURRENT -->
        <div v-else-if="tab === 'save'" class="pp-body">
          <p class="pp-hint">Save the current {{ store.editorData.colors.length }}-color palette to the library and link it to this artwork.</p>
          <div class="pp-cur-strip">
            <span v-for="(c, i) in store.editorData.colors" :key="i" class="pp-cur-sw" :style="{ backgroundColor: c }"/>
          </div>
          <input v-model="saveName" type="text" class="pp-search" placeholder="Palette name" @keydown.enter="saveCurrent"/>
          <p class="pp-themes-label">Themes <span>(optional)</span></p>
          <div class="pp-themes">
            <button
                v-for="t in PALETTE_THEMES" :key="t"
                type="button"
                class="pp-theme" :class="{ active: saveTags.includes(t) }"
                @click="toggleTag(t)"
            >{{ t }}</button>
          </div>
          <button class="btn primary pp-action" :disabled="saving" @click="saveCurrent">
            {{ saving ? 'Saving…' : 'Save palette' }}
          </button>
        </div>

        <!-- FROM IMAGE -->
        <div v-else class="pp-body">
          <label class="pp-drop">
            <input type="file" accept="image/*" class="pp-file" @change="onFile"/>
            <span class="icon icon-image"/>
            <span>{{ lastFile ? lastFile.name : 'Choose an image' }}</span>
          </label>
          <div class="pp-count">
            <label>Colors: <strong>{{ count }}</strong></label>
            <input type="range" min="2" max="32" v-model.number="count"/>
          </div>
          <div v-if="detecting" class="pp-list-state">Detecting…</div>
          <div v-else-if="detected.length" class="pp-cur-strip">
            <span v-for="(c, i) in detected" :key="i" class="pp-cur-sw" :style="{ backgroundColor: c }"/>
          </div>
          <div class="pp-image-actions">
            <button class="btn primary pp-action" :disabled="!detected.length" @click="applyImage">Apply to canvas</button>
            <nuxt-link to="/palettes/color-palette-from-image" class="pp-publish-link">Publish as palette →</nuxt-link>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pp-modal {
  max-width: 560px;
  width: 94%;
  padding: 0;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.pp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.5rem 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.pp-tabs { display: flex; gap: var(--space-1); }

.pp-tab {
  padding: 0.375rem 0.75rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.pp-tab.active { color: var(--primary); background: color-mix(in oklab, var(--primary) 12%, transparent); }

.pp-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.pp-close:hover { color: var(--foreground); background: var(--surface-2); }

.pp-mode {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.pp-mode-label { font-size: var(--text-2xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }

.pp-seg, .pp-sorts { display: inline-flex; gap: var(--space-1); }

.pp-seg-btn, .pp-chip {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.pp-seg-btn.active, .pp-chip.active {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border-color: var(--primary);
  color: var(--primary);
}

.pp-body { padding: var(--space-4); overflow: auto; }

.pp-toolbar { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; margin-bottom: 0.625rem; }

.pp-search {
  flex: 1 1 180px;
  height: 34px;
  padding: 0 0.625rem !important;
  font-size: var(--text-xs);
}

.pp-list { display: flex; flex-direction: column; gap: var(--space-2); }

.pp-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--transition);
}

.pp-item-strip { display: flex; height: 24px; width: 120px; flex: none; border-radius: var(--radius-sm); overflow: hidden; }
.pp-item-sw { flex: 1 1 0; min-width: 0; }
.pp-item-name { flex: 1; font-size: var(--text-xs); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pp-item-count { flex: none; font-size: var(--text-2xs); color: var(--muted); font-weight: 700; }

.pp-list-state { padding: var(--space-6); text-align: center; color: var(--muted); font-size: var(--text-sm); }

.pp-hint { font-size: var(--text-xs); color: var(--muted); margin-bottom: 0.5rem; }

.pp-cur-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-bottom: 0.625rem;
}

.pp-cur-sw { width: 26px; height: 26px; border-radius: var(--radius-sm); }

.pp-themes-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0.625rem 0 0.375rem;
}

.pp-themes-label span { font-weight: 500; text-transform: none; letter-spacing: 0; }

.pp-themes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  max-height: 120px;
  overflow: auto;
}

.pp-theme {
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

.pp-theme.active {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  border-color: var(--primary);
  color: var(--primary);
}

.pp-action { width: 100%; margin-top: 0.5rem; }

.pp-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: 1.25rem;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
}

.pp-drop:hover { color: var(--primary); }
.pp-file { display: none; }

.pp-count { display: flex; align-items: center; gap: 0.625rem; margin: 0.75rem 0; font-size: var(--text-xs); }
.pp-count input[type="range"] { flex: 1; }

.pp-image-actions { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); }
.pp-publish-link { font-size: var(--text-xs); color: var(--primary); font-weight: 600; }
</style>
