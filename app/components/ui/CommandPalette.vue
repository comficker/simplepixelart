<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

type Cmd = {
  id: string
  label: string
  hint?: string
  icon?: string
  group: 'Navigate' | 'Create' | 'Theme' | 'Help'
  keywords?: string
  run: () => void | Promise<void>
}

const router = useRouter()
const { current, setTheme, themes } = useTheme() as any

const open = ref(false)
const query = ref('')
const selected = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const baseCommands = computed<Cmd[]>(() => [
  { id: 'nav:home', label: 'Home', icon: 'icon-square', group: 'Navigate', keywords: 'index start', run: () => router.push('/') },
  { id: 'nav:editor', label: 'PX Editor', icon: 'icon-square', hint: 'New canvas', group: 'Navigate', keywords: 'draw paint create', run: () => router.push('/editor') },
  { id: 'nav:convert', label: 'Convertor', icon: 'icon-swap', group: 'Navigate', keywords: 'image to pixel', run: () => router.push('/convert') },
  { id: 'nav:arts', label: 'Discovery', icon: 'icon-search', group: 'Navigate', keywords: 'gallery browse art', run: () => router.push('/arts') },
  { id: 'nav:work', label: 'Your work', icon: 'icon-grid', group: 'Navigate', keywords: 'mine artworks', run: () => router.push('/work') },
  { id: 'nav:collections', label: 'Your collections', icon: 'icon-rhombus', group: 'Navigate', keywords: 'collection group theme album', run: () => router.push('/work?tab=collections') },
  { id: 'create:new', label: 'New pixel art', icon: 'icon-square', hint: 'Open editor', group: 'Create', keywords: 'start blank', run: () => router.push('/editor') },
  { id: 'create:convert', label: 'Convert an image', icon: 'icon-swap', group: 'Create', keywords: 'photo upload', run: () => router.push('/convert') },
  { id: 'help:guide', label: 'Guidelines', icon: 'icon-search', group: 'Help', run: () => router.push('/guidelines') },
  { id: 'help:about', label: 'About SimplePixelArt', icon: 'icon-search', group: 'Help', run: () => router.push('/about') },
  { id: 'help:contact', label: 'Contact', icon: 'icon-search', group: 'Help', run: () => router.push('/contact') },
])

const themeCommands = computed<Cmd[]>(() =>
    (themes || []).map((t: any) => ({
      id: `theme:${t.id}`,
      label: `Theme: ${t.name}`,
      hint: current.value === t.id ? 'Active' : undefined,
      icon: 'icon-adjust',
      group: 'Theme' as const,
      keywords: `theme color ${t.id} ${t.name}`,
      run: () => setTheme(t.id),
    }))
)

const allCommands = computed(() => [...baseCommands.value, ...themeCommands.value])

function score(cmd: Cmd, q: string): number {
  if (!q) return 1
  const haystack = `${cmd.label} ${cmd.keywords ?? ''} ${cmd.group}`.toLowerCase()
  const needle = q.toLowerCase().trim()
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle)
  // sub-sequence match
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return 10
  }
  return 0
}

