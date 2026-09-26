<script setup lang="ts">
const localePath = useLocalePath()
const {t} = useI18n()
import {toast} from 'vue-sonner'
import {cloneDeep, generateUUID, getStorageItem} from '~/helper/utils'
import {rgbToHex} from '~/helper/color'
import {aiImageToGrid} from '~/helper/pixel'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import type {EditorData} from '~/types'

const auth = useAuthStore()
const route = useRoute()

useCustomSeoMeta({
  title: () => t('seo.generator.title'),
  description: () => t('seo.generator.description'),
  keywords: () => t('seo.generator.keywords'),
  canonical: 'https://simplepixelart.com/generator',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'AI Pixel Art Generator',
        description: 'Generate pixel art sprites from a text prompt, then tune the size, palette and background before editing them.',
        url: 'https://simplepixelart.com/generator',
        applicationCategory: 'GraphicsApplication',
        operatingSystem: 'Any (browser-based)',
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
        featureList: [
          'Text prompt to pixel art sprite',
          'Reference image to pixel art (image-to-image)',
          'Output sizes 16x16 to 128x128, or auto-detected native size',
          'Palette cap of 8, 16 or 32 colors',
          'Automatic background removal to transparency',
          'Crop to subject so the sprite fills the canvas',
          'Free re-conversion of a generated picture',
          'One-click hand-off to the pixel art editor',
        ],
      }),
    },
  ],
})

const loginModal = useLoginModal()

const SIZES: (number | 'auto')[] = ['auto', 16, 32, 64, 128]
const COLOR_COUNTS = [8, 16, 32]
const STYLES = [
  {v: 'sprite', l: t('p_generator.sprite')},
  {v: 'icon', l: t('p_generator.icon')},
  {v: 'character', l: t('p_generator.character')},
  {v: 'scene', l: t('p_generator.scene')},
]
const VIEWS = [
  {v: 'auto', l: t('common.auto')},
  {v: 'front', l: t('p_generator.front')},
  {v: 'side', l: t('p_generator.side')},
  {v: 'isometric', l: t('p_generator.iso')},
]
const BG_MODES = computed(() => [
  {v: 'cut', l: t('p_generator.bgCut'), t: t('p_generator.bgCutHint')},
  {v: 'keep', l: t('p_generator.bgKeep'), t: t('p_generator.bgKeepHint')},
  {v: 'off', l: t('p_generator.bgOff'), t: t('p_generator.bgOffHint')},
] as const)
type BgMode = 'cut' | 'keep' | 'off'

const prompt = ref('')
const size = ref<number | 'auto'>(32)
const style = ref('sprite')
const view = ref('auto')
const outline = ref(false)
const maxColors = ref(16)
const bgMode = ref<BgMode>('cut')
const fillGrid = ref(true)
const previewMode = ref<'pixel' | 'original'>('pixel')

type GenHistoryItem = {
  id: number
  prompt: string
  thumb: string
  options: { size?: number; style?: string; view?: string; outline?: boolean; colors?: number }
}
const history = ref<GenHistoryItem[]>([])
const historyId = ref<number | null>(null)
let restoring = false

watch(style, (v) => { if (!restoring) bgMode.value = v === 'scene' ? 'keep' : 'cut' })

const busy = ref(false)
const converting = ref(false)
const claiming = ref(false)
// cost is null until the server has told us — prices live in one config
// there and are tuned without a deploy, so a number baked in here goes
// stale silently. The fallback used to be 60, which is now double.
const summary = ref<{ enabled: boolean; cost: number | null; balance: number; dailyClaimed: boolean; dailyGrant: number } | null>(null)
const resultUrl = ref('')
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const promptEl = ref<HTMLInputElement | null>(null)

const REF_SIDE = 768
const fileEl = ref<HTMLInputElement | null>(null)
const reference = ref('')
const referenceName = ref('')
const refining = ref(false)

// Shrink to the side the API accepts before sending. The server clamps too,
// but a 1024px PNG is megabytes on the wire for nothing.
async function toReference(url: string, smooth: boolean): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, err) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = err
    i.src = url
  })
  const f = Math.min(1, REF_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  if (f === 1 && url.startsWith('data:image/png')) return url
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, Math.round(img.naturalWidth * f))
  cv.height = Math.max(1, Math.round(img.naturalHeight * f))
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = smooth
  if (smooth) ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, cv.width, cv.height)
  return cv.toDataURL('image/png')
}

