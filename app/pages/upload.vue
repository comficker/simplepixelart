<script setup lang="ts">
import {toast} from 'vue-sonner'
import type {ComponentPublicInstance} from 'vue'
import {importFileGrid, type Cell} from '~/helper/pixel'
import {gifToFrames} from '~/helper/pixel/gif'
import {rgbToHex} from '~/helper/color'
import {LICENSES} from '~/helper/constants'

const auth = useAuthStore()
const {t} = useI18n()

// Past this it is a photo or a painting, not pixel art: the converter is the
// tool for those.
const MAX_SIDE = 256
const MAX_FILES = 20

interface Piece {
  key: string
  file: string
  name: string
  desc: string
  tags: string[]
  width: number
  height: number
  colors: string[]
  pixels: Record<string, number>
  // An animated GIF's frames, in order; `pixels` is the first of them.
  frames: { pixels: Record<string, number>; duration: number }[]
  tooBig: boolean
  state: 'ready' | 'publishing' | 'done' | 'failed'
  // Set once the piece exists on the server: as a draft when it was opened
  // in the editor, or once published.
  id?: number
  id_string?: string
  // Bumped when the drawing changes (after an edit), so the thumbnail repaints.
  rev: number
}

const pieces = ref<Piece[]>([])
const reading = ref(0)
const license = ref('')
const publishing = ref(false)
const dragging = ref(false)
const selectedKey = ref('')
const loginModal = useLoginModal()
const localePath = useLocalePath()

const readyPieces = computed(() => pieces.value.filter(p => !p.tooBig && p.state !== 'done'))
const donePieces = computed(() => pieces.value.filter(p => p.state === 'done'))
const selected = computed(() => pieces.value.find(p => p.key === selectedKey.value) || null)

function titleFromFile(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return base ? base[0]!.toUpperCase() + base.slice(1) : 'Untitled'
}

function toPiece(file: File, grids: Cell[][][], durations: number[] = []): Piece {
  const colors: string[] = []
  const index = new Map<string, number>()
  let width = 0
  const frames = grids.map((grid, n) => {
    const pixels: Record<string, number> = {}
    grid.forEach((row, y) => {
      width = Math.max(width, row.length)
      row.forEach((cell, x) => {
        if (!cell) return
        const hex = rgbToHex(cell[0], cell[1], cell[2]).toUpperCase()
        let i = index.get(hex)
        if (i === undefined) {
          i = colors.push(hex) - 1
          index.set(hex, i)
        }
        pixels[`${x}_${y}`] = i
      })
    })
    return {pixels, duration: durations[n] || 100}
  })
  const grid = grids[0]!
  return {
    key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
    file: file.name,
    name: titleFromFile(file.name),
    desc: '',
    tags: [],
    width,
    height: grid.length,
    colors,
    pixels: frames[0]!.pixels,
    frames: frames.length > 1 ? frames : [],
    tooBig: width > MAX_SIDE || grid.length > MAX_SIDE,
    state: 'ready',
    rev: 0,
  }
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

async function addFiles(list: FileList | File[] | null | undefined) {
  const files = [...(list || [])].filter(f => f.type.startsWith('image/'))
  const room = MAX_FILES - pieces.value.length
  if (files.length > room) toast.info(`Up to ${MAX_FILES} pieces at a time`)
  for (const file of files.slice(0, Math.max(0, room))) {
    reading.value++
    try {
      const anim = await gifToFrames(file)
      const grid = anim ? null : await importFileGrid(await readDataUrl(file))
      const piece = anim ? toPiece(file, anim.frames as Cell[][][], anim.durations)
          : grid?.length ? toPiece(file, [grid]) : null
      if (piece) {
        pieces.value.push(piece)
        if (!selected.value) selectedKey.value = piece.key
      } else {
        toast.error(t('p_upload.notPixelArt', {name: file.name}))
      }
    } catch {
      toast.error(`Could not read ${file.name}`)
    } finally {
      reading.value--
    }
  }
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}

function remove(key: string) {
  pieces.value = pieces.value.filter(p => p.key !== key)
  if (selectedKey.value === key) selectedKey.value = pieces.value[0]?.key || ''
}

function paint(el: Element | ComponentPublicInstance | null, p: Piece) {
  const cv = el as HTMLCanvasElement | null
  const stamp = `${p.key}:${p.rev}`
  if (!cv || cv.dataset.key === stamp) return
  cv.dataset.key = stamp
  cv.width = p.width
  cv.height = p.height
  const ctx = cv.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, p.width, p.height)
  for (const [k, i] of Object.entries(p.pixels)) {
    const [x, y] = k.split('_').map(Number)
    ctx.fillStyle = p.colors[i]!
    ctx.fillRect(x!, y!, 1, 1)
  }
}

