<script setup lang="ts">
import {toast} from 'vue-sonner'
import {cloneDeep, generateUUID, getStorageItem} from '~/helper/utils'
import {rgbToHex} from '~/helper/color'
import {aiImageToGrid} from '~/helper/pixel-reconstruct'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import type {EditorData} from '~/types'

// Text prompt → pixel art, as a tool page in its own right (it used to be a
// modal inside the editor). Same shape as /convert: preview on the left,
// settings on the right, one hand-off button into the editor.
const auth = useAuthStore()
const config = useRuntimeConfig()
const requestURL = useRequestURL()
const route = useRoute()

useCustomSeoMeta({
  title: 'AI Pixel Art Generator — Text to Sprite, Free',
  description: 'Describe a sprite — or attach a reference image — and get editable pixel art. Choose 16×16 to 128×128, cap the palette, cut the background, then open the result in a full pixel art editor.',
  keywords: 'ai pixel art generator, text to pixel art, ai sprite generator, pixel art from text, image to pixel art ai, photo to sprite ai, ai game asset generator, free ai pixel art, prompt to sprite',
  canonical: 'https://simplepixelart.com/generate',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'AI Pixel Art Generator',
        description: 'Generate pixel art sprites from a text prompt, then tune the size, palette and background before editing them.',
        url: 'https://simplepixelart.com/generate',
        applicationCategory: 'GraphicsApplication',
        operatingSystem: 'Any (browser-based)',
        offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
        featureList: [
          'Text prompt to pixel art sprite',
          'Reference image to pixel art (image-to-image)',
          'Output sizes 16x16 to 128x128',
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

// Same Google OAuth entry the command palette uses — there is no /auth page.
const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  return `${apiBase}/auth/google?state=${encodeURIComponent(`${requestURL.origin}/auth/callback`)}`
})

const SIZES = [16, 32, 64, 128]
const COLOR_COUNTS = [8, 16, 32]
// Whitelisted prompt modifiers (mirrored server-side) — steer the model
// without asking users to write prompt-engineering incantations.
const STYLES = [
  {v: 'sprite', l: 'Sprite'},
  {v: 'icon', l: 'Icon'},
  {v: 'character', l: 'Character'},
  {v: 'scene', l: 'Scene'},
]
const VIEWS = [
  {v: 'auto', l: 'Auto'},
  {v: 'front', l: 'Front'},
  {v: 'side', l: 'Side'},
  {v: 'isometric', l: 'Iso'},
]
// Background handling, one control: cut it to transparency (default), keep it
// as a painted colour, or leave the model's ground alone when the removal
// misjudges a subject.
const BG_MODES = [
  {v: 'cut', l: 'Cut', t: 'Remove the background — the sprite lands with transparency around it'},
  {v: 'keep', l: 'Keep', t: 'Remove it, then paint the colour the model used back in'},
  {v: 'off', l: 'Off', t: "Don't touch the background — use the picture exactly as generated"},
] as const
type BgMode = typeof BG_MODES[number]['v']

const prompt = ref('')
const size = ref(32)
const style = ref('sprite')
const view = ref('auto')
const outline = ref(false)
const maxColors = ref(16)
const bgMode = ref<BgMode>('cut')
const fillGrid = ref(true)
const previewMode = ref<'pixel' | 'original'>('pixel')

// ── History: every paid generation, saved to the account (cloud) ─────
// The backend records each success (options + thumb + the picture itself);
// the attached reference image is never stored. Reopening an entry re-runs
// the free local conversion — no credits involved.
type GenHistoryItem = {
  id: number
  prompt: string
  thumb: string
  options: { size?: number; style?: string; view?: string; outline?: boolean; colors?: number }
}
const history = ref<GenHistoryItem[]>([])
const historyId = ref<number | null>(null)   // the entry currently on the stage
// Restoring assigns several watched settings at once — hold the watchers below
// so they neither re-convert per knob nor reset the restored backdrop.
let restoring = false

// A scene fills the frame — keeping its background makes more sense.
watch(style, (v) => { if (!restoring) bgMode.value = v === 'scene' ? 'keep' : 'cut' })

const busy = ref(false)
const converting = ref(false)
const claiming = ref(false)
const summary = ref<{ enabled: boolean; cost: number; balance: number; dailyClaimed: boolean; dailyGrant: number } | null>(null)
const resultUrl = ref('')            // the picture credits were spent on
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const promptEl = ref<HTMLInputElement | null>(null)

// ── Reference image (optional, image-to-image) ───────────────────────
// The model conditions on the attached picture, so it only has to be legible:
// downscale to 768px before sending and the request stays small.
const REF_SIDE = 768
const fileEl = ref<HTMLInputElement | null>(null)
const reference = ref('')          // data URL sent with the next generation
const referenceName = ref('')

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
    const img = await new Promise<HTMLImageElement>((ok, err) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = err
      i.src = url
    })
    const f = Math.min(1, REF_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const cv = document.createElement('canvas')
    cv.width = Math.max(1, Math.round(img.naturalWidth * f))
    cv.height = Math.max(1, Math.round(img.naturalHeight * f))
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    reference.value = cv.toDataURL('image/png')
    referenceName.value = file.name
  } catch {
    toast.error('Could not read that image')
  }
}