async function pickReference(file: File | null | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) { toast.error('That file is not an image'); return }
  try {
    const url = await new Promise<string>((ok, err) => {
      const r = new FileReader()
      r.onload = () => ok(r.result as string)
      r.onerror = () => err(r.error)
      r.readAsDataURL(file)
    })
    reference.value = await toReference(url, true)
    referenceName.value = file.name
    refining.value = false
  } catch {
    toast.error('Could not read that image')
  }
}

// Refine: hand the sprite back to the model as the reference and let the next
// prompt describe a change to it. Nearest-neighbour on the way down, so the
// model is shown hard pixel edges rather than a blurred copy of them.
async function refineResult() {
  if (!resultUrl.value || busy.value) return
  try {
    reference.value = await toReference(resultUrl.value, false)
    referenceName.value = 'This sprite'
    refining.value = true
    prompt.value = ''
    await nextTick()
    promptEl.value?.focus()
  } catch {
    toast.error('Could not reuse that result')
  }
}

function onRefPick(e: Event) {
  pickReference((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = ''
}

function clearReference() {
  reference.value = ''
  referenceName.value = ''
  refining.value = false
}

function onRefDrop(e: DragEvent) {
  e.preventDefault()
  pickReference(e.dataTransfer?.files?.[0])
}
const grid = ref<number[][]>([])
const palette = ref<string[]>([])

const BG = 0
const hasResult = computed(() => !!resultUrl.value && grid.value.length > 0)
const broke = computed(() =>
    auth.isLogged && !!summary.value?.enabled && summary.value.cost !== null
    && summary.value.balance < summary.value.cost)

async function loadSummary() {
  try {
    const sum = await useNativeFetch<any>('/coloring/economy/')
    summary.value = {
      enabled: !!sum.ai_image_enabled,
      cost: typeof sum.actions?.gen_image === 'number' ? sum.actions.gen_image : null,
      balance: sum.balance ?? 0,
      dailyClaimed: !!sum.daily_claimed,
      dailyGrant: sum.daily_grant ?? 0,
    }
  } catch { summary.value = null }
}

onMounted(() => {
  const seed = route.query.prompt
  if (typeof seed === 'string' && seed.trim()) prompt.value = seed.slice(0, 300)
  loadSummary()
  if (auth.isLogged) loadHistory()
})

async function claimDaily() {
  if (claiming.value || !summary.value) return
  claiming.value = true
  try {
    const res = await useNativeFetch<{ granted: number; balance: number }>(
        '/coloring/economy/daily/', {method: 'POST'})
    summary.value.balance = res.balance
    summary.value.dailyClaimed = true
    toast.success(`+🪙${res.granted} daily bonus`)
  } catch (e: any) {
    if ((e?.status ?? e?.response?.status) === 409) summary.value.dailyClaimed = true
    else toast.error('Could not claim right now')
  } finally {
    claiming.value = false
  }
}

let convertRun = 0

async function convertResult() {
  if (!resultUrl.value) return
  const run = ++convertRun
  converting.value = true
  try {
    const q = await aiImageToGrid(resultUrl.value, size.value, maxColors.value, {
      removeGround: bgMode.value !== 'off',
      fillGrid: fillGrid.value,
    })
    if (run !== convertRun) return
    if (!q) { toast.error('Could not read the generated image'); return }
    grid.value = q.indexed
    palette.value = q.palette.map(c => rgbToHex(c[0], c[1], c[2]).toUpperCase())
    await nextTick()
    drawPreview()
  } finally {
    converting.value = false
  }
}

watch([bgMode, maxColors, fillGrid, size], () => { if (resultUrl.value && !restoring) convertResult() })
watch(previewMode, (m) => { if (m === 'pixel') nextTick(drawPreview) })

function drawPreview() {
  const cv = previewCanvas.value
  if (!cv || !grid.value.length) return
  const n = grid.value.length
  const scale = Math.max(1, Math.floor(384 / n))
  cv.width = n * scale
  cv.height = n * scale
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, cv.width, cv.height)
  const skip = bgMode.value === 'cut' ? BG : -1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const idx = grid.value[y]![x]!
      if (idx === skip) continue
      ctx.fillStyle = palette.value[idx]!
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}

async function generate() {
  if (busy.value || prompt.value.trim().length < 3) return
  busy.value = true
  try {
    const res = await useNativeFetch<{ image: string; balance: number; history_id: number | null }>(
        '/coloring/economy/gen-image/',
        {
          method: 'POST',
          body: {
            prompt: prompt.value.trim(),
            size: size.value === 'auto' ? 128 : size.value,
            style: style.value, view: view.value, outline: outline.value,
            colors: maxColors.value,
            ...(reference.value
                ? {reference: reference.value, reference_kind: refining.value ? 'art' : 'photo'}
                : {}),
          },
        },
    )
    resultUrl.value = res.image
    previewMode.value = 'pixel'
    // Keep refining from what is on screen now, so a second change applies to
    // the sprite the user just accepted rather than to an older one.
    if (refining.value) reference.value = await toReference(res.image, false)
    if (summary.value) summary.value.balance = res.balance
    await convertResult()
    historyId.value = res.history_id ?? null
    loadHistory()
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    const codes = e?.data ?? e?.response?._data
    const code = Array.isArray(codes) ? codes[0] : ''
    if (s === 400 && String(code).startsWith('REFERENCE')) {
      toast.error(code === 'REFERENCE_TOO_LARGE' ? 'That reference image is too large' : 'Could not use that reference image')
    } else if (s === 401) toast.error('Sign in to generate')
    else if (s === 402) {
      toast.error('Not enough credits — earn some in Missions')
      await loadSummary()
    } else if (s === 429) toast.error('Too many generations — take a short break')
    else toast.error('Generation failed — your credits were refunded')
  } finally {
    busy.value = false
  }
}

async function loadHistory() {
  try {
    const res = await useNativeFetch<{ results: GenHistoryItem[] }>(
        '/coloring/economy/gen-image/history/')
    history.value = res.results || []
  } catch {  }
}

async function restoreFromHistory(h: GenHistoryItem) {
  if (busy.value || converting.value) return
  let original = ''
  try {
    const res = await useNativeFetch<{ image: string; prompt: string; options: GenHistoryItem['options'] }>(
        `/coloring/economy/gen-image/history/${h.id}/`)
    original = res.image
  } catch (e: any) {
    toast.error('That picture is no longer stored')
    history.value = history.value.filter(e2 => e2.id !== h.id)
    return
  }
  restoring = true
  prompt.value = h.prompt
  style.value = h.options.style || 'sprite'
  view.value = h.options.view || 'auto'
  outline.value = !!h.options.outline
  size.value = h.options.size || 32
  maxColors.value = h.options.colors || 16
  bgMode.value = style.value === 'scene' ? 'keep' : 'cut'
  fillGrid.value = true
  resultUrl.value = original
  previewMode.value = 'pixel'
  historyId.value = h.id
  await nextTick()
  restoring = false
  await convertResult()
}

function deleteFromHistory(id: number) {
  history.value = history.value.filter(e => e.id !== id)
  if (historyId.value === id) historyId.value = null
  useNativeFetch(`/coloring/economy/gen-image/history/${id}/`, {method: 'DELETE'})
      .catch(() => {  })
}

async function sendToEditor() {
  if (!grid.value.length) return
  let g = grid.value
  let pal = palette.value
  let skip = bgMode.value === 'cut' ? BG : -1
  if (previewMode.value === 'original' && resultUrl.value) {
    converting.value = true
    try {
      const q = await aiImageToGrid(resultUrl.value, 'auto', 64,
          {removeGround: false, fillGrid: false, minShare: 0})
      if (!q) { toast.error('Could not read the generated image'); return }
      g = q.indexed
      pal = q.palette.map(c => rgbToHex(c[0], c[1], c[2]).toUpperCase())
      skip = -1
    } finally {
      converting.value = false
    }
  }
  const n = g.length
  const pixels: Record<string, number> = {}
  const remap = new Map<number, number>()
  const colors: string[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const idx = g[y]![x]!
      if (idx === skip) continue
      let m = remap.get(idx)
      if (m === undefined) { m = colors.length; colors.push(pal[idx]!); remap.set(idx, m) }
      pixels[`${x}_${y}`] = m
    }
  }
  if (!Object.keys(pixels).length) { toast.error('The result came out empty — try again'); return }
  const id = generateUUID()
  const data: EditorData = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id,
    name: prompt.value.trim().slice(0, 60),
    width: n, height: n,
    colors,
    layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
    updated: new Date().toISOString(),
  } as EditorData
  const ws = getStorageItem('workspaces')
  ws[id] = data
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', id)
  navigateTo(localePath(`/editor?id=${id}`))
}