function animationMeta(p: Piece) {
  if (!p.frames.length) return null
  const sorted = p.frames.map(f => f.duration).sort((a, b) => a - b)
  return {
    fps: Math.min(30, Math.max(1, Math.round(1000 / sorted[sorted.length >> 1]!))),
    loop: true,
    shared: [],
    frames: p.frames.map(f => ({
      id: crypto.randomUUID(),
      layers: [{name: 'Layer 1', pixels: f.pixels, x: 0, y: 0}],
      duration: f.duration,
    })),
  }
}

/** Put the piece on the server, as a draft or published in one step. */
async function create(p: Piece, isPublic: boolean) {
  const meta: Record<string, any> = license.value ? {license: license.value} : {}
  const animation = animationMeta(p)
  if (animation) meta.animation = animation
  const res = await useNativeFetch<any>('/coloring/shared-pages/', {
    method: 'POST',
    body: {
      name: p.name.trim() || 'Untitled',
      desc: p.desc.trim(),
      tags: p.tags,
      width: p.width,
      height: p.height,
      colors: p.colors,
      layers: [{name: 'Layer 1', pixels: p.pixels, x: 0, y: 0}],
      map_numbers: p.pixels,
      template: null,
      id_string: '',
      is_public: isPublic,
      meta,
    },
  })
  p.id = res.id
  p.id_string = res.id_string
}

/** Publish a piece already on the server, keeping whatever was drawn on it
 * in the editor: only the words, the tags and the license are sent. */
async function publishExisting(p: Piece) {
  const cur = await useNativeFetch<any>(`/coloring/shared-pages/${p.id_string}/`)
  const meta = {...(cur.meta || {})}
  if (license.value) meta.license = license.value
  else delete meta.license
  await useNativeFetch(`/coloring/shared-pages/${p.id}/`, {
    method: 'PATCH',
    body: {name: p.name.trim() || 'Untitled', desc: p.desc.trim(), tags: p.tags, is_public: true, meta},
  })
}

// Opening the editor needs the piece on the server, so it goes up as a draft
// first. The tab is opened before the request so no popup blocker stops it.
async function editPiece(p: Piece) {
  if (!auth.isLogged) {
    loginModal.show(() => editPiece(p))
    return
  }
  const tab = window.open('', '_blank')
  try {
    if (!p.id) await create(p, false)
    const url = localePath(`/editor?id=${p.id_string}`)
    // Never leave this page for it: the other pieces waiting here would go.
    if (tab) tab.location.href = url
    else toast(t('p_upload.draftSaved'), {action: {label: t('p_upload.openEditor'), onClick: () => window.open(url, '_blank')}})
  } catch {
    tab?.close()
    toast.error(t('p_upload.couldNotOpenEditor'))
  }
}

// Back from the editor tab: show the piece as it now is.
async function refreshEdited() {
  for (const p of pieces.value) {
    if (!p.id_string || p.state === 'done') continue
    try {
      const d = await useNativeFetch<any>(`/coloring/shared-pages/${p.id_string}/`)
      p.width = d.width
      p.height = d.height
      p.colors = d.colors || []
      p.pixels = d.map_numbers || {}
      p.tooBig = d.width > MAX_SIDE || d.height > MAX_SIDE
      p.rev++
    } catch { /* deleted in the editor: keep what we had */ }
  }
}
onMounted(() => window.addEventListener('focus', refreshEdited))
onBeforeUnmount(() => window.removeEventListener('focus', refreshEdited))

async function publishAll() {
  if (!auth.isLogged) {
    loginModal.show(publishAll)
    return
  }
  publishing.value = true
  for (const p of readyPieces.value) {
    p.state = 'publishing'
    try {
      if (p.id) await publishExisting(p)
      else await create(p, true)
      p.state = 'done'
    } catch {
      p.state = 'failed'
    }
  }
  publishing.value = false
  const failed = pieces.value.filter(p => p.state === 'failed').length
  if (failed) toast.error(`${failed} could not be published — try again`)
  else toast.success('Published')
}

const FAQ = [
  {q: 'What can I upload?', a: 'Pixel art you made, as PNG, GIF or WebP — exported at its own size or scaled up. The upload finds the pixel grid and turns each file into an editable piece. Photos and paintings belong in the converter.', icon: 'icon-image'},
  {q: 'Can I upload work made in Aseprite or another editor?', a: 'Yes. Export a PNG at any whole-number scale; the page detects the scale and stores the art at its true size, so it stays sharp at every zoom.', icon: 'icon-pen'},
  {q: 'Who owns what I upload?', a: 'You do. Pick a license when you publish: keep all rights, let others use it with credit (CC BY 4.0), or give it away (CC0). The license shows on the piece’s page.', icon: 'icon-check'},
  {q: 'Will people find it?', a: 'Every piece gets its own page, its palette is linked into the palette library, and a piece with a description can show up in Google results.', icon: 'icon-search'},
]