function onRefPick(e: Event) {
  pickReference((e.target as HTMLInputElement).files?.[0])
  ;(e.target as HTMLInputElement).value = ''      // same file twice still fires
}

function clearReference() {
  reference.value = ''
  referenceName.value = ''
}

// Dropping a picture on the composer is the other obvious gesture.
function onRefDrop(e: DragEvent) {
  e.preventDefault()
  pickReference(e.dataTransfer?.files?.[0])
}
const grid = ref<number[][]>([])     // indexed pixels of the converted result
const palette = ref<string[]>([])

const BG = 0
const hasResult = computed(() => !!resultUrl.value && grid.value.length > 0)
// Not enough credits for one generation — the earn path takes over.
const broke = computed(() =>
    auth.isLogged && !!summary.value?.enabled && summary.value.balance < summary.value.cost)

async function loadSummary() {
  try {
    const sum = await useNativeFetch<any>('/coloring/economy/')
    summary.value = {
      enabled: !!sum.ai_image_enabled,
      cost: sum.actions?.gen_image ?? 60,
      balance: sum.balance ?? 0,
      dailyClaimed: !!sum.daily_claimed,
      dailyGrant: sum.daily_grant ?? 0,
    }
  } catch { summary.value = null }
}

onMounted(() => {
  // Prefill from the home hero form.
  const seed = route.query.prompt
  if (typeof seed === 'string' && seed.trim()) prompt.value = seed.slice(0, 300)
  loadSummary()
  if (auth.isLogged) loadHistory()
})

// Instant top-up right here — the daily bonus is the fastest earn.
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

// ── Convert: the model's picture → an indexed N×N grid ───────────────
// aiImageToGrid (see ~/helper/pixel-reconstruct) flood-fills the model's flat
// ground to transparency from the border, crops to the subject, then resamples
// by cell majority keeping the model's own flat colours. Index 0 is the
// background and palette[0] holds the ground colour, so "Keep" can paint it in.
async function convertResult() {
  if (!resultUrl.value) return
  converting.value = true
  try {
    const q = await aiImageToGrid(resultUrl.value, size.value, maxColors.value, {
      removeGround: bgMode.value !== 'off',
      fillGrid: fillGrid.value,
    })
    if (!q) { toast.error('Could not read the generated image'); return }
    grid.value = q.indexed
    palette.value = q.palette.map(c => rgbToHex(c[0], c[1], c[2]).toUpperCase())
    await nextTick()
    drawPreview()
  } finally {
    converting.value = false
  }
}

