<script setup lang="ts">
import {toast} from 'vue-sonner'
import {cloneDeep, generateUUID} from '~/helper/utils'
import {rgbToHex} from '~/helper/color'
import {reconstructPixels} from '~/helper/pixel-reconstruct'
import {DEFAULT_EDITOR_DATA} from '~/helper/constants'
import type {EditorData} from '~/types'

// Text prompt → pixel art board. The backend returns a large "pixel-art
// style" PNG (1 paid generation each time); this component downsamples +
// median-cut quantizes it to a true N×N grid — the same pipeline as the
// /convert page — and drops the result onto the canvas as a new board.
const open = defineModel<boolean>('open', {default: false})
const props = defineProps<{ seed?: string }>()
const emit = defineEmits<{ added: [] }>()
const store = useEditor()
const auth = useAuthStore()
const config = useRuntimeConfig()
const requestURL = useRequestURL()

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

const prompt = ref('')
const size = ref(32)
const style = ref('sprite')
const view = ref('auto')
const outline = ref(false)
const maxColors = ref(16)
const transparentBg = ref(true)

// A scene fills the frame — keeping its "background" makes more sense.
watch(style, (v) => { transparentBg.value = v !== 'scene' })

const busy = ref(false)
const claiming = ref(false)
const summary = ref<{ enabled: boolean; cost: number; balance: number; dailyClaimed: boolean; dailyGrant: number } | null>(null)
const resultUrl = ref('')          // raw model output (spent tokens on this)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const grid = ref<number[][]>([])   // indexed pixels of the converted result
const palette = ref<string[]>([])

// Not enough credits for one generation — the form yields to the earn path.
const broke = computed(() =>
    auth.isLogged && !!summary.value?.enabled && summary.value.balance < summary.value.cost)

watch(open, (v) => {
  if (v) {
    // Prefill from the Home hand-off — never overwrite what the user typed.
    if (props.seed && !prompt.value) prompt.value = props.seed
    loadSummary()
  } else { resultUrl.value = ''; grid.value = []; palette.value = [] }
})

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

// Instant top-up inside the modal — the daily bonus is the fastest earn.
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

// ── Convert: big PNG → indexed N×N grid ─────────────────────────────
// Contain-fit onto a white working canvas, then two-stage reconstruct
// (label vote → color recovery) — crisp region edges instead of the mushy
// averages a plain downscale produces on "fake pixel" AI output.
function prepareSource(img: HTMLImageElement, n: number): ImageData {
  const cell = Math.max(4, Math.floor(512 / n))
  const w = n * cell, h = n * cell
  const tmp = document.createElement('canvas')
  tmp.width = w; tmp.height = h
  const ctx = tmp.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const ir = img.width / img.height
  let dw = w, dh = h, dx = 0, dy = 0
  if (ir > 1) { dh = w / ir; dy = (h - dh) / 2 }
  else if (ir < 1) { dw = h * ir; dx = (w - dw) / 2 }
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, dx, dy, dw, dh)
  return ctx.getImageData(0, 0, w, h)
}

// The model puts the sprite on a plain ground — the corner-majority color.
// With "Transparent background" on, those pixels stay unset in the editor.
function bgIndex(indexed: number[][]): number {
  const n = size.value - 1
  const corners = [indexed[0]![0]!, indexed[0]![n]!, indexed[n]![0]!, indexed[n]![n]!]
  const counts = new Map<number, number>()
  for (const c of corners) counts.set(c, (counts.get(c) || 0) + 1)
  let best = corners[0]!, bestN = 0
  counts.forEach((v, k) => { if (v > bestN) { bestN = v; best = k } })
  return bestN >= 3 ? best : -1   // ambiguous corners → keep everything
}

function convertResult() {
  if (!resultUrl.value) return
  const img = new Image()
  img.onload = () => {
    const q = reconstructPixels(prepareSource(img, size.value), size.value, size.value, maxColors.value)
    grid.value = q.indexed
    palette.value = q.palette.map(c => rgbToHex(c[0], c[1], c[2]).toUpperCase())
    nextTick(drawPreview)
  }
  img.src = resultUrl.value
}

