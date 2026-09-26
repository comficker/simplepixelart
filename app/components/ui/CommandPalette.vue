<script setup lang="ts">
const {t} = useI18n()

const localePath = useLocalePath()
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

type Cmd = {
  id: string
  label: string
  hint?: string
  icon?: string
  group: 'Create' | 'Go to' | 'Preferences' | 'Account' | 'Help' | 'System' | 'Theme' | 'Language'
  /** Opens a view inside the palette instead of running and closing. */
  opens?: View
  keywords?: string
  swatch?: { ring: string; ink: string }
  active?: boolean
  run: () => void | Promise<void>
}

// Doing comes before going, preferences after both, and the legal pages last.
// Theme used to sit at the top and pushed every real action below the fold.
const GROUP_ORDER = ['Create', 'Go to', 'Preferences', 'Account', 'Help', 'System']

type View = 'root' | 'theme' | 'language'
const view = ref<View>('root')
const VIEW_TITLE: Record<Exclude<View, 'root'>, string> = {theme: 'Theme', language: 'Language'}

const router = useRouter()
const { current, setTheme, themes } = useTheme() as any
const auth = useAuthStore()
const loginModal = useLoginModal()

const open = ref(false)
const query = ref('')
const selected = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const STORAGE_LIMIT = 5 * 1024 * 1024
const storage = ref<{ usedMB: string; pct: number; boards: number; arts: number } | null>(null)
function computeStorage() {
  if (typeof localStorage === 'undefined') { storage.value = null; return }
  let chars = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k == null) continue
    chars += k.length + (localStorage.getItem(k)?.length || 0)
  }
  const bytes = chars * 2
  let boards = 0, arts = 0
  try {
    const wf = JSON.parse(localStorage.getItem('workspace_full') || 'null')
    const wl = JSON.parse(localStorage.getItem('workspace_layout') || 'null')
    boards = wf?.boards?.length || wl?.boards?.length || 0
    arts = Object.keys(JSON.parse(localStorage.getItem('workspaces') || '{}')).length
  } catch {  }
  storage.value = {
    usedMB: (bytes / 1024 / 1024).toFixed(1),
    pct: Math.min(100, Math.round((bytes / STORAGE_LIMIT) * 100)),
    boards, arts,
  }
}