const faq = computed(() => [
  {q: t('p_generator.faq0q'), a: t('p_generator.faq0a')},
  {q: t('p_generator.faq1q'), a: t('p_generator.faq1a')},
  {q: t('p_generator.faq2q'), a: t('p_generator.faq2a')},
  {q: t('p_generator.faq3q'), a: t('p_generator.faq3a')},
  {q: t('p_generator.faq4q'), a: t('p_generator.faq4a')},
  {q: t('p_generator.faq5q'), a: t('p_generator.faq5a')},
])
</script>

<template>
  <ToolLayout :title="$t('p_generator.generator')">
    <div class="gen-grid flat-editor">

      <div class="canvas-col">
        <Widget :title="$t('common.preview')">
          <div class="preview-wrapper">

            <div v-if="hasResult" class="tm-seg gen-viewseg">
              <button :class="{active: previewMode === 'pixel'}" @click="previewMode = 'pixel'">{{ $t('p_generator.pixelArt') }}</button>
              <button :class="{active: previewMode === 'original'}" @click="previewMode = 'original'">{{ $t('p_generator.original') }}</button>
            </div>
            <template v-if="hasResult">
              <canvas
                  v-show="previewMode === 'pixel'"
                  ref="previewCanvas"
                  class="gen-preview pixelated"
                  :class="{busy: converting}"
              />
              <img v-if="previewMode === 'original'" :src="resultUrl" :alt="$t('p_generator.generatedPicture')" class="gen-original">
            </template>

            <div v-else class="tool-empty">
              <span class="icon icon-auto-fix"/>
              <p class="text-sm">{{ $t('p_generator.describeASpriteAndGenerateIt') }}</p>
              <p class="text-xs text-muted" v-html="$t('p_generator.youGetPixelsOnACanvas')"/>
              <p v-if="summary && !summary.enabled" class="text-xs text-muted" v-html="$t('p_generator.generationIsOfflineRightNowCheck')"/>
            </div>
          </div>
        </Widget>

        <p v-if="hasResult && previewMode === 'original'" class="gen-hint text-xs text-muted" v-html="$t('p_generator.theModelSOwnPictureThe')"/>

        <div v-if="hasResult" class="gen-actions">
          <button
              class="btn primary block"
              :title="previewMode === 'original' ? 'Open the original picture in the editor' : 'Open the pixel art in the editor'"
              @click="sendToEditor"
          >
            <span class="icon icon-pen"/>
            <span>{{ previewMode === 'original' ? 'Open Original in Editor' : 'Open in Editor' }}</span>
          </button>
          <button
              class="btn block"
              :disabled="busy || !auth.isLogged"
              :title="$t('p_generator.describeAChangeAndGenerateThis')"
              @click="refineResult"
          >
            <span class="icon icon-auto-fix"/>
            <span>{{ $t('p_generator.refine') }}</span>
          </button>
        </div>

      </div>

      <div class="gen-composer" @drop="onRefDrop" @dragover.prevent>

        <div v-if="reference" class="gen-ref" :class="{'is-refining': refining}">
          <img :src="reference" alt="" class="gen-ref-thumb">
          <span class="gen-ref-name">{{ refining ? 'Refining this sprite' : (referenceName || 'Reference image') }}</span>
          <button
              class="gen-ref-x"
              :aria-label="refining ? 'Stop refining' : 'Remove reference'"
              :title="refining ? 'Stop refining and describe a new sprite' : 'Remove reference'"
              @click="clearReference"
          >
            <span class="icon icon-close"/>
          </button>
        </div>
        <div class="gen-composer-box">
          <button
              class="gen-attach"
              :disabled="busy || !auth.isLogged"
              :aria-label="reference ? $t('p_generator.replaceReferenceImage') : $t('p_generator.attachAReferenceImage')"
              :title="reference ? 'Replace the reference image' : 'Attach a reference image — the sprite is redrawn from it'"
              :class="{active: !!reference}"
            @click="fileEl?.click()"
          >
            <span class="icon icon-paperclip"/>
          </button>
          <input ref="fileEl" type="file" accept="image/*" class="gen-file" @change="onRefPick">
          <input
              ref="promptEl"
              v-model="prompt"
              type="text"
              class="gen-input"
              maxlength="300"
              :placeholder="refining ? 'What to change — “make the hat red”…' : reference ? 'What to change…' : hasResult ? 'Describe another sprite…' : 'A sleeping orange cat curled up…'"
              :disabled="busy || !auth.isLogged"
              @keydown.enter.prevent="generate"
          >
          <button v-if="!auth.isLogged" class="btn primary gen-send" @click="loginModal.show()">
            <span class="icon icon-user"/><span>{{ $t('common.signIn') }}</span>
          </button>
          <button
              v-else
              class="btn primary gen-send"
              :disabled="busy || broke || prompt.trim().length < 3 || (summary ? !summary.enabled : false)"
              :title="`${hasResult ? $t('p_generator.generateAnother') : $t('p_generator.generate2')}${summary?.cost == null ? '' : ` — 🪙${summary.cost}`}`"
              @click="generate"
          >
            <span class="icon" :class="busy ? 'icon-refresh' : 'icon-auto-fix'"/>
            <span class="gen-send-label">{{ busy ? 'Generating…' : hasResult ? 'Again' : 'Generate' }}</span>
            <span v-if="summary?.cost != null" class="gen-cost">
              <span class="icon icon-coin"/>{{ summary.cost }}
            </span>
          </button>
        </div>

        <div v-if="broke || (summary && !summary.enabled)" class="gen-composer-foot">
          <template v-if="broke">
            <span class="text-2xs text-muted">Need 🪙{{ summary!.cost }}</span>
            <button
                v-if="!summary!.dailyClaimed && summary!.dailyGrant > 0"
                class="gen-link"
                :disabled="claiming"
                @click="claimDaily"
            >{{ claiming ? 'Claiming…' : `${$t('p_generator.claim')} 🪙${summary!.dailyGrant}` }}</button>
            <NuxtLinkLocale to="/missions" class="gen-link">{{ $t('common.earnCredits') }}</NuxtLinkLocale>
          </template>
          <span v-else class="text-2xs text-muted">{{ $t('p_generator.generationIsOffline') }}</span>
        </div>
      </div>

      <div class="editor-sidebar">
        <Widget :title="$t('p_generator.look')">
          <div class="settings-row">
            <label v-for="s in STYLES" :key="s.v" class="pill" :class="{active: style === s.v}">
              <input type="radio" :value="s.v" v-model="style" :disabled="busy">
              <span>{{ s.l }}</span>
            </label>
          </div>
          <div class="settings-row gen-row2">
            <label v-for="v in VIEWS" :key="v.v" class="pill" :class="{active: view === v.v}">
              <input type="radio" :value="v.v" v-model="view" :disabled="busy">
              <span>{{ v.l }}</span>
            </label>
          </div>
          <label class="editor-check">
            <input v-model="outline" type="checkbox" :disabled="busy">
            <span class="text-xs">{{ $t('p_generator.darkOutline') }}</span>
          </label>
        </Widget>

        <Widget :title="$t('p_generator.output')">
          <div class="settings-row" :title="$t('p_generator.canvasSizeAutoKeepsTheModel')">
            <label v-for="s in SIZES" :key="s" class="pill" :class="{active: size === s}">
              <input type="radio" :value="s" v-model="size">
              <span>{{ s === 'auto' ? 'Auto' : s }}</span>
            </label>
          </div>
          <p v-if="size === 'auto' && hasResult" class="tool-note">
            Auto → {{ grid.length }}×{{ grid.length }}
          </p>
          <div class="settings-row gen-row2" :title="$t('p_generator.paletteSizeReConvertsForFree')">
            <label v-for="c in COLOR_COUNTS" :key="c" class="pill" :class="{active: maxColors === c}">
              <input type="radio" :value="c" v-model="maxColors">
              <span>{{ c }}c</span>
            </label>
          </div>

          <p v-if="reference && size !== 'auto' && size < 64" class="tool-note">
            {{ $t('p_generator.aPhotoHoldsUpBetterAt') }}
          </p>
        </Widget>

        <Widget :title="$t('p_generator.backdrop')">
          <div class="settings-row">
            <label v-for="m in BG_MODES" :key="m.v" class="pill" :class="{active: bgMode === m.v}" :title="m.t">
              <input type="radio" :value="m.v" v-model="bgMode">
              <span>{{ m.l }}</span>
            </label>
          </div>
          <label class="editor-check" :title="$t('p_generator.cropToTheSubjectSoIt')">
            <input v-model="fillGrid" type="checkbox">
            <span class="text-xs">{{ $t('p_generator.cropToSubject') }}</span>
          </label>
        </Widget>

        <Widget v-if="history.length" :title="$t('p_generator.history')">
          <div class="gen-hist">
            <div v-for="h in history" :key="h.id" class="gen-hist-item" :class="{active: h.id === historyId}">
              <button class="gen-hist-thumb" :title="h.prompt" :disabled="busy" @click="restoreFromHistory(h)">
                <img v-if="h.thumb" :src="h.thumb" :alt="h.prompt">
                <span v-else class="icon icon-auto-fix"/>
              </button>
              <button class="gen-hist-x" :aria-label="$t('p_generator.removeFromHistory')" :title="$t('common.remove')" @click="deleteFromHistory(h.id)">
                <span class="icon icon-close"/>
              </button>
            </div>
          </div>
          <p class="tool-note">{{ $t('p_generator.reopeningIsFree') }}</p>
        </Widget>
      </div>
    </div>


    <template #status>
      <p class="editor-foot-hint text-xs text-muted">
        {{ style }} · {{ view }} view · {{ size === 'auto' ? 'auto size' : `${size}×${size}px` }} ·
        {{ maxColors }} colors · backdrop {{ bgMode }}
      </p>
      <span class="text-xs text-muted">{{ busy ? $t('p_generator.generating') : hasResult ? $t('p_generator.ready') : $t('p_generator.idle') }}</span>
    </template>

    <template #doc>
      <h1>{{ $t('p_generator.aiPixelArtGenerator') }}</h1>
      <p v-html="$t('p_generator.describeASpriteGetPixelArt')"/>

      <h2>{{ $t('common.howToUseIt') }}</h2>
      <ol>
        <li v-html="$t('p_generator.strongDescribeTheSpriteStrongA')"/>
        <li v-html="$t('p_generator.strongOrStartFromAPicture')"/>
        <li v-html="$t('p_generator.strongGenerateStrongOneCreditCosti')"/>
        <li v-html="$t('p_generator.strongTuneItFreeStrongChange')"/>
        <li v-html="$t('p_generator.strongOpenInEditorStrongThe')"/>
      </ol>

      <h2>{{ $t('p_generator.whyTheResultIsEditableNot') }}</h2>
      <p v-html="$t('p_generator.imageModelsCanTDrawA')"/>

      <h2>{{ $t('common.features') }}</h2>
      <ul>
        <li v-html="$t('p_generator.strongTextToSpriteStrongPrompt')"/>
        <li v-html="$t('p_generator.strongReferenceImageStrongAttachA')"/>
        <li v-html="$t('p_generator.strongSizes1616To128')"/>
        <li v-html="$t('p_generator.strongPaletteCapStrong816')"/>
        <li v-html="$t('p_generator.strongBackgroundControlStrongCutIt')"/>
        <li v-html="$t('p_generator.strongSeeTheOriginalStrongCompare')"/>
        <li v-html="$t('p_generator.strongHistoryStrongYourRecentGener')"/>
        <li v-html="$t('p_generator.strongEditorHandOffStrongDraw')"/>
      </ul>

      <QnA :items="faq"/>
    </template>
  </ToolLayout>