// Every knob re-runs the conversion on the picture already paid for — adjusting
// never spends another credit, a size change included.
watch([bgMode, maxColors, fillGrid, size], () => { if (resultUrl.value && !restoring) convertResult() })
watch(previewMode, (m) => { if (m === 'pixel') nextTick(drawPreview) })

function drawPreview() {
  const cv = previewCanvas.value
  if (!cv || !grid.value.length) return
  const n = size.value
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
            prompt: prompt.value.trim(), size: size.value,
            style: style.value, view: view.value, outline: outline.value,
            colors: maxColors.value,
            ...(reference.value ? {reference: reference.value} : {}),
          },
        },
    )
    resultUrl.value = res.image
    previewMode.value = 'pixel'
    if (summary.value) summary.value.balance = res.balance
    await convertResult()
    historyId.value = res.history_id ?? null
    loadHistory()                    // the backend recorded it — refresh the strip
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

// ── History plumbing (cloud — /coloring/economy/gen-image/history/) ──
async function loadHistory() {
  try {
    const res = await useNativeFetch<{ results: GenHistoryItem[] }>(
        '/coloring/economy/gen-image/history/')
    history.value = res.results || []
  } catch { /* strip just stays as it is */ }
}

// Reopen a past generation: the stored picture and its options come back, and
// re-converting is free — no credits involved.
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
  // Conversion knobs are client-side and not part of the stored request —
  // rederive them the way a fresh generation would.
  bgMode.value = style.value === 'scene' ? 'keep' : 'cut'
  fillGrid.value = true
  resultUrl.value = original
  previewMode.value = 'pixel'
  historyId.value = h.id
  await nextTick()                   // let the held watchers flush first
  restoring = false
  await convertResult()
}

// Removing an entry only forgets it — whatever is on the stage stays.
function deleteFromHistory(id: number) {
  history.value = history.value.filter(e => e.id !== id)
  if (historyId.value === id) historyId.value = null
  useNativeFetch(`/coloring/economy/gen-image/history/${id}/`, {method: 'DELETE'})
      .catch(() => { /* it comes back on the next load if the delete failed */ })
}

// Hand off to the editor the same way the other tools do: park the artwork in
// the local workspace store and open it by id.
function sendToEditor() {
  if (!grid.value.length) return
  const skip = bgMode.value === 'cut' ? BG : -1
  const pixels: Record<string, number> = {}
  const remap = new Map<number, number>()
  const colors: string[] = []
  for (let y = 0; y < size.value; y++) {
    for (let x = 0; x < size.value; x++) {
      const idx = grid.value[y]![x]!
      if (idx === skip) continue
      let m = remap.get(idx)
      if (m === undefined) { m = colors.length; colors.push(palette.value[idx]!); remap.set(idx, m) }
      pixels[`${x}_${y}`] = m
    }
  }
  if (!Object.keys(pixels).length) { toast.error('The result came out empty — try again'); return }
  const id = generateUUID()
  const data: EditorData = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id,
    name: prompt.value.trim().slice(0, 60),
    width: size.value, height: size.value,
    colors,
    layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
    updated: new Date().toISOString(),
  } as EditorData
  const ws = getStorageItem('workspaces')
  ws[id] = data
  localStorage.setItem('workspaces', JSON.stringify(ws))
  localStorage.setItem('workspace_current', id)
  navigateTo(`/editor?id=${id}`)
}

