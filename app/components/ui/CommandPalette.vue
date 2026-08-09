<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

type Cmd = {
  id: string
  label: string
  hint?: string
  icon?: string
  group: 'Navigate' | 'Create' | 'Account' | 'Theme' | 'Help' | 'System'
  keywords?: string
  swatch?: { ring: string; ink: string }   // Theme commands render as a colour circle
  active?: boolean                          // currently-applied theme
  run: () => void | Promise<void>
}

// Group display order — Help / System sit at the very bottom.
const GROUP_ORDER = ['Theme', 'Navigate', 'Create', 'Account', 'Help', 'System']

const router = useRouter()
const { current, setTheme, themes } = useTheme() as any
const auth = useAuthStore()
const config = useRuntimeConfig()
const requestURL = useRequestURL()
// Sign-in URL — a guest near the storage ceiling can back local work up to the
// cloud (which also frees local space).
const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  return `${apiBase}/auth/google?state=${encodeURIComponent(`${requestURL.origin}/auth/callback`)}`
})

const open = ref(false)
const query = ref('')
const selected = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

// Local-storage usage readout — lets users see how full the browser store is
// (the editor keeps boards/undo/art there; once it fills, saves silently
// degrade — the "Reset app data" command below is the escape hatch).
const STORAGE_LIMIT = 5 * 1024 * 1024   // conservative ~5 MB localStorage budget
const storage = ref<{ usedMB: string; pct: number; boards: number; arts: number } | null>(null)
function computeStorage() {
  if (typeof localStorage === 'undefined') { storage.value = null; return }
  let chars = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k == null) continue
    chars += k.length + (localStorage.getItem(k)?.length || 0)
  }
  const bytes = chars * 2   // localStorage holds UTF-16 code units
  let boards = 0, arts = 0
  try {
    const wf = JSON.parse(localStorage.getItem('workspace_full') || 'null')
    const wl = JSON.parse(localStorage.getItem('workspace_layout') || 'null')
    boards = wf?.boards?.length || wl?.boards?.length || 0
    arts = Object.keys(JSON.parse(localStorage.getItem('workspaces') || '{}')).length
  } catch { /* malformed — leave at 0 */ }
  storage.value = {
    usedMB: (bytes / 1024 / 1024).toFixed(1),
    pct: Math.min(100, Math.round((bytes / STORAGE_LIMIT) * 100)),
    boards, arts,
  }
}