</template>

<style scoped>

.gen-grid {
  display: grid;
  gap: 0;
  /* minmax(0, 1fr), not 1fr: a `1fr` track floors at min-content, which kept the
     canvas column at 369px and pushed the page 49px sideways at 320. */
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
}

@media (min-width: 768px) {
  .gen-grid {
    grid-template-columns: minmax(0, 1fr) var(--sidebar-w);
  }
}



.preview-wrapper {
  position: relative;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
}

/* The preview grows to fill the panel but must keep its shape. width:100%
   with only a max-height let the box take the panel's proportions instead,
   which stretched the sprite whenever the panel was not square — and the dash
   layout drops the wrapper's aspect-ratio, so it rarely is. */
.gen-preview {
  aspect-ratio: 1;
  width: min(100cqw, 100cqh);
  height: auto;
}

/* The model's own picture is not necessarily square, so letterbox it. */
.gen-original {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gen-preview {
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 18%, transparent) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
}

.gen-preview.busy { opacity: 0.55; }

.gen-original { border-radius: var(--radius-sm); }

.gen-viewseg {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  z-index: 1;
  --tm-ctl: 24px;
  padding: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
}

.gen-viewseg button {
  padding: 0 0.5rem;
  font-size: var(--text-2xs);
  letter-spacing: 0.02em;
}

