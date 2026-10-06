<script setup lang="ts">
import {toast} from 'vue-sonner'
import type {ComponentPublicInstance} from 'vue'
import {importFileGrid, type Cell} from '~/helper/pixel'
import {gifToFrames} from '~/helper/pixel/gif'
import {rgbToHex} from '~/helper/color'
import {LICENSES} from '~/helper/constants'

const auth = useAuthStore()
const {t} = useI18n()
const loginModal = useLoginModal()
const localePath = useLocalePath()

// Past this it is a photo or a painting, not pixel art: the converter is the
// tool for those.
const MAX_SIDE = 256

/** The one piece on this page, as read from the file. */
interface Piece {
  file: string
  width: number
  height: number
  colors: string[]
  pixels: Record<string, number>
  // An animated GIF's frames, in order; `pixels` is the first of them.
  frames: { pixels: Record<string, number>; duration: number }[]
  tooBig: boolean
  // Set once the piece exists on the server: as a draft when it was opened
  // in the editor, or once published.
  id?: number
  id_string?: string
  // Bumped when the drawing changes (after an edit), so the preview repaints.
  rev: number
}

const piece = ref<Piece | null>(null)
const state = ref<'ready' | 'publishing' | 'done'>('ready')
const reading = ref(false)
const dragging = ref(false)

// The words are the page's, not the file's: they are there before a file is,
// and the name follows the file only until someone types one.
const name = ref('')
const nameTouched = ref(false)
const desc = ref('')
const tags = ref<string[]>([])
const license = ref('')

// How big the piece is drawn: the same choices, and the same 256px default,
// as an art page.
const PREVIEW_SIZES = ['original', 32, 64, 128, 256, 'full'] as const
type PreviewSize = typeof PREVIEW_SIZES[number]
const previewSize = ref<PreviewSize>(256)
const previewSizeLabel = (s: PreviewSize) =>
    s === 'full' ? 'Fit to view'
        : s === 'original' ? `Original · ${piece.value?.width}×${piece.value?.height}`
            : `${s}px`
const previewSizeShort = computed(() =>
    previewSize.value === 'full' ? 'Fit' : previewSize.value === 'original' ? '1:1' : `${previewSize.value}px`)
const previewStyle = computed(() => {
  const w = piece.value?.width || 1, h = piece.value?.height || 1
  const s = previewSize.value
  if (s === 'full') return {}
  if (s === 'original') return {width: `${w}px`, height: `${h}px`}
  const scale = s / Math.max(w, h)
  return {width: `${Math.round(w * scale)}px`, height: `${Math.round(h * scale)}px`}
})

const canPublish = computed(() => !!piece.value && !piece.value.tooBig && state.value === 'ready')