const filtered = computed(() => {
  const q = query.value
  return allCommands.value
      .map(cmd => ({ cmd, s: score(cmd, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.cmd)
})

const grouped = computed(() => {
  const map = new Map<string, Cmd[]>()
  filtered.value.forEach(cmd => {
    if (!map.has(cmd.group)) map.set(cmd.group, [])
    map.get(cmd.group)!.push(cmd)
  })
  // flatten with group headers
  const flat: Array<{ type: 'header'; label: string } | { type: 'item'; cmd: Cmd; index: number }> = []
  let index = 0
  for (const [group, list] of map) {
    flat.push({ type: 'header', label: group })
    for (const cmd of list) flat.push({ type: 'item', cmd, index: index++ })
  }
  return flat
})

const flatItems = computed(() => filtered.value)

watch(query, () => { selected.value = 0 })

function openPalette() {
  open.value = true
  query.value = ''
  selected.value = 0
  nextTick(() => inputEl.value?.focus())
}

function closePalette() {
  open.value = false
}

function move(delta: number) {
  const n = flatItems.value.length
  if (!n) return
  selected.value = (selected.value + delta + n) % n
  nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView() {
  const el = listEl.value?.querySelector<HTMLElement>(`[data-idx="${selected.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

async function activate(cmd?: Cmd) {
  const target = cmd ?? flatItems.value[selected.value]
  if (!target) return
  closePalette()
  await target.run()
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); closePalette() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); activate() }
}

function onGlobalKey(e: KeyboardEvent) {
  const isK = e.key === 'k' || e.key === 'K'
  if (isK && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    open.value ? closePalette() : openPalette()
  }
}

defineExpose({ open: openPalette, close: closePalette })

onMounted(() => {
  window.addEventListener('keydown', onGlobalKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cmdk">
      <div v-if="open" class="cmdk-overlay" @click.self="closePalette" @keydown="onKey">
        <div class="cmdk" role="dialog" aria-label="Command palette">
          <div class="cmdk-input-wrap">
            <span class="icon icon-search cmdk-search-icon" aria-hidden="true"/>
            <input
                ref="inputEl"
                v-model="query"
                class="cmdk-input"
                placeholder="Type a command or search…"
                spellcheck="false"
                autocomplete="off"
                @keydown="onKey"
            >
            <kbd class="kbd">esc</kbd>
          </div>
          <div ref="listEl" class="cmdk-list" role="listbox">
            <template v-if="flatItems.length">
              <template v-for="(row, i) in grouped" :key="i">
                <div v-if="row.type === 'header'" class="cmdk-group">{{ row.label }}</div>
                <button
                    v-else
                    type="button"
                    class="cmdk-item"
                    :class="{ active: row.index === selected }"
                    :data-idx="row.index"
                    role="option"
                    :aria-selected="row.index === selected"
                    @mouseenter="selected = row.index"
                    @click="activate(row.cmd)"
                >
                  <span class="cmdk-item-icon icon" :class="row.cmd.icon" aria-hidden="true"/>
                  <span class="cmdk-item-label">{{ row.cmd.label }}</span>
                  <span v-if="row.cmd.hint" class="cmdk-item-hint">{{ row.cmd.hint }}</span>
                </button>
              </template>
            </template>
            <div v-else class="cmdk-empty">
              <span class="icon icon-search" aria-hidden="true"/>
              <span>No matches for “{{ query }}”</span>
            </div>
          </div>
          <div class="cmdk-foot">
            <span class="cmdk-foot-grp"><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> navigate</span>
            <span class="cmdk-foot-grp"><kbd class="kbd">↵</kbd> select</span>
            <span class="cmdk-foot-grp"><kbd class="kbd">esc</kbd> close</span>
            <span class="cmdk-foot-spacer"/>
            <span class="cmdk-foot-brand">SimplePixel<span class="cmdk-foot-brand-accent">Art</span></span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cmdk-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12vh 1rem 1rem;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}

.cmdk {
  width: 100%;
  max-width: 580px;
  background: color-mix(in oklab, var(--surface) 96%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  border-radius: 14px;
  box-shadow:
    0 1px 0 0 color-mix(in oklab, var(--foreground) 8%, transparent) inset,
    0 24px 64px -12px rgba(0, 0, 0, 0.45),
    0 8px 16px -8px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.cmdk-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 14px 14px;
  border-bottom: 1px solid var(--border);
}

.cmdk-search-icon {
  color: var(--muted);
  font-size: 16px;
  flex-shrink: 0;
}

.cmdk-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  font-weight: 500;
  color: var(--foreground);
  padding: 0;
}

.cmdk-input::placeholder {
  color: var(--muted);
}

.cmdk-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.cmdk-group {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 10px 10px 6px;
}

.cmdk-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 9px 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.cmdk-item.active {
  background: color-mix(in oklab, var(--primary) 14%, transparent);
  color: var(--foreground);
}

.cmdk-item.active::after {
  content: "↵";
  margin-left: auto;
  font-size: 11px;
  color: var(--primary);
  opacity: 0.9;
}

.cmdk-item-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  font-size: 14px;
}

.cmdk-item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmdk-item-hint {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.02em;
}

.cmdk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 12px;
  color: var(--muted);
  font-size: 13px;
}

.cmdk-empty .icon {
  font-size: 22px;
  opacity: 0.6;
}

.cmdk-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: color-mix(in oklab, var(--surface-2) 50%, transparent);
  font-size: 11px;
  color: var(--muted);
}

.cmdk-foot-grp {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.cmdk-foot-spacer { flex: 1; }

.cmdk-foot-brand {
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.01em;
  color: var(--foreground);
  opacity: 0.7;
}

.cmdk-foot-brand-accent {
  color: var(--primary);
}

/* Transitions */
.cmdk-enter-active,
.cmdk-leave-active {
  transition: opacity 180ms ease;
}
.cmdk-enter-active .cmdk,
.cmdk-leave-active .cmdk {
  transition: transform 240ms cubic-bezier(.34,1.56,.64,1), opacity 180ms ease;
}
.cmdk-enter-from,
.cmdk-leave-to {
  opacity: 0;
}
.cmdk-enter-from .cmdk {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.cmdk-leave-to .cmdk {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

@media (max-width: 600px) {
  .cmdk-overlay { padding-top: 6vh; }
  .cmdk { max-height: 80vh; border-radius: 10px; }
  .cmdk-foot { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cmdk-enter-active,
  .cmdk-leave-active,
  .cmdk-enter-active .cmdk,
  .cmdk-leave-active .cmdk { transition: none; }
}
</style>