const baseCommands = computed<Cmd[]>(() => [
  { id: 'nav:home', label: 'Home', icon: 'icon-square', group: 'Navigate', keywords: 'index start', run: () => router.push('/') },
  { id: 'nav:editor', label: 'PX Editor', icon: 'icon-pen', hint: 'New canvas', group: 'Navigate', keywords: 'draw paint create canvas', run: () => router.push('/editor') },
  { id: 'nav:convert', label: 'Image to Pixel Art', icon: 'icon-swap', group: 'Navigate', keywords: 'convert photo pixelate', run: () => router.push('/convert') },
  { id: 'nav:tileset', label: 'Tileset Slicer', icon: 'icon-select', hint: 'Slice a sheet', group: 'Navigate', keywords: 'spritesheet slice cut sprites tiles', run: () => router.push('/tilesets/slicer') },
  { id: 'nav:tilesets', label: 'Tileset Editor', icon: 'icon-grid', hint: 'Curate tiles', group: 'Navigate', keywords: 'tileset tiles curate registry set', run: () => router.push('/tilesets/editor') },
  { id: 'nav:tilemap', label: 'Tilemap Editor', icon: 'icon-rhombus', hint: 'Grid / iso map', group: 'Navigate', keywords: 'tilemap map grid isometric tiles level scene world', run: () => router.push('/tilemaps/editor') },
  { id: 'nav:palettes', label: 'Palettes', icon: 'icon-bucket', group: 'Navigate', keywords: 'color palette swatches library', run: () => router.push('/palettes') },
  { id: 'nav:arts', label: 'Discovery', icon: 'icon-search', group: 'Navigate', keywords: 'gallery browse art', run: () => router.push('/arts') },
  { id: 'nav:collections', label: 'Your collections', icon: 'icon-rhombus', group: 'Navigate', keywords: 'collection group theme album', run: () => router.push('/work?tab=collections') },
  { id: 'create:new', label: 'New pixel art', icon: 'icon-square', hint: 'Open editor', group: 'Create', keywords: 'start blank draw', run: () => router.push('/editor') },
  { id: 'create:convert', label: 'Convert an image', icon: 'icon-swap', group: 'Create', keywords: 'photo upload pixelate', run: () => router.push('/convert') },
  { id: 'create:tileset', label: 'New tileset', icon: 'icon-grid', group: 'Create', keywords: 'tiles curate set registry', run: () => router.push('/tilesets/editor') },
  { id: 'create:tilemap', label: 'New tilemap', icon: 'icon-rhombus', hint: 'Grid / iso', group: 'Create', keywords: 'map grid isometric build level scene world', run: () => router.push('/tilemaps/editor') },
  { id: 'create:slice', label: 'Slice a tileset', icon: 'icon-select', group: 'Create', keywords: 'spritesheet cut sprites tiles', run: () => router.push('/tilesets/slicer') },
  { id: 'create:palette', label: 'Extract a palette', icon: 'icon-image', hint: 'From image', group: 'Create', keywords: 'color palette from image extract', run: () => router.push('/palettes/color-palette-from-image') },
  { id: 'help:guide', label: 'Guidelines', icon: 'icon-flag', group: 'Help', keywords: 'community rules', run: () => router.push('/guidelines') },
  { id: 'help:about', label: 'About SimplePixelArt', icon: 'icon-explore', group: 'Help', keywords: 'info mission', run: () => router.push('/about') },
  { id: 'help:contact', label: 'Contact', icon: 'icon-at', group: 'Help', keywords: 'email support help', run: () => router.push('/contact') },
  { id: 'help:privacy', label: 'Privacy Policy', icon: 'icon-eye-cross', group: 'Help', keywords: 'privacy data gdpr cookies', run: () => router.push('/privacy') },
  { id: 'help:terms', label: 'Terms of Service', icon: 'icon-file', group: 'Help', keywords: 'terms tos legal', run: () => router.push('/terms') },
  { id: 'help:dmca', label: 'DMCA', icon: 'icon-flag', group: 'Help', keywords: 'copyright takedown report', run: () => router.push('/dmca') },
  { id: 'help:github', label: 'GitHub repository', icon: 'icon-link', hint: 'Open source', group: 'Help', keywords: 'github source code open source star contribute repo', run: () => window.open('https://github.com/comficker/simplepixelart', '_blank', 'noopener') },
  { id: 'help:issues', label: 'Report an issue', icon: 'icon-flag', hint: 'GitHub Issues', group: 'Help', keywords: 'bug report feature request issue github feedback', run: () => window.open('https://github.com/comficker/simplepixelart/issues', '_blank', 'noopener') },
  { id: 'system:reset', label: 'Reset app data', hint: 'Clear cache & storage', icon: 'icon-broom', group: 'System', keywords: 'reset clear cache storage wipe localstorage indexeddb hard refresh fix stuck broken', run: resetAppData },
])

// Account — what shows depends on the session. Guests get the bare trio
// (sign in / settings / your work); signed-in users manage their presence.
const accountCommands = computed<Cmd[]>(() => {
  const cmds: Cmd[] = []
  if (!auth.isLogged) {
    cmds.push({
      id: 'account:login', label: 'Sign in', icon: 'icon-user', hint: 'Google',
      group: 'Account', keywords: 'login signin account google',
      run: () => { window.location.href = googleAuthUrl.value },
    })
  }
  cmds.push({
    id: 'account:settings', label: 'Settings', icon: 'icon-cog',
    group: 'Account', keywords: 'account profile username password theme preferences reset',
    run: () => router.push('/settings'),
  })
  if (auth.isLogged) {
    cmds.push({
      id: 'account:profile', label: 'Public profile', icon: 'icon-user',
      hint: `@${auth.logged?.username}`, group: 'Account',
      keywords: 'creator page my profile',
      run: () => router.push(`/creator/${auth.logged?.username}`),
    })
  }
  cmds.push({
    id: 'account:work', label: 'Your work', icon: 'icon-workspace',
    group: 'Account', keywords: 'mine artworks drafts',
    run: () => router.push('/work'),
  })
  if (auth.isLogged) {
    cmds.push(
        {
          id: 'account:missions', label: 'Missions & credits', icon: 'icon-coin',
          group: 'Account', keywords: 'credits tokens rewards earn daily invite referral',
          run: () => router.push('/missions'),
        },
        {
          id: 'account:logout', label: 'Log out', icon: 'icon-x',
          group: 'Account', keywords: 'sign out logout leave',
          run: () => auth.logout(),
        },
    )
  }
  return cmds
})