.gen-ref {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.gen-ref-thumb {
  flex: none;
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  background: var(--surface-2);
}

.gen-ref-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-2xs);
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gen-ref-x {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.gen-ref-x .icon {
  width: 0.875rem;
  height: 0.875rem;
}

.gen-ref-x:hover {
  background: var(--surface-2);
  color: var(--foreground);
}

.gen-attach {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.375rem;
  height: 2.375rem;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.gen-attach .icon {
  width: 1.125rem;
  height: 1.125rem;
}

.gen-attach:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--foreground);
}

.gen-attach:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.gen-attach.active {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, transparent);
}

.gen-attach:disabled { opacity: 0.4; cursor: not-allowed; }

.gen-file { display: none; }

.gen-composer {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border);
  padding: var(--space-3);
}

.gen-composer-box {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--background);
  padding: var(--space-2);
  transition: border-color var(--transition);
}

.gen-composer-box:focus-within { border-color: var(--primary); }

.gen-input {
  flex: 1;
  min-width: 0;
  height: 2.375rem;               
  border: 0;
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-sm);
  padding: 0 var(--space-1);
}

.gen-input:focus,
.gen-input:focus-visible {
  outline: none;
  box-shadow: none;
  border-color: transparent;
}

.gen-send {
  flex: none;
  justify-content: center;
  white-space: nowrap;
}

.gen-composer-foot {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
  padding: 0 var(--space-1);
}

.gen-link {
  font-size: var(--text-2xs);
  color: var(--primary);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.gen-hint {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  text-align: center;
}

.gen-actions {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}

.gen-cost {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-2xs);
  opacity: 0.8;
}

.gen-cost .icon { width: 12px; height: 12px; }

.gen-row2 { margin-top: var(--space-2); }

.gen-hist {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-1);
}

.gen-hist-item { position: relative; }

.gen-hist-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
  overflow: hidden;
  transition: border-color var(--transition);
}

.gen-hist-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gen-hist-thumb:hover:not(:disabled) { border-color: var(--primary); }
.gen-hist-thumb:disabled { opacity: 0.5; cursor: default; }

.gen-hist-item.active .gen-hist-thumb {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

.gen-hist-x {
  position: absolute;
  top: -5px;
  right: -5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--background);
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition), color var(--transition);
}

.gen-hist-x .icon { width: 0.625rem; height: 0.625rem; }

.gen-hist-item:hover .gen-hist-x,
.gen-hist-x:focus-visible { opacity: 1; }

.gen-hist-x:hover { color: var(--danger); }

@media (hover: none) {
  .gen-hist-x { opacity: 1; }
}

</style>