function titleFromFile(file: string) {
  const base = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
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
  const height = grids[0]!.length
  return {
    file: file.name,
    width,
    height,
    colors,
    pixels: frames[0]!.pixels,
    frames: frames.length > 1 ? frames : [],
    tooBig: width > MAX_SIDE || height > MAX_SIDE,
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

/** One file at a time: a new one replaces the piece on the page. */
async function setFile(list: FileList | File[] | null | undefined) {
  const file = [...(list || [])].find(f => f.type.startsWith('image/'))
  if (!file || state.value === 'publishing') return
  reading.value = true
  try {
    const anim = await gifToFrames(file)
    const grid = anim ? null : await importFileGrid(await readDataUrl(file))
    const next = anim ? toPiece(file, anim.frames as Cell[][][], anim.durations)
        : grid?.length ? toPiece(file, [grid]) : null
    if (!next) {
      toast.error(t('p_upload.notPixelArt', {name: file.name}))
      return
    }
    if (state.value === 'done') reset()
    piece.value = next
    if (!nameTouched.value) name.value = titleFromFile(file.name)
  } catch {
    toast.error(`Could not read ${file.name}`)
  } finally {
    reading.value = false
  }
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  setFile(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  dragging.value = false
  setFile(e.dataTransfer?.files)
}

function removePiece() {
  piece.value = null
  if (!nameTouched.value) name.value = ''
}

/** After a publish: a clean page for the next piece. */
function reset() {
  piece.value = null
  state.value = 'ready'
  name.value = ''
  nameTouched.value = false
  desc.value = ''
  tags.value = []
}

function paint(el: Element | ComponentPublicInstance | null) {
  const cv = el as HTMLCanvasElement | null
  const p = piece.value
  if (!cv || !p) return
  const stamp = `${p.file}:${p.width}x${p.height}:${p.rev}`
  if (cv.dataset.key === stamp) return
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
      name: name.value.trim() || 'Untitled',
      desc: desc.value.trim(),
      tags: tags.value,
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
    body: {name: name.value.trim() || 'Untitled', desc: desc.value.trim(), tags: tags.value, is_public: true, meta},
  })
}

// Opening the editor needs the piece on the server, so it goes up as a draft
// first. The tab is opened before the request so no popup blocker stops it,
// and this page is never left for it.
async function editPiece() {
  const p = piece.value
  if (!p) return
  if (!auth.isLogged) {
    loginModal.show(editPiece)
    return
  }
  const tab = window.open('', '_blank')
  try {
    if (!p.id) await create(p, false)
    const url = localePath(`/editor?id=${p.id_string}`)
    if (tab) tab.location.href = url
    else toast(t('p_upload.draftSaved'), {action: {label: t('p_upload.openEditor'), onClick: () => window.open(url, '_blank')}})
  } catch {
    tab?.close()
    toast.error(t('p_upload.couldNotOpenEditor'))
  }
}

// Back from the editor tab: show the piece as it now is.
async function refreshEdited() {
  const p = piece.value
  if (!p?.id_string || state.value === 'done') return
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
onMounted(() => window.addEventListener('focus', refreshEdited))
onBeforeUnmount(() => window.removeEventListener('focus', refreshEdited))

async function publish() {
  const p = piece.value
  if (!p || !canPublish.value) return
  if (!auth.isLogged) {
    loginModal.show(publish)
    return
  }
  state.value = 'publishing'
  try {
    if (p.id) await publishExisting(p)
    else await create(p, true)
    state.value = 'done'
    toast.success(t('p_upload.published'))
  } catch {
    state.value = 'ready'
    toast.error(t('p_upload.failed'))
  }
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
  <ToolLayout :title="$t('p_upload.upload')" class="up-page">
    <!-- The same stage as an art page: the piece fills it, centred on the
         dotted ground, with its controls floating in the corner. -->
    <div class="flat-editor art-editor">
      <div
          class="tm-stage art-stage up-stage"
          :class="{'is-dragging': dragging}"
          @dragover.prevent="dragging = true"
          @dragleave.self="dragging = false"
          @drop.prevent="onDrop"
      >
        <label v-if="!piece" class="dropzone up-drop" :class="{'is-busy': reading}">
          <input type="file" accept="image/*" class="up-file" @change="onPick">
          <span class="icon icon-upload dropzone-icon"/>
          <span class="dropzone-title">{{ reading ? $t('p_upload.reading') : $t('p_upload.dropYourPixelArtHere') }}</span>
          <span class="dropzone-hint">{{ $t('p_upload.dropHint') }}</span>
        </label>

        <template v-else>
          <canvas :ref="paint" class="up-canvas" :class="{'is-off': piece.tooBig}" :style="previewStyle"/>
          <div class="art-preview-ctl">
            <ui-dropdown-menu position="right">
              <button class="art-size-pill" :title="$t('p_art_id_string.previewSize')">
                <span class="icon icon-search"/>
                <span>{{ previewSizeShort }}</span>
                <span class="icon icon-expand-down" aria-hidden="true"/>
              </button>
              <template #menu>
                <div class="file-menu">
                  <button v-for="opt in PREVIEW_SIZES" :key="String(opt)" class="file-menu-item" @click="previewSize = opt">
                    <span class="file-menu-label">
                      <span>{{ previewSizeLabel(opt) }}</span>
                      <span v-if="previewSize === opt" class="icon icon-check"/>
                    </span>
                  </button>
                </div>
              </template>
            </ui-dropdown-menu>
          </div>
          <div class="tm-stage-fab up-fab">
            <button
                v-if="!piece.tooBig"
                type="button"
                class="tm-stage-fab-btn"
                :title="$t('p_upload.editInEditor')"
                :aria-label="$t('p_upload.editInEditor')"
                :disabled="state === 'publishing'"
                @click="editPiece"
            ><span class="icon icon-pen"/></button>
            <label v-if="state !== 'publishing'" class="tm-stage-fab-btn" :title="$t('p_upload.replace')" :aria-label="$t('p_upload.replace')">
              <input type="file" accept="image/*" class="up-file" @change="onPick">
              <span class="icon icon-upload"/>
            </label>
            <button
                v-if="state === 'ready'"
                type="button"
                class="tm-stage-fab-btn"
                :aria-label="$t('common.remove')"
                :title="$t('common.remove')"
                @click="removePiece"
            ><span class="icon icon-close"/></button>
          </div>
        </template>
      </div>
    </div>

    <template v-if="piece" #status>
      <p class="editor-foot-hint text-xs text-muted">
        <template v-if="state === 'done'">{{ $t('p_upload.published') }} · </template>
        {{ piece.width }}×{{ piece.height }}px · {{ piece.colors.length }} {{ $t('common.colors').toLowerCase() }}
        <template v-if="piece.frames.length"> · {{ $t('p_upload.framesN', {n: piece.frames.length}) }}</template>
      </p>
    </template>

    <template #aside>
      <Widget :title="$t('p_upload.publish')" class="up-publish-widget">
        <div class="up-publish">
          <template v-if="piece?.tooBig">
            <p class="up-note">{{ $t('p_upload.tooBig', {w: piece.width, h: piece.height}) }}</p>
            <NuxtLinkLocale to="/converter" class="btn block">{{ $t('p_upload.useTheConverter') }}</NuxtLinkLocale>
          </template>

          <template v-else-if="state === 'done' && piece">
            <p class="up-note">{{ $t('p_upload.isPublished', {name: name || 'Untitled'}) }}</p>
            <NuxtLinkLocale :to="`/art/${piece.id_string}`" class="btn primary block">{{ $t('p_upload.viewPiece') }}</NuxtLinkLocale>
            <button type="button" class="btn block" @click="reset">{{ $t('p_upload.uploadAnother') }}</button>
          </template>

          <template v-else>
            <label class="publish-label" for="up-name">{{ $t('common.name') }}</label>
            <input
                id="up-name"
                v-model="name"
                class="publish-input"
                maxlength="100"
                :disabled="state === 'publishing'"
                @input="nameTouched = true"
            >
            <label class="publish-label" for="up-desc">{{ $t('common.description') }}</label>
            <textarea
                id="up-desc"
                v-model="desc"
                class="publish-input up-desc"
                rows="3"
                maxlength="300"
                :placeholder="$t('p_upload.descPlaceholder')"
                :disabled="state === 'publishing'"
            />
            <label class="publish-label">{{ $t('common.tags') }}</label>
            <TagInput v-model="tags" :placeholder="$t('c_PXEditor.addTags')"/>

            <label class="publish-label" for="up-license">{{ $t('p_upload.license') }}</label>
            <select id="up-license" v-model="license" class="publish-input" :disabled="state === 'publishing'">
              <option v-for="l in LICENSES" :key="l.value" :value="l.value">{{ $t(`p_upload.license_${l.key}`) }}</option>
            </select>
            <p class="up-note">{{ $t(`p_upload.license_${LICENSES.find(l => l.value === license)!.key}_hint`) }}</p>
            <button type="button" class="btn primary block" :disabled="!canPublish" @click="publish">
              <span class="icon icon-earth"/>
              <span v-if="!auth.isLogged">{{ $t('p_upload.signInToPublish') }}</span>
              <span v-else-if="state === 'publishing'">{{ $t('p_upload.publishing') }}</span>
              <span v-else>{{ $t('p_upload.publish') }}</span>
            </button>
          </template>
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
.up-stage.is-dragging {
  box-shadow: inset 0 0 0 2px var(--primary);
}

.up-drop {
  width: 100%;
  height: 100%;
  min-height: calc(var(--space-6) * 12);
}

.up-drop.is-busy {
  opacity: 0.6;
  pointer-events: none;
}

.up-file { display: none; }

/* Fit by default to the stage, never stretched; a chosen size sets the
   width and height inline, as on an art page. */
.up-canvas {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: contain;
  image-rendering: pixelated;
}

.up-canvas.is-off { opacity: 0.5; }

.up-fab {
  display: flex;
  gap: var(--space-1);
}

.up-fab .tm-stage-fab-btn {
  cursor: pointer;
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

/* Where the rail stacks under the stage (below 1280px), the Publish widget
   comes straight after the piece instead of under the ad. */
@media (max-width: 1279px) {
  .up-page :deep(.tool-doc) {
    display: flex;
    flex-direction: column;
  }

  .up-page :deep(.tool-doc > .up-publish-widget) {
    order: -1;
  }
}
</style>