useCustomSeoMeta({
  title: 'Upload Your Pixel Art',
  description: 'Share the pixel art you already made: drop in PNGs, keep them pixel-sharp at their true size, pick a license and publish to your SimplePixelArt profile.',
  canonical: 'https://simplepixelart.com/upload',
  robots: 'index, follow',
})
</script>

<template>
  <ToolLayout :title="$t('p_upload.upload')">
    <div class="tool-card up-stack">
      <div
          class="tool-pane up-pane"
          :class="{'is-dragging': dragging}"
          @dragover.prevent="dragging = true"
          @dragleave.self="dragging = false"
          @drop.prevent="onDrop"
      >
        <label v-if="!pieces.length && !reading" class="dropzone up-drop">
          <input type="file" accept="image/png,image/gif,image/webp" multiple class="up-file" @change="onPick">
          <span class="icon icon-upload dropzone-icon"/>
          <span class="dropzone-title">{{ $t('p_upload.dropYourPixelArtHere') }}</span>
          <span class="dropzone-hint">{{ $t('p_upload.dropHint', {n: MAX_FILES}) }}</span>
        </label>

        <ul v-else class="up-grid">
          <li v-for="p in pieces" :key="p.key" class="up-tile" :class="{'is-selected': p.key === selectedKey, 'is-off': p.tooBig}">
            <button type="button" class="up-tile-pick" :aria-pressed="p.key === selectedKey" @click="selectedKey = p.key">
              <span class="up-thumb"><canvas :ref="el => paint(el, p)" class="up-canvas"/></span>
              <span class="up-tile-name">{{ p.name || 'Untitled' }}</span>
              <span class="up-meta">
                <template v-if="p.state === 'done'"><span class="icon icon-check"/> {{ $t('p_upload.published') }}</template>
                <template v-else-if="p.state === 'failed'">{{ $t('p_upload.failed') }}</template>
                <template v-else-if="p.tooBig">{{ p.width }}×{{ p.height }} · {{ $t('p_upload.notPixelArtShort') }}</template>
                <template v-else>{{ p.width }}×{{ p.height }} · {{ p.colors.length }} {{ $t('common.colors').toLowerCase() }}<template v-if="p.frames.length"> · {{ $t('p_upload.framesN', {n: p.frames.length}) }}</template></template>
              </span>
            </button>
            <div class="up-tile-ctl">
              <button
                  v-if="!p.tooBig"
                  type="button"
                  class="widget-ctl-btn"
                  :title="$t('p_upload.editInEditor')"
                  :aria-label="$t('p_upload.editInEditor')"
                  :disabled="publishing"
                  @click="editPiece(p)"
              ><span class="icon icon-pen"/></button>
              <button
                  v-if="p.state !== 'done'"
                  type="button"
                  class="widget-ctl-btn"
                  :aria-label="$t('common.remove')"
                  :title="$t('common.remove')"
                  :disabled="publishing"
                  @click="remove(p.key)"
              ><span class="icon icon-close"/></button>
            </div>
          </li>
          <li v-if="reading" class="up-tile" aria-busy="true">
            <span class="up-thumb skeleton"/>
            <span class="up-meta">{{ $t('p_upload.reading') }}</span>
          </li>
          <li v-if="pieces.length < MAX_FILES" class="up-tile">
            <label class="up-add">
              <input type="file" accept="image/png,image/gif,image/webp" multiple class="up-file" @change="onPick">
              <span class="icon icon-plus"/>
              <span>{{ $t('p_upload.addMore') }}</span>
            </label>
          </li>
        </ul>
      </div>
    </div>

    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        <template v-if="donePieces.length">{{ $t('p_upload.publishedN', {n: donePieces.length}) }}</template>
        <template v-else-if="pieces.length">{{ $t('p_upload.readyN', {n: readyPieces.length}) }}</template>
        <template v-else>{{ $t('p_upload.nothingYet') }}</template>
      </p>
    </template>

    <template #aside>
      <Widget :title="$t('p_upload.publish')">
        <div class="up-publish">
          <template v-if="selected && selected.state === 'done'">
            <p class="up-note">{{ $t('p_upload.isPublished', {name: selected.name}) }}</p>
            <NuxtLinkLocale :to="`/art/${selected.id_string}`" class="btn block">{{ $t('p_upload.viewPiece') }}</NuxtLinkLocale>
          </template>
          <template v-else-if="selected && selected.tooBig">
            <p class="up-note">{{ $t('p_upload.tooBig', {w: selected.width, h: selected.height}) }}</p>
            <NuxtLinkLocale to="/converter" class="btn block">{{ $t('p_upload.useTheConverter') }}</NuxtLinkLocale>
          </template>
          <template v-else-if="selected">
            <label class="publish-label" for="up-name">{{ $t('common.name') }}</label>
            <input id="up-name" v-model="selected.name" class="publish-input" maxlength="100" :disabled="publishing">
            <label class="publish-label" for="up-desc">{{ $t('common.description') }}</label>
            <textarea
                id="up-desc"
                v-model="selected.desc"
                class="publish-input up-desc"
                rows="3"
                maxlength="300"
                :placeholder="$t('p_upload.descPlaceholder')"
                :disabled="publishing"
            />
            <label class="publish-label">{{ $t('common.tags') }}</label>
            <TagInput v-model="selected.tags" :placeholder="$t('c_PXEditor.addTags')"/>
          </template>

          <label class="publish-label" for="up-license">{{ $t('p_upload.license') }}</label>
          <select id="up-license" v-model="license" class="publish-input" :disabled="publishing">
            <option v-for="l in LICENSES" :key="l.value" :value="l.value">{{ $t(`p_upload.license_${l.key}`) }}</option>
          </select>
          <p class="up-note">{{ $t(`p_upload.license_${LICENSES.find(l => l.value === license)!.key}_hint`) }}</p>
          <button
              type="button"
              class="btn primary block"
              :disabled="!readyPieces.length || publishing"
              @click="publishAll"
          >
            <span class="icon icon-earth"/>
            <span v-if="!auth.isLogged">{{ $t('p_upload.signInToPublish') }}</span>
            <span v-else-if="publishing">{{ $t('p_upload.publishing') }}</span>
            <span v-else>{{ $t('p_upload.publishN', {n: readyPieces.length}) }}</span>
          </button>
          <NuxtLinkLocale
              v-if="donePieces.length && auth.logged?.username"
              :to="`/creator/${auth.logged.username}`"
              class="btn block"
          >{{ $t('p_upload.seeYourProfile') }}</NuxtLinkLocale>
        </div>
      </Widget>
    </template>

    <template #doc>
      <h1>{{ $t('p_upload.uploadYourPixelArt') }}</h1>
      <p>{{ $t('p_upload.intro') }}</p>
      <QnA :items="FAQ"/>
    </template>
  </ToolLayout>