const faq = [
  {
    q: 'What do I get out of it?',
    a: `<p>An editable pixel art board — not a flat picture. The sprite arrives in the editor as pixels on a canvas of the size you chose, with a real palette you can recolor, so you can fix a face, redraw a hand, or animate it.</p>`,
  },
  {
    q: 'Why does generating cost credits?',
    a: `<p>Each generation calls an image model, which costs real money per picture. Credits keep that sustainable. You earn them free in <a href="/missions">Missions</a> — daily bonus, publishing art, inviting friends — and adjusting a result you already generated is always free.</p>`,
  },
  {
    q: 'Does changing the size or palette cost another credit?',
    a: `<p>No. Size, colors, backdrop and cropping all re-run on the picture you already paid for, in your browser. Only <strong>Try again</strong> asks the model for a new picture.</p>`,
  },
  {
    q: 'How is the background removed?',
    a: `<p>The model is asked for a flat background that contrasts with the subject, and the tool then flood-fills that ground away from the border inwards — so a color the subject also uses can never be punched out from inside it. If the removal misjudges your sprite, set <strong>Backdrop</strong> to Off and clean it up in the editor.</p>`,
  },
  {
    q: 'Can I generate from my own image?',
    a: `<p>Yes. Attach a reference with the 🖼 button in the prompt bar (or drop a file onto it), then describe what should change — “as a side-view sprite”, “only the head”, “make it night”. The model redraws your picture as pixel art instead of inventing a new subject. The reference is resized to 768px in your browser before it is sent, and it is not stored.</p>`,
  },
  {
    q: 'Can I use the results commercially?',
    a: `<p>Yes, the art is yours to use. Bear in mind AI output is not always unique, and check the terms of any store you publish to.</p>`,
  },
]
</script>