const themeCommands = computed<Cmd[]>(() =>
    (themes || []).map((t: any) => ({
      id: `theme:${t.id}`,
      label: t.name,
      icon: 'icon-adjust',
      group: 'Theme' as const,
      keywords: `theme color ${t.id} ${t.name}`,
      // ring = background colour, ink = text colour (inner dot)
      swatch: { ring: t.colors[0], ink: t.colors[2] },
      active: current.value === t.id,
      run: () => setTheme(t.id),
    }))
)

const allCommands = computed(() => [...baseCommands.value, ...accountCommands.value, ...themeCommands.value])

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

// Group matches into blocks. Browsing (empty query) keeps the stable
// GROUP_ORDER; while searching, groups are ordered by their best-scoring item
// so an exact match (e.g. "terms" → Terms of Service in Help) lands on top and
// Enter activates it — GROUP_ORDER must not beat relevance.
const groupedBlocks = computed(() => {
  const map = new Map<string, Cmd[]>()
  filtered.value.forEach(cmd => {
    if (!map.has(cmd.group)) map.set(cmd.group, [])
    map.get(cmd.group)!.push(cmd)
  })
  const q = query.value
  const order = q
      ? [...map.keys()].sort((a, b) =>
          Math.max(...map.get(b)!.map(c => score(c, q))) -
          Math.max(...map.get(a)!.map(c => score(c, q))))
      : [
        ...GROUP_ORDER.filter(g => map.has(g)),
        ...[...map.keys()].filter(g => !GROUP_ORDER.includes(g)),
      ]
  const blocks: Array<{ group: string; items: Array<{ cmd: Cmd; index: number }> }> = []
  let index = 0
  for (const group of order) {
    const list = map.get(group)!
    blocks.push({ group, items: list.map(cmd => ({ cmd, index: index++ })) })
  }
  return blocks
})

// Flat list in the SAME visual order — drives selection, keyboard nav, activate().
const flatItems = computed(() => groupedBlocks.value.flatMap(b => b.items.map(i => i.cmd)))

watch(query, () => { selected.value = 0 })

// resetAppData lives in composables/useAppReset (shared with /settings).

function openPalette() {
  open.value = true
  query.value = ''
  selected.value = 0
  computeStorage()
  // Desktop only: on touch devices auto-focus pops the on-screen keyboard,
  // which covers the command list. Users tap the input to search instead.
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    nextTick(() => inputEl.value?.focus())
  }
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
              <div v-for="block in groupedBlocks" :key="block.group" class="cmdk-block">
                <div class="cmdk-group">{{ block.group }}</div>

                <!-- Theme: a single row of colour circles -->
                <div v-if="block.group === 'Theme'" class="cmdk-theme-row">
                  <button
                      v-for="it in block.items"
                      :key="it.cmd.id"
                      type="button"
                      class="cmdk-theme-swatch"
                      :class="{ active: it.index === selected, current: it.cmd.active }"
                      :data-idx="it.index"
                      role="option"
                      :aria-selected="it.index === selected"
                      :title="it.cmd.label + (it.cmd.active ? ' (active)' : '')"
                      :style="{ '--sw-ring': it.cmd.swatch?.ring, '--sw-ink': it.cmd.swatch?.ink }"
                      @mouseenter="selected = it.index"
                      @click="activate(it.cmd)"
                  />
                </div>

                <!-- Everything else: standard rows -->
                <button
                    v-for="it in block.items"
                    v-else
                    :key="it.cmd.id"
                    type="button"
                    class="cmdk-item"
                    :class="{ active: it.index === selected }"
                    :data-idx="it.index"
                    role="option"
                    :aria-selected="it.index === selected"
                    @mouseenter="selected = it.index"
                    @click="activate(it.cmd)"
                >
                  <span class="cmdk-item-icon icon" :class="it.cmd.icon" aria-hidden="true"/>
                  <span class="cmdk-item-label">{{ it.cmd.label }}</span>
                  <span v-if="it.cmd.hint" class="cmdk-item-hint">{{ it.cmd.hint }}</span>
                </button>
              </div>
            </template>
            <div v-else class="cmdk-empty">
              <span class="icon icon-search" aria-hidden="true"/>
              <span>No matches for “{{ query }}”</span>
            </div>
          </div>
          <div
              v-if="storage"
              class="cmdk-stat"
              :class="{ warn: storage.pct >= 70, full: storage.pct >= 90 }"
              :title="`Local storage: ${storage.usedMB} MB of ~5 MB used (${storage.pct}%)${storage.boards ? ` · ${storage.boards} board${storage.boards === 1 ? '' : 's'}` : ''}${storage.arts ? ` · ${storage.arts} saved` : ''}`"
          >
            <span class="cmdk-stat-icon icon icon-save" aria-hidden="true"/>
            <span class="cmdk-stat-label">Storage</span>
            <span class="cmdk-stat-bar"><span class="cmdk-stat-fill" :style="{ width: storage.pct + '%' }"/></span>
            <span class="cmdk-stat-val">{{ storage.usedMB }} MB · {{ storage.pct }}%</span>
            <a
                v-if="!auth.isLogged && storage.pct >= 70"
                :href="googleAuthUrl"
                class="cmdk-stat-cta"
                title="Sign in to back your local work up to the cloud — and free up local space"
            >Sign in to back up →</a>
            <span v-else-if="storage.boards" class="cmdk-stat-meta">{{ storage.boards }} board{{ storage.boards === 1 ? '' : 's' }}</span>
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
}