const baseCommands = computed<Cmd[]>(() => [
  // Six of these used to exist twice -- "PX Editor" and "New pixel art" both
  // went to /editor, and so on for the converter, generator, slicer, tileset
  // and tilemap. Twelve rows for six places. The action wording stays, since a
  // palette is for doing; the navigation keywords were folded into it so a
  // search for "tileset editor" still lands.
  { id: 'nav:home', label: t('c_CommandPalette.home'), icon: 'icon-square', group: 'Go to', keywords: 'index start', run: () => router.push(localePath('/')) },
  { id: 'nav:arts', label: t('c_CommandPalette.discovery'), icon: 'icon-search', group: 'Go to', keywords: 'gallery browse art', run: () => router.push(localePath('/arts')) },
  { id: 'nav:palettes', label: t('c_CommandPalette.palettes'), icon: 'icon-bucket', group: 'Go to', keywords: 'color palette swatches library', run: () => router.push(localePath('/palettes')) },
  { id: 'nav:challenges', label: t('c_CommandPalette.weeklyChallenges'), icon: 'icon-flag', hint: t('c_CommandPalette.drawTheTheme'), group: 'Go to', keywords: 'challenge weekly theme contest vote', run: () => router.push(localePath('/challenges')) },
  { id: 'nav:collections', label: t('c_CommandPalette.yourCollections'), icon: 'icon-rhombus', group: 'Go to', keywords: 'collection group album', run: () => router.push(localePath('/work?tab=collections')) },
  { id: 'pref:theme', label: t('c_CommandPalette.theme'), icon: 'icon-adjust', hint: t('c_CommandPalette.changeTheLook'), group: 'Preferences', keywords: 'theme colour color dark light appearance skin', opens: 'theme', run: () => {} },
  { id: 'pref:lang', label: t('c_CommandPalette.language'), icon: 'icon-earth', hint: t('c_CommandPalette.changeTheLanguage'), group: 'Preferences', keywords: 'language locale translate japanese chinese korean spanish portuguese russian 言語 语言 언어 idioma', opens: 'language', run: () => {} },
  { id: 'create:new', label: t('c_CommandPalette.newPixelArt'), icon: 'icon-square', hint: t('c_CommandPalette.openEditor'), group: 'Create', keywords: 'px editor draw paint canvas start blank draw', run: () => router.push(localePath('/editor')) },
  { id: 'create:convert', label: t('c_CommandPalette.convertAnImage'), icon: 'icon-swap', group: 'Create', keywords: 'image to pixel art converter pixelate photo upload pixelate', run: () => router.push(localePath('/converter')) },
  { id: 'create:generate', label: t('c_CommandPalette.generateWithAi'), icon: 'icon-auto-fix', hint: t('c_CommandPalette.promptOrPhoto'), group: 'Create', keywords: 'ai generator text to sprite gemini ai generate prompt text to pixel art sprite', run: () => router.push(localePath('/generator')) },
  { id: 'create:tileset', label: t('c_CommandPalette.newTileset'), icon: 'icon-grid', group: 'Create', keywords: 'tileset editor curate registry tiles curate set registry', run: () => router.push(localePath('/tilesets/editor')) },
  { id: 'create:tilemap', label: t('c_CommandPalette.newTilemap'), icon: 'icon-rhombus', hint: t('c_CommandPalette.gridIso'), group: 'Create', keywords: 'tilemap editor map isometric level scene world map grid isometric build level scene world', run: () => router.push(localePath('/tilemaps/editor')) },
  { id: 'create:slice', label: t('c_CommandPalette.sliceATileset'), icon: 'icon-select', group: 'Create', keywords: 'tileset slicer spritesheet sheet spritesheet cut sprites tiles', run: () => router.push(localePath('/tilesets/slicer')) },
  { id: 'create:palette', label: t('c_CommandPalette.extractAPalette'), icon: 'icon-image', hint: t('c_CommandPalette.fromImage'), group: 'Create', keywords: 'color palette from image extract', run: () => router.push(localePath('/palettes/color-palette-from-image')) },
  { id: 'help:guide', label: t('c_CommandPalette.guidelines'), icon: 'icon-flag', group: 'Help', keywords: 'community rules', run: () => router.push(localePath('/guidelines')) },
  { id: 'help:about', label: t('c_CommandPalette.aboutSimplepixelart'), icon: 'icon-explore', group: 'Help', keywords: 'info mission', run: () => router.push(localePath('/about')) },
  { id: 'help:contact', label: t('c_CommandPalette.contact'), icon: 'icon-at', group: 'Help', keywords: 'email support help', run: () => router.push(localePath('/contact')) },
  { id: 'help:privacy', label: t('c_CommandPalette.privacyPolicy'), icon: 'icon-eye-cross', group: 'Help', keywords: 'privacy data gdpr cookies', run: () => router.push(localePath('/privacy')) },
  { id: 'help:terms', label: t('c_CommandPalette.termsOfService'), icon: 'icon-file', group: 'Help', keywords: 'terms tos legal', run: () => router.push(localePath('/terms')) },
  { id: 'help:dmca', label: t('c_CommandPalette.dmca'), icon: 'icon-flag', group: 'Help', keywords: 'copyright takedown report', run: () => router.push(localePath('/dmca')) },
  { id: 'help:github', label: t('c_CommandPalette.githubRepository'), icon: 'icon-link', hint: t('c_CommandPalette.openSource'), group: 'Help', keywords: 'github source code open source star contribute repo', run: () => window.open('https://github.com/comficker/simplepixelart', '_blank', 'noopener') },
  { id: 'help:issues', label: t('c_CommandPalette.reportAnIssue'), icon: 'icon-flag', hint: t('c_CommandPalette.githubIssues'), group: 'Help', keywords: 'bug report feature request issue github feedback', run: () => window.open('https://github.com/comficker/simplepixelart/issues', '_blank', 'noopener') },
  { id: 'system:reset', label: t('c_CommandPalette.resetAppData'), hint: t('c_CommandPalette.clearCacheStorage'), icon: 'icon-broom', group: 'System', keywords: 'reset clear cache storage wipe localstorage indexeddb hard refresh fix stuck broken', run: resetAppData },
])