<template>
  <div class="page">
    <div class="gen-grid flat-editor">
      <!-- Preview -->
      <div class="gen-main">
        <Widget title="Preview">
          <template #ctl>
            <div v-if="hasResult" class="tm-seg gen-viewseg">
              <button :class="{active: previewMode === 'pixel'}" @click="previewMode = 'pixel'">Pixel art</button>
              <button :class="{active: previewMode === 'original'}" @click="previewMode = 'original'">Original</button>
            </div>
          </template>

          <div class="preview-wrapper">
            <template v-if="hasResult">
              <canvas
                  v-show="previewMode === 'pixel'"
                  ref="previewCanvas"
                  class="gen-preview pixelated"
                  :class="{busy: converting}"
              />
              <img v-if="previewMode === 'original'" :src="resultUrl" alt="Generated picture" class="gen-original">
            </template>

            <!-- Empty state, the way /convert puts its dropzone here -->
            <div v-else class="gen-empty">
              <span class="icon icon-auto-fix gen-empty-icon"/>
              <p class="text-sm">Describe a sprite and generate it</p>
              <p class="text-xs text-muted">You get pixels on a canvas — editable, not a flat image.</p>
              <p v-if="summary && !summary.enabled" class="text-xs text-muted">
                Generation is offline right now — check back soon.
              </p>
            </div>
          </div>
        </Widget>

        <p v-if="hasResult && previewMode === 'original'" class="gen-hint text-xs text-muted">
          The model's own picture — the pixel art tab is built from it.
        </p>

        <div v-if="hasResult" class="gen-actions">
          <button class="btn primary block" @click="sendToEditor">
            <span class="icon icon-pen"/>
            <span>Open in Editor</span>
          </button>
        </div>

        <!-- Composer: the prompt sits at the bottom of the work area, the way a
             chat does, so the same box starts the first sprite and asks for the
             next one. One line, Enter sends — a prompt is a sentence, and a
             textarea's line box never sat level with the buttons. -->
        <div class="gen-composer" @drop="onRefDrop" @dragover.prevent>
          <!-- Attached reference sits above the input, the way a chat shows the
               file you are about to send. -->
          <div v-if="reference" class="gen-ref">
            <img :src="reference" alt="" class="gen-ref-thumb">
            <span class="gen-ref-name">{{ referenceName || 'Reference image' }}</span>
            <button class="gen-ref-x" aria-label="Remove reference" title="Remove reference" @click="clearReference">
              <span class="icon icon-close"/>
            </button>
          </div>
          <div class="gen-composer-box">
            <button
                class="gen-attach"
                :disabled="busy || !auth.isLogged"
                :aria-label="reference ? 'Replace reference image' : 'Attach a reference image'"
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
                :placeholder="reference ? 'What to change…' : hasResult ? 'Describe another sprite…' : 'A sleeping orange cat curled up…'"
                :disabled="busy || !auth.isLogged"
                @keydown.enter.prevent="generate"
            >
            <a v-if="!auth.isLogged" :href="googleAuthUrl" class="btn primary gen-send">
              <span class="icon icon-user"/><span>Sign in</span>
            </a>
            <button
                v-else
                class="btn primary gen-send"
                :disabled="busy || broke || prompt.trim().length < 3 || (summary ? !summary.enabled : false)"
                :title="hasResult ? `Generate another — 🪙${summary?.cost ?? 60}` : `Generate — 🪙${summary?.cost ?? 60}`"
                @click="generate"
            >
              <span class="icon" :class="busy ? 'icon-refresh' : 'icon-auto-fix'"/>
              <span class="gen-send-label">{{ busy ? 'Generating…' : hasResult ? 'Again' : 'Generate' }}</span>
              <span class="gen-cost"><span class="icon icon-coin"/>{{ summary?.cost ?? 60 }}</span>
            </button>
          </div>
          <!-- Only what stands in the way: the site header already shows the
               balance, so nothing is echoed here. -->
          <div v-if="broke || (summary && !summary.enabled)" class="gen-composer-foot">
            <template v-if="broke">
              <span class="text-2xs text-muted">Need 🪙{{ summary!.cost }}</span>
              <button
                  v-if="!summary!.dailyClaimed && summary!.dailyGrant > 0"
                  class="gen-link"
                  :disabled="claiming"
                  @click="claimDaily"
              >{{ claiming ? 'Claiming…' : `Claim 🪙${summary!.dailyGrant}` }}</button>
              <nuxt-link to="/missions" class="gen-link">Earn credits</nuxt-link>
            </template>
            <span v-else class="text-2xs text-muted">Generation is offline</span>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div class="gen-settings">
        <Widget title="Look">
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
          <label class="gen-check">
            <input v-model="outline" type="checkbox" :disabled="busy">
            <span class="text-xs">Dark outline</span>
          </label>
        </Widget>

        <!-- Size, colours and backdrop all re-convert the picture already paid
             for, so they share one panel and carry no cost badge — the title
             attributes say so on hover instead of a paragraph of copy. -->
        <Widget title="Output">
          <div class="settings-row" title="Canvas size — re-converts for free">
            <label v-for="s in SIZES" :key="s" class="pill" :class="{active: size === s}">
              <input type="radio" :value="s" v-model="size">
              <span>{{ s }}</span>
            </label>
          </div>
          <div class="settings-row gen-row2" title="Palette size — re-converts for free">
            <label v-for="c in COLOR_COUNTS" :key="c" class="pill" :class="{active: maxColors === c}">
              <input type="radio" :value="c" v-model="maxColors">
              <span>{{ c }}c</span>
            </label>
          </div>
          <!-- Only in the one case where it matters: a photo's subject cannot
               survive 16 or 32 cells (measured in test_gemini). -->
          <p v-if="reference && size < 64" class="gen-note text-2xs text-muted">
            A photo holds up better at 64+
          </p>
        </Widget>

        <Widget title="Backdrop">
          <div class="settings-row">
            <label v-for="m in BG_MODES" :key="m.v" class="pill" :class="{active: bgMode === m.v}" :title="m.t">
              <input type="radio" :value="m.v" v-model="bgMode">
              <span>{{ m.l }}</span>
            </label>
          </div>
          <label class="gen-check" title="Crop to the subject so it uses the whole canvas, instead of keeping the model's margins">
            <input v-model="fillGrid" type="checkbox">
            <span class="text-xs">Crop to subject</span>
          </label>
        </Widget>

        <!-- Every paid generation, reopenable for free. Saved to the account. -->
        <Widget v-if="history.length" title="History">
          <div class="gen-hist">
            <div v-for="h in history" :key="h.id" class="gen-hist-item" :class="{active: h.id === historyId}">
              <button class="gen-hist-thumb" :title="h.prompt" :disabled="busy" @click="restoreFromHistory(h)">
                <img v-if="h.thumb" :src="h.thumb" :alt="h.prompt">
                <span v-else class="icon icon-auto-fix"/>
              </button>
              <button class="gen-hist-x" aria-label="Remove from history" title="Remove" @click="deleteFromHistory(h.id)">
                <span class="icon icon-close"/>
              </button>
            </div>
          </div>
          <p class="gen-note text-2xs text-muted">Reopening is free</p>
        </Widget>
      </div>
    </div>

    <!-- More tools -->
    <Widget title="More tools" class="tool-more">
      <ToolPaths exclude="ai"/>
    </Widget>

    <!-- SEO content -->
    <ToolReadme>
      <h1>AI Pixel Art Generator</h1>
      <p>Describe a sprite, get pixel art you can actually edit — a canvas of pixels with a real palette, not a picture of pixel art.</p>

      <h2>How to use it</h2>
      <ol>
        <li><strong>Describe the sprite</strong> — “a sleeping orange cat”, “a red health potion”, “a knight with a shield”. Pick a look: sprite, icon, character or scene, and a view.</li>
        <li><strong>Or start from a picture</strong> — attach a reference image (the 🖼 button in the prompt bar, or drop a file on it) and say what to change: “as a side-view walking sprite”. The subject, pose and colors carry over.</li>
        <li><strong>Generate</strong> — one credit-costing call to the image model, which draws a large, flat-colored picture of your subject.</li>
        <li><strong>Tune it, free</strong> — change the size (16–128), cap the palette (8/16/32), cut or keep the background, crop to the subject. Every change re-converts the same picture in your browser.</li>
        <li><strong>Open in Editor</strong> — the sprite lands on a canvas with layers, mirror drawing, animation frames and export.</li>
      </ol>

      <h2>Why the result is editable, not a screenshot</h2>
      <p>Image models can't draw a true 32×32 bitmap — they draw a big picture that <em>looks</em> like pixel art, with blended edges, hundreds of near-identical colors and a background baked in. This tool undoes that: it removes the background by flood-filling it away from the border inwards, crops to your subject, then resamples the picture one grid cell at a time, keeping the model's own flat colors. What you get is a real pixel grid with a small palette.</p>

      <h2>Features</h2>
      <ul>
        <li><strong>Text to sprite</strong> — prompt modifiers for style and view, plus an optional dark outline, so you don't have to write prompt incantations.</li>
        <li><strong>Reference image</strong> — attach a photo, drawing or existing sprite and have it redrawn as pixel art; it is downscaled in your browser before being sent.</li>
        <li><strong>Sizes 16×16 to 128×128</strong> — and switching size re-converts the same picture instead of charging again.</li>
        <li><strong>Palette cap</strong> — 8, 16 or 32 colors, chosen by how much area each color covers, so flat regions stay flat.</li>
        <li><strong>Background control</strong> — cut it to transparency, keep it as a color, or leave it untouched when the removal misjudges a subject.</li>
        <li><strong>See the original</strong> — compare the model's own picture with the pixel art built from it.</li>
        <li><strong>History</strong> — your recent generations are saved to your account; reopen any of them from any device and re-tune size, palette or backdrop without spending credits again.</li>
        <li><strong>Editor hand-off</strong> — draw, animate, export to PNG/SVG/JSON or a game spritesheet.</li>
      </ul>

      <QnA :items="faq"/>
    </ToolReadme>
  </div>