watch([transparentBg, maxColors], () => { if (resultUrl.value) convertResult() })

function drawPreview() {
  const cv = previewCanvas.value
  if (!cv || !grid.value.length) return
  const n = size.value
  const scale = Math.max(1, Math.floor(256 / n))
  cv.width = n * scale; cv.height = n * scale
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, cv.width, cv.height)
  const skip = transparentBg.value ? bgIndex(grid.value) : -1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const idx = grid.value[y]![x]!
      if (idx === skip) continue
      ctx.fillStyle = palette.value[idx]!
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}

// ── Generate + add ──────────────────────────────────────────────────
async function generate() {
  if (busy.value || prompt.value.trim().length < 3) return
  busy.value = true
  try {
    const res = await useNativeFetch<{ image: string; balance: number }>(
        '/coloring/economy/gen-image/',
        {method: 'POST', body: {
          prompt: prompt.value.trim(), size: size.value,
          style: style.value, view: view.value, outline: outline.value,
        }},
    )
    resultUrl.value = res.image
    if (summary.value) summary.value.balance = res.balance
    convertResult()
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) {
      toast.error('Not enough credits — earn some in Missions')
      await loadSummary()   // flip the form into the earn path
    } else if (s === 429) toast.error('Too many generations — take a short break')
    else toast.error('Generation failed — your credits were refunded')
  } finally {
    busy.value = false
  }
}

function addToCanvas() {
  if (!grid.value.length) return
  const skip = transparentBg.value ? bgIndex(grid.value) : -1
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
  const data: EditorData = {
    ...cloneDeep(DEFAULT_EDITOR_DATA),
    id: generateUUID(),
    name: prompt.value.trim().slice(0, 60),
    width: size.value, height: size.value,
    colors,
    layers: [{name: 'Layer 1', pixels, x: 0, y: 0}],
    updated: new Date().toISOString(),
  } as EditorData
  store.addBoardWithData(data)
  open.value = false
  emit('added')
  toast.success('Added to canvas')
}
</script>