const accountCommands = computed<Cmd[]>(() => {
  const cmds: Cmd[] = []
  if (!auth.isLogged) {
    cmds.push({
      id: 'account:login', label: t('c_CommandPalette.signIn'), icon: 'icon-user',
      group: 'Account', keywords: 'login signin account google password',
      run: () => { loginModal.show() },
    })
  }
  cmds.push({
    id: 'account:settings', label: t('c_CommandPalette.settings'), icon: 'icon-cog',
    group: 'Account', keywords: 'account profile username password theme preferences reset',
    run: () => router.push(localePath('/settings')),
  })
  if (auth.isLogged) {
    cmds.push({
      id: 'account:profile', label: t('c_CommandPalette.publicProfile'), icon: 'icon-user',
      hint: `@${auth.logged?.username}`, group: 'Account',
      keywords: 'creator page my profile',
      run: () => router.push(localePath(`/creator/${auth.logged?.username}`)),
    })
  }
  cmds.push({
    id: 'account:work', label: t('c_CommandPalette.yourWork'), icon: 'icon-workspace',
    group: 'Account', keywords: 'mine artworks drafts',
    run: () => router.push(localePath('/work')),
  })
  if (auth.isLogged) {
    cmds.push(
        {
          id: 'account:missions', label: t('c_CommandPalette.missionsCredits'), icon: 'icon-coin',
          group: 'Account', keywords: 'credits tokens rewards earn daily invite referral',
          run: () => router.push(localePath('/missions')),
        },
        {
          id: 'account:logout', label: t('c_CommandPalette.logOut'), icon: 'icon-x',
          group: 'Account', keywords: 'sign out logout leave',
          run: () => auth.logout(),
        },
    )
  }
  return cmds
})

const themeCommands = computed<Cmd[]>(() =>
    (themes || []).map((tt: any) => ({
      id: `theme:${tt.id}`,
      label: t(tt.i18n),
      icon: 'icon-adjust',
      group: 'Theme' as const,
      keywords: `theme color ${tt.id} ${tt.name}`,
      swatch: { ring: tt.colors[0], ink: tt.colors[2] },
      active: current.value === tt.id,
      run: () => setTheme(tt.id),
    }))
)

const {locale, locales} = useI18n()
const switchLocalePath = useSwitchLocalePath()

const languageCommands = computed<Cmd[]>(() =>
    (locales.value as {code: string, name: string}[]).map(l => ({
      id: `lang:${l.code}`,
      label: l.name,
      icon: 'icon-earth',
      group: 'Language' as const,
      keywords: `language locale ${l.code} ${l.name}`,
      active: l.code === locale.value,
      // switchLocalePath keeps the visitor on the page they are reading.
      run: () => router.push(switchLocalePath(l.code)),
    }))
)

const allCommands = computed(() => [
  ...baseCommands.value, ...accountCommands.value,
  ...themeCommands.value, ...languageCommands.value,
])

function score(cmd: Cmd, q: string): number {
  if (!q) return 1
  const haystack = `${cmd.label} ${cmd.keywords ?? ''} ${cmd.group}`.toLowerCase()
  const needle = q.toLowerCase().trim()
  if (haystack.includes(needle)) return 100 - haystack.indexOf(needle)
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return 10
  }
  return 0
}

/** Theme and Language live behind their own view, so the root list is not
 *  buried under a dozen swatches. A search still reaches into them: typing
 *  "dark" or "日本語" from the root should find them. */
const inView = computed(() => {
  if (query.value) return allCommands.value
  if (view.value === 'theme') return themeCommands.value
  if (view.value === 'language') return languageCommands.value
  return allCommands.value.filter(c => c.group !== 'Theme' && c.group !== 'Language')
})

const filtered = computed(() => {
  const q = query.value
  return inView.value
      .map(cmd => ({ cmd, s: score(cmd, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.cmd)
})

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
    if (!q) list.sort((a, b) => a.label.localeCompare(b.label))
    blocks.push({ group, items: list.map(cmd => ({ cmd, index: index++ })) })
  }
  return blocks
})

const flatItems = computed(() => groupedBlocks.value.flatMap(b => b.items.map(i => i.cmd)))

watch(query, () => { selected.value = 0 })

function openPalette() {
  open.value = true
  view.value = 'root'
  query.value = ''
  selected.value = 0
  computeStorage()
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
  if (target.opens) {
    view.value = target.opens
    query.value = ''
    selected.value = 0
    return
  }
  closePalette()
  await target.run()
}