</template>

<style scoped>
/* Flat editor: preview + settings flush inside one frame (.flat-editor in
   main.css), split by 1px dividers — same as /convert and the slicer. */
.gen-grid {
  display: grid;
  gap: 0;
  grid-template-columns: 1fr;
  align-items: stretch;
}

@media (min-width: 768px) {
  .gen-grid {
    grid-template-columns: 1fr 232px;
  }
}

.gen-main {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-bottom: 1px solid var(--border);
}

@media (min-width: 768px) {
  .gen-main {
    border-bottom: 0;
    border-right: 1px solid var(--border);
  }
}

.gen-settings :deep(.widget + .widget) {
  border-top: 1px solid var(--border);
}

.preview-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: var(--space-4);
}

.gen-preview,
.gen-original {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

/* Square art in a square stage — fill it, and stay crisp doing so. */
.gen-preview { width: 100%; }

.gen-original {
  width: 100%;
  object-fit: contain;
}

.gen-preview {
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 18%, transparent) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
}

/* Re-converting takes ~150ms — dim rather than swap in a spinner. */
.gen-preview.busy { opacity: 0.55; }

.gen-original { border-radius: var(--radius-sm); }

/* A header control, not a panel control: .tm-seg defaults to a 34px box with
   13px labels and no horizontal padding, which swelled this header to 43px and
   left the two labels touching each other and the edges. */