<template>
  <UiModal
      v-if="open"
      title="Generate with AI"
      :sub="resultUrl ? 'Tune the conversion, or add it to your canvas.' : 'Describe a sprite — you get it as an editable pixel art board.'"
      width="26rem"
      class="aig-modal"
      @close="open = false"
  >
    <!-- Guest: generation spends credits, which need an account. -->
    <div v-if="!auth.isLogged" class="aig-empty">
      <span class="icon icon-auto-fix aig-empty-icon"/>
      <p class="text-xs text-muted">
        Sign in to generate — new accounts start earning free credits right away.
      </p>
      <a :href="googleAuthUrl" class="btn primary aig-btn"><span class="icon icon-user"/><span>Sign in with Google</span></a>
    </div>
    <div v-else-if="summary && !summary.enabled" class="aig-empty">
      <p class="text-xs text-muted">AI generation isn't available right now — check back soon.</p>
    </div>

    <template v-else>
      <div class="aig-form">
        <textarea
            v-model="prompt"
            class="publish-input publish-textarea"
            rows="2"
            maxlength="300"
            placeholder="A sleeping orange cat curled up…"
            :disabled="busy"
        />
        <div class="aig-row">
          <span class="aig-label">Style</span>
          <div class="tm-seg aig-seg">
            <button v-for="s in STYLES" :key="s.v" :class="{active: style === s.v}" :disabled="busy" @click="style = s.v">{{ s.l }}</button>
          </div>
        </div>
        <div class="aig-row">
          <span class="aig-label">View</span>
          <div class="tm-seg aig-seg">
            <button v-for="s in VIEWS" :key="s.v" :class="{active: view === s.v}" :disabled="busy" @click="view = s.v">{{ s.l }}</button>
          </div>
        </div>
        <div class="aig-row">
          <span class="aig-label">Size</span>
          <div class="tm-seg aig-seg">
            <button v-for="s in SIZES" :key="s" :class="{active: size === s}" :disabled="busy" @click="size = s">{{ s }}</button>
          </div>
        </div>
        <label class="aig-check">
          <input v-model="outline" type="checkbox" :disabled="busy">
          <span class="text-xs">Dark outline around the subject</span>
        </label>

        <div v-if="resultUrl" class="aig-preview-wrap">
          <canvas ref="previewCanvas" class="aig-preview pixelated"/>
          <div class="aig-row">
            <span class="aig-label">Colors</span>
            <div class="tm-seg aig-seg">
              <button v-for="c in COLOR_COUNTS" :key="c" :class="{active: maxColors === c}" @click="maxColors = c">{{ c }}</button>
            </div>
          </div>
          <label class="aig-check">
            <input v-model="transparentBg" type="checkbox">
            <span class="text-xs">Transparent background</span>
          </label>
        </div>

        <!-- Not enough credits: the earn path replaces the generate button. -->
        <div v-if="broke && !resultUrl" class="aig-broke">
          <p class="text-xs">
            Generating costs <strong>🪙{{ summary!.cost }}</strong> — you have <strong>🪙{{ summary!.balance }}</strong>.
          </p>
          <button
              v-if="!summary!.dailyClaimed && summary!.dailyGrant > 0"
              class="btn aig-btn"
              :disabled="claiming"
              @click="claimDaily"
          >
            <span class="icon icon-gift"/>
            <span>{{ claiming ? 'Claiming…' : `Claim daily bonus 🪙${summary!.dailyGrant}` }}</span>
          </button>
          <nuxt-link to="/missions" class="btn primary aig-btn" @click="open = false">
            <span class="icon icon-coin"/><span>Earn credits in Missions</span>
          </nuxt-link>
        </div>

        <div v-else class="aig-actions">
          <button
              v-if="resultUrl"
              class="btn aig-btn"
              :disabled="busy || broke"
              :title="`Costs another 🪙${summary?.cost ?? ''}`"
              @click="generate"
          >
            <span class="icon icon-refresh"/>
            <span>{{ busy ? 'Generating…' : `Try again` }}</span>
            <span class="aig-cost"><span class="icon icon-coin"/>{{ summary?.cost }}</span>
          </button>
          <button v-if="resultUrl" class="btn primary aig-btn" :disabled="busy" @click="addToCanvas">
            <span class="icon icon-plus"/><span>Add to canvas</span>
          </button>
          <button
              v-else
              class="btn primary wide aig-btn"
              :disabled="busy || prompt.trim().length < 3"
              @click="generate"
          >
            <span class="icon icon-auto-fix"/>
            <span>{{ busy ? 'Generating…' : 'Generate' }}</span>
            <span class="aig-cost"><span class="icon icon-coin"/>{{ summary?.cost }}</span>
          </button>
        </div>

        <p v-if="summary" class="aig-balance text-2xs text-muted">
          Balance: 🪙{{ summary.balance }}
          <template v-if="broke && resultUrl">
            — <nuxt-link to="/missions" @click="open = false">earn more in Missions</nuxt-link>
          </template>
        </p>
      </div>
    </template>
  </UiModal>
</template>

<style scoped>
.aig-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.aig-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.aig-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  min-width: 44px;
}

.aig-seg { flex: 1; }

.aig-preview-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}

.aig-preview {
  max-width: 256px;
  max-height: 256px;
  width: 100%;
  height: auto;
  background:
      repeating-conic-gradient(color-mix(in oklab, var(--muted) 18%, transparent) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
}

.aig-check {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  align-self: flex-start;
}

.aig-actions {
  display: flex;
  gap: var(--space-2);
}

.aig-btn {
  flex: 1;
  justify-content: center;
  white-space: nowrap;
}

.aig-cost {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--text-2xs);
  opacity: 0.8;
}

.aig-cost .icon { width: 12px; height: 12px; }

.aig-balance { text-align: center; }
.aig-balance a { color: var(--primary); }

.aig-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) 0 var(--space-2);
  text-align: center;
}

.aig-empty-icon {
  width: 28px;
  height: 28px;
  color: var(--primary);
}

/* Not-enough-credits panel — the earn path, front and center. */
.aig-broke {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  background: color-mix(in oklab, var(--primary) 6%, transparent);
  text-align: center;
}

.aig-broke p { margin: 0 0 2px; }
</style>