</template>

<style scoped>
.up-stack {
  grid-template-columns: minmax(0, 1fr);
}

/* One pane, the whole stage: the drop target before anything is added, and
   still one after, around the pieces. */
.main-wrapper.dash .tool-main > .tool-card.up-stack {
  grid-template-rows: minmax(0, 1fr);
}

.up-pane {
  position: relative;
  min-height: calc(var(--space-6) * 16);
}

.up-pane.is-dragging {
  box-shadow: inset 0 0 0 2px var(--primary);
}

.up-drop {
  flex: 1;
  height: 100%;
  min-height: 0;
}

.up-file { display: none; }

.up-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--space-6) * 6), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.up-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.up-tile-pick {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  text-align: left;
  color: var(--foreground);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.up-tile.is-selected .up-tile-pick {
  border-color: var(--primary);
  box-shadow: inset 0 0 0 1px var(--primary);
}

.up-tile.is-off .up-thumb { opacity: 0.5; }

.up-tile-ctl {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: flex;
  gap: var(--space-1);
}

.up-tile-ctl .widget-ctl-btn {
  background: var(--surface);
}

.up-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%) 0 0 / var(--space-4) var(--space-4);
}

.up-canvas {
  /* Fill the square and fit inside it: a piece taller than wide must not
     stretch its tile past the others in the row. */
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.up-tile-name {
  font-size: var(--text-xs);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.up-meta {
  display: block;
  font-size: var(--text-2xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  /* One line, so every tile in a row is the same height. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.up-meta .icon {
  vertical-align: middle;
}

.up-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  flex: 1;
  min-height: calc(var(--space-6) * 6);
  font-size: var(--text-xs);
  color: var(--muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

@media (hover: hover) and (pointer: fine) {
  .up-add:hover { color: var(--primary); border-color: var(--primary); }
}

.up-desc { resize: vertical; }

.up-publish {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.up-note {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xs);
  color: var(--muted);
}
</style>