function back() {
  view.value = 'root'
  query.value = ''
  selected.value = 0
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    view.value === 'root' ? closePalette() : back()
  }
  else if (e.key === 'Backspace' && !query.value && view.value !== 'root') { e.preventDefault(); back() }
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
        <div class="cmdk" role="dialog" :aria-label="$t('c_CommandPalette.commandPalette')">
          <div class="cmdk-input-wrap">
            <span class="icon icon-search cmdk-search-icon" aria-hidden="true"/>
            <input
                ref="inputEl"
                v-model="query"
                class="cmdk-input"
                :placeholder="view === 'root' ? 'Type a command or search…' : t('c_CommandPalette.searchX', {x: (VIEW_TITLE[view] || '').toLowerCase()})"
                spellcheck="false"
                autocomplete="off"
                @keydown.stop="onKey"
            >
            <kbd class="kbd">esc</kbd>
          </div>
          <button v-if="view !== 'root'" type="button" class="cmdk-back" @click="back">
            <span class="icon icon-angle-left"/>
            <span>{{ VIEW_TITLE[view] }}</span>
          </button>
          <div ref="listEl" class="cmdk-list" role="listbox">
            <template v-if="flatItems.length">
              <div v-for="block in groupedBlocks" :key="block.group" class="cmdk-block">
                <div v-if="view === 'root' || query" class="cmdk-group">{{ block.group }}</div>

                <div v-if="block.group === 'Theme' && view === 'theme'" class="cmdk-theme-row">
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
                  <span v-if="it.cmd.active" class="icon icon-check cmdk-item-tick" aria-hidden="true"/>
                  <span v-else-if="it.cmd.opens" class="icon icon-angle-right cmdk-item-chev" aria-hidden="true"/>
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
            <span class="cmdk-stat-label">{{ $t('c_CommandPalette.storage') }}</span>
            <span class="cmdk-stat-bar"><span class="cmdk-stat-fill" :style="{ width: storage.pct + '%' }"/></span>
            <span class="cmdk-stat-val">{{ storage.usedMB }} MB · {{ storage.pct }}%</span>
            <button
                v-if="!auth.isLogged && storage.pct >= 70"
                class="cmdk-stat-cta"
                :title="$t('c_CommandPalette.signInToBackYourLocal')"
                @click="closePalette(); loginModal.show()"
            >{{ $t('c_CommandPalette.signInToBackUp') }}</button>
            <span v-else-if="storage.boards" class="cmdk-stat-meta">{{ storage.boards }} board{{ storage.boards === 1 ? '' : 's' }}</span>
          </div>
          <div class="cmdk-foot">
            <span class="cmdk-foot-grp"><kbd class="kbd">↑</kbd><kbd class="kbd">↓</kbd> {{ $t('c_CommandPalette.navigate') }}</span>
            <span class="cmdk-foot-grp"><kbd class="kbd">↵</kbd> {{ $t('c_CommandPalette.select') }}</span>
            <span class="cmdk-foot-grp"><kbd class="kbd">esc</kbd> {{ view === 'root' ? 'close' : 'back' }}</span>
            <span class="cmdk-foot-spacer"/>
            <span class="cmdk-foot-brand">{{ $t('c_CommandPalette.simplepixel') }}<span class="cmdk-foot-brand-accent">{{ $t('c_CommandPalette.art') }}</span></span>
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
  /* A fixed height, not a cap: with max-height the box was as tall as whatever
     it held, so stepping into Theme or Language shrank it from 630px to 209px
     and everything under the cursor jumped. The list scrolls inside instead. */
  height: min(70dvh, 560px);
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

/* Reads like the settings sub-views: a header you can click to step back out,
   so the palette never traps you in Theme or Language. */
.cmdk-back {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: none;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.cmdk-back .icon { flex: none; }
@media (hover: hover) and (pointer: fine) {
  .cmdk-back:hover { color: var(--foreground); }
}

.cmdk-item-tick { margin-left: auto; flex: none; color: var(--primary); }
.cmdk-item-chev { margin-left: auto; flex: none; opacity: 0.45; }

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
  border: 1px solid var(--border);
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

.cmdk-theme-swatch.current {
  border-color: var(--primary);
  border-width: 2px;
}

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
  .cmdk { height: min(80dvh, 560px); border-radius: var(--radius-sm); }
  .cmdk-foot { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .cmdk-enter-active,
  .cmdk-leave-active,
  .cmdk-enter-active .cmdk,
  .cmdk-leave-active .cmdk { transition: none; }
}
</style>