.cmdk {
  width: 100%;
  max-width: 580px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: none;
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
  padding: var(--space-2);
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
  border-radius: var(--radius-sm);
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
  font-size: var(--text-2xs);
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
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.02em;
}

/* Theme picker: one row of colour circles (background ring + text-colour core) */
.cmdk-theme-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  padding: 2px 10px 8px;
}

.cmdk-theme-swatch {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 50%;
  background: var(--sw-ring);
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
}

.cmdk-theme-swatch::after {
  content: "";
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--sw-ink);
}

/* currently-applied theme */
.cmdk-theme-swatch.current {
  border-color: var(--primary);
  border-width: 2px;
}

/* keyboard / hover selection */
.cmdk-theme-swatch.active {
  box-shadow: 0 0 0 2px var(--background), 0 0 0 4px var(--primary);
}

.cmdk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: 36px 12px;
  color: var(--muted);
  font-size: 13px;
}

.cmdk-empty .icon {
  font-size: 22px;
  opacity: 0.6;
}

/* Storage-usage readout — a slim strip above the footer. */
.cmdk-stat {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  font-size: var(--text-2xs);
  color: var(--muted);
  --stat-accent: var(--primary);
}
.cmdk-stat.warn { --stat-accent: #d98a1f; }
.cmdk-stat.full { --stat-accent: #dc4b3f; color: var(--foreground); }
.cmdk-stat-icon { font-size: 13px; color: var(--stat-accent); flex: none; }
.cmdk-stat-label {
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--foreground);
  opacity: 0.8;
  flex: none;
}
.cmdk-stat-bar {
  flex: 1;
  min-width: 40px;
  height: 5px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--muted) 24%, transparent);
  overflow: hidden;
}
.cmdk-stat-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--stat-accent);
  transition: width 200ms ease;
}
.cmdk-stat-val {
  font-variant-numeric: tabular-nums;
  flex: none;
}
.cmdk-stat-meta {
  flex: none;
  opacity: 0.7;
  padding-left: var(--space-2);
  border-left: 1px solid var(--border);
}
.cmdk-stat-cta {
  flex: none;
  padding-left: var(--space-2);
  border-left: 1px solid var(--border);
  color: var(--stat-accent);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.cmdk-stat-cta:hover { text-decoration: underline; }

.cmdk-foot {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: color-mix(in oklab, var(--surface-2) 50%, transparent);
  font-size: var(--text-2xs);
  color: var(--muted);
}

.cmdk-foot-grp {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
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
  .cmdk { max-height: 80vh; border-radius: var(--radius-sm); }
  .cmdk-foot { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cmdk-enter-active,
  .cmdk-leave-active,
  .cmdk-enter-active .cmdk,
  .cmdk-leave-active .cmdk { transition: none; }
}
</style>