.gen-viewseg {
  --tm-ctl: 24px;
  padding: 2px;
}

.gen-viewseg button {
  padding: 0 0.5rem;
  font-size: var(--text-2xs);
  letter-spacing: 0.02em;
}

.gen-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  color: var(--muted);
}

.gen-empty p { margin: 0; }

.gen-empty-icon {
  font-size: 40px;
  color: var(--primary);
  margin-bottom: var(--space-1);
}

/* ── Composer (chat-style, bottom of the work area) ───────────────── */
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

/* Square, and exactly as tall as the send button so the bar reads as one row
   (it was 30px against the button's 38px, centres 4px apart, with an icon that
   was bigger than the send icon on the smaller button). */
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

/* Same optical weight as the send button's icon. */
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

/* A picture is attached — the button carries that state, not just the chip. */
.gen-attach.active {
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, transparent);
}

.gen-attach:disabled { opacity: 0.4; cursor: not-allowed; }

.gen-file { display: none; }

.gen-composer {
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
  height: 2.375rem;               /* same as the attach and send buttons */
  border: 0;
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  padding: 0 var(--space-1);
}

/* The global textarea:focus rule paints a 3px primary ring — inside the
   composer that ring floats in the middle of the bar. The bar itself carries
   the focus signal (border-color on :focus-within), so the field stays bare. */
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

@media (max-width: 479px) {
  .gen-send-label { display: none; }   /* icon + price is enough on a phone */
}

.gen-hint {
  margin: 0;
  padding: 0 var(--space-4) var(--space-3);
  text-align: center;
}

.gen-actions {
  padding: var(--space-3);
  border-top: 1px solid var(--border);
}

.gen-prompt {
  width: 100%;
  resize: vertical;
}

.gen-cta {
  margin-top: var(--space-2);
  justify-content: center;
}

.gen-cost {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-2xs);
  opacity: 0.8;
}

.gen-cost .icon { width: 12px; height: 12px; }

.gen-note {
  display: block;
  margin: var(--space-2) 0 0;
  text-align: center;
}


.gen-note a { color: var(--primary); }

.gen-row2 { margin-top: var(--space-2); }

.gen-check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  cursor: pointer;
}

/* ── History (settings column): click a tile to reload it, free ───── */
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

/* Corner remove — revealed on hover where hover exists, always there on touch. */
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

/* Local copy of the tool-page pill (scoped in /convert and the slicer too). */
.pill {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  padding: 0.25rem 0.5rem;
  cursor: pointer;
  min-width: 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--foreground);
  border-radius: var(--radius-sm);
  transition: background var(--transition), color var(--transition), border-color var(--transition);
}

.pill input { display: none; }

.pill.active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
</style>
