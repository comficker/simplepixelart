<script setup lang="ts">
import {toast} from 'vue-sonner'
import {aiImageToGrid} from '~/helper/pixel'
import {drawThumbnail} from '~/helper/canvas'
import {rgbToHex} from '~/helper/color'

const store = useEditor()
const auth = useAuthStore()
const {turns, busy} = useAgentPanel()

const draft = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const cost = ref<{ chat: number; redraw: number } | null>(null)
const {setBalance} = useCredits()

const editorData = computed(() => store.editorData)

async function loadCost() {
  try {
    const sum = await useNativeFetch<any>('/coloring/economy/')
    cost.value = {
      chat: sum.actions?.gen_meta ?? 1,
      redraw: sum.actions?.gen_image ?? 60,
    }
    setBalance(sum.balance)
  } catch { cost.value = null }
}

onMounted(() => { if (auth.isLogged) loadCost() })

function artDataUrl(): string {
  const cv = document.createElement('canvas')
  cv.width = Math.max(1, editorData.value.width)
  cv.height = Math.max(1, editorData.value.height)
  drawThumbnail(cv, editorData.value, 1)
  return cv.toDataURL('image/png')
}

// Grow with the text up to a few lines, then scroll inside — a chat box that
// pushes the conversation off screen is worse than one that scrolls.
function grow() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

async function scrollDown() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function send() {
  const message = draft.value.trim()
  if (!message || busy.value) return
  if (!auth.isLogged) { toast.error('Sign in to use the agent'); return }
  draft.value = ''
  await nextTick()
  grow()
  turns.value = [...turns.value, {role: 'user', text: message}]
  busy.value = true
  await scrollDown()
  try {
    const res = await useNativeFetch<{
      reply: string; action: 'ops' | 'redraw' | 'none'
      ops: any[]; redraw_prompt: string; balance: number
    }>('/coloring/economy/agent/', {
      method: 'POST',
      body: {
        message,
        image: artDataUrl(),
        width: editorData.value.width,
        height: editorData.value.height,
        colors: editorData.value.colors,
        // Enough for the agent to follow the thread without paying to resend
        // the whole conversation every turn.
        history: turns.value.slice(-6).map(t => ({role: t.role, text: t.text})),
      },
    })
    setBalance(res.balance)

    if (res.action === 'ops' && res.ops?.length) {
      // Mechanical edits are exact and undoable, so they land straight away —
      // asking first would just add a click to "make the helmet red".
      const {applied, pixels} = store.applyAgentOps(res.ops)
      turns.value = [...turns.value, {
        role: 'agent',
        text: res.reply,
        done: applied
            ? `${describe(res.ops)}${pixels ? ` (${pixels} pixels)` : ''} — undo with ${modKey()}Z`
            : 'Nothing changed.',
      }]
      // No success toast: the turn itself says what happened, and the toast
      // stack sits bottom-right, right on top of this panel's composer.
      if (!applied) toast.error('That change did not apply')
    } else if (res.action === 'redraw') {
      turns.value = [...turns.value, {
        role: 'agent', text: res.reply, redrawPrompt: res.redraw_prompt || message,
      }]
    } else {
      turns.value = [...turns.value, {role: 'agent', text: res.reply}]
    }
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error('Not enough credits — earn some in Missions')
    else if (s === 401) toast.error('Sign in to use the agent')
    else if (s === 503) toast.error('The agent is offline right now')
    else toast.error('The agent could not answer — try again')
    // Roll back the turn we added optimistically, and hand the words back
    // rather than making the user retype them.
    turns.value = turns.value.slice(0, -1)
    draft.value = message
    await nextTick()
    grow()
  } finally {
    busy.value = false
    await scrollDown()
  }
}

function describe(ops: any[]): string {
  const names: Record<string, string> = {
    replace_color: 'Recoloured',
    remove_color: 'Removed a colour',
    add_outline: 'Outlined',
    flip: 'Flipped',
  }
  return ops.map(o => names[o.op] || o.op).join(', ')
}

function modKey(): string {
  return import.meta.client && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'
}

/** Turn the model's picture into the grid the board will receive.
 *
 * The first version of this drew the 1024px render into a W×H canvas with
 * smoothing off, which keeps one source pixel per ~64x64 block and discards
 * the rest — the result looked nothing like what the user had approved. This
 * goes through aiImageToGrid instead, the same reconstruction the image
 * importer uses: a colour histogram per destination cell picks the dominant
 * colour, the flat background is peeled off, and the subject is cropped.
 *
 * That pipeline is square-only, so for a non-square board we reconstruct at
 * max(W, H) and place the drawn subject in the middle of the board. */
async function imageToBoardGrid(dataUrl: string, W: number, H: number) {
  const side = Math.max(W, H)
  let q = await aiImageToGrid(dataUrl, side, 64, {removeGround: true, fillGrid: true})
  if (q) q.indexed = dropFlatGround(q.indexed, q.palette)
  let box = q && paintedBox(q.indexed)
  // The subject is fit to the square, so on a tall or wide board it can come
  // back too big for the board. Reconstruct one size down rather than cropping
  // the sprite's arms off.
  if (q && box && (box.w > W || box.h > H)) {
    const smaller = Math.max(8, Math.floor(side * Math.min(W / box.w, H / box.h)))
    if (smaller < side) {
      const retry = await aiImageToGrid(dataUrl, smaller, 64, {removeGround: true, fillGrid: true})
      if (retry) retry.indexed = dropFlatGround(retry.indexed, retry.palette)
      const retryBox = retry && paintedBox(retry.indexed)
      if (retry && retryBox) { q = retry; box = retryBox }
    }
  }
  if (!q || !box) return null
  return cutGrid(q, box, W, H)
}

/** The model's own grid, at the size it actually drew.
 *
 * The board-fit version has to answer "what fits in 32x32". This one asks the
 * reconstruction to detect the render's own pixel pitch instead, so a sprite
 * the model drew at 48 across stays 48 across on a board of its own. */
async function imageToNativeGrid(dataUrl: string) {
  const q = await aiImageToGrid(dataUrl, 'auto', 64, {removeGround: true, fillGrid: true})
  if (!q) return null
  q.indexed = dropFlatGround(q.indexed, q.palette)
  const box = paintedBox(q.indexed)
  if (!box) return null
  // The board is the art's own extent — no margin, nothing to centre in.
  return cutGrid(q, box, box.w, box.h)
}

/** Lift the drawn area out of a reconstruction and centre it on a W×H board. */
function cutGrid(
    q: { palette: [number, number, number][]; indexed: number[][] },
    box: { x: number; y: number; w: number; h: number },
    W: number, H: number,
) {
  // Clip only if the drawing still overflows the board.
  const cw = Math.min(box.w, W), ch = Math.min(box.h, H)
  const srcX = box.x + Math.floor((box.w - cw) / 2)
  const srcY = box.y + Math.floor((box.h - ch) / 2)
  const dstX = Math.floor((W - cw) / 2), dstY = Math.floor((H - ch) / 2)

  const pixels: Record<string, number> = {}
  const remap = new Map<number, number>()
  const colors: string[] = []
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      // Index 0 is the peeled background: leave those cells empty so the
      // sprite arrives with transparency, not a slab of colour behind it.
      const idx = q.indexed[srcY + y]?.[srcX + x] ?? 0
      if (!idx) continue
      let mapped = remap.get(idx)
      if (mapped === undefined) {
        const c = q.palette[idx]!
        mapped = colors.length
        colors.push(rgbToHex(c[0], c[1], c[2]).toUpperCase())
        remap.set(idx, mapped)
      }
      pixels[`${dstX + x}_${dstY + y}`] = mapped
    }
  }
  if (!colors.length) return null
  return {colors, pixels, w: W, h: H}
}

/** Second pass at the flat ground the prompt asked the model for.
 *
 * peelGround floods in from the border and gives up when the border ring is
 * not one colour, which a render with any noise in its background is not — the
 * board then arrives with a slab of beige behind the sprite.
 *
 * The four corners of the drawn area are the most reliable sample of that
 * background: a sprite reaches the edge of its frame often, all four corners
 * rarely. Agreeing corners identify the colour; the generator prompt then
 * guarantees it "appears NOWHERE inside" the subject, so every cell of it can
 * go — enclosed ones included, like the inside of a coil or the gap under a
 * raised arm, which a flood from outside can never reach. */
function dropFlatGround(indexed: number[][], palette: [number, number, number][]) {
  // Read the corners of what was drawn: the reconstruction leaves a margin,
  // so the grid's own corners are empty by construction.
  const box = paintedBox(indexed)
  if (!box || box.w < 4 || box.h < 4) return indexed
  const corners: [number, number, number][] = []
  const {x, y, w, h} = box
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
    const c = palette[indexed[cy!]?.[cx!] ?? 0]
    if (indexed[cy!]?.[cx!] && c) corners.push(c)
  }
  if (corners.length < 3) return indexed

  // The ground is what at least three corners agree on, to within the drift
  // a noisy render puts into one flat colour.
  const TOL = 24
  const agrees = (a: [number, number, number], b: [number, number, number]) =>
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 < TOL ** 2
  const ground = corners.find(c => corners.filter(o => agrees(c, o)).length >= 3)
  if (!ground) return indexed

  const drop = new Set<number>()
  for (let i = 1; i < palette.length; i++) {
    const c = palette[i]
    if (c && agrees(c, ground)) drop.add(i)
  }
  if (!drop.size) return indexed
  return indexed.map(row => row.map(i => (drop.has(i) ? 0 : i)))
}

/** Bounding box of the cells that actually got a colour. */
function paintedBox(indexed: number[][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (let y = 0; y < indexed.length; y++) {
    const row = indexed[y]!
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  return {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1}
}

/** Quantise a proposal against the board it would land on. */
function toBoardGrid(dataUrl: string) {
  return imageToBoardGrid(dataUrl, editorData.value.width, editorData.value.height)
}

/** Draw a grid into a canvas at 1px per pixel; CSS scales it up, crisply. */
function paintPreview(el: HTMLCanvasElement | null, grid: AgentGrid | undefined) {
  if (!el || !grid) return
  const {colors, pixels, w, h} = grid
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  for (const key of Object.keys(pixels)) {
    const [x, y] = key.split('_').map(Number)
    ctx.fillStyle = colors[pixels[key]!] || '#000'
    ctx.fillRect(x!, y!, 1, 1)
  }
}

/** The expensive path: only after the user says yes to a redraw. */
async function redraw(turn: any) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await useNativeFetch<{ image: string; balance: number }>(
        '/coloring/economy/gen-image/', {
          method: 'POST',
          body: {
            prompt: turn.redrawPrompt,
            // Both dimensions: the board is not always square, and asking for
            // "32x32" for a 32x48 board came back as a square that then had to
            // be squashed into place.
            size: editorData.value.width,
            height: editorData.value.height,
            colors: editorData.value.colors.length || 16,
            reference: artDataUrl(),
            reference_kind: 'art',
          },
        })
    // Convert now, not at apply time: the model returns a smooth 1024px
    // picture, the board gets a WxH pixel grid, and showing the first while
    // delivering the second is how "it looked different" happens.
    const grid = await toBoardGrid(res.image)
    const origGrid = await imageToNativeGrid(res.image)
    turn.image = res.image
    turn.grid = grid ?? undefined
    turn.origGrid = origGrid ?? undefined
    turn.redrawPrompt = undefined
    setBalance(res.balance)
    if (!grid) toast.error('Could not read that result')
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error('Not enough credits for a redraw')
    else toast.error('The redraw failed')
  } finally {
    busy.value = false
    await scrollDown()
  }
}

async function apply(turn: AgentTurn, grid: AgentGrid | undefined, asNewBoard: boolean) {
  if (!grid) return
  busy.value = true
  try {
    const {colors, pixels, w, h} = grid
    store.applyAgentArt(colors, pixels, w, h, asNewBoard)
    turn.done = asNewBoard
        ? `Opened as a new ${w}×${h} board.`
        : `Applied — undo with ${modKey()}Z`
    turn.image = undefined
    turn.grid = undefined
    turn.origGrid = undefined
    turns.value = [...turns.value]
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="agent">
    <div ref="listEl" class="agent-log no-scrollbar">
      <div class="agent-stack">
        <div v-if="!turns.length" class="agent-intro">
          <p class="text-sm">Tell the agent what to change</p>
          <ul class="agent-hints text-xs text-muted">
            <li>“knock out the background”</li>
            <li>“make the helmet red”</li>
            <li>“outline it in black”</li>
            <li>“give him a wizard hat”</li>
          </ul>
          <p class="text-2xs text-muted">
            Exact changes apply straight away and undo in one step. Anything
            needing new art asks first — that one costs a generation.
          </p>
        </div>

        <div v-for="(t, i) in turns" :key="i" class="agent-turn" :class="t.role">
          <p class="agent-text">{{ t.text }}</p>

          <div v-if="t.redrawPrompt" class="settings-row">
            <button class="btn primary" :disabled="busy" @click="redraw(t)">
              <span class="icon icon-auto-fix"/>
              <span>Redraw{{ cost ? ` — ${cost.redraw}` : '' }}</span>
            </button>
            <button class="btn" :disabled="busy" @click="t.redrawPrompt = undefined">No thanks</button>
          </div>

          <template v-if="t.grid">
            <div class="agent-proposal">
              <figure v-if="t.image">
                <img :src="t.image" alt="" class="agent-render"/>
                <figcaption class="text-2xs text-muted">What the model drew</figcaption>
              </figure>
              <figure>
                <canvas
                    :ref="el => paintPreview(el as HTMLCanvasElement, t.grid)"
                    class="agent-preview pixelated"
                />
                <figcaption class="text-2xs text-muted">
                  {{ t.grid.w }}×{{ t.grid.h }} · {{ t.grid.colors.length }} colours — exactly what this board gets
                </figcaption>
              </figure>
            </div>
            <div class="settings-row">
              <button class="btn primary" :disabled="busy" @click="apply(t, t.grid, false)">
                Apply to this board
              </button>
              <button class="btn" :disabled="busy" @click="apply(t, t.grid, true)">
                New board · {{ t.grid.w }}×{{ t.grid.h }}
              </button>
              <!-- The model's own size, kept as a separate board so the
                   detail it drew is not lost to this board's dimensions. -->
              <button
                  v-if="t.origGrid && (t.origGrid.w !== t.grid.w || t.origGrid.h !== t.grid.h)"
                  class="btn"
                  :disabled="busy"
                  @click="apply(t, t.origGrid, true)"
              >
                New board · {{ t.origGrid.w }}×{{ t.origGrid.h }} original
              </button>
            </div>
          </template>

          <p v-if="t.done" class="agent-done text-2xs">{{ t.done }}</p>
        </div>

        <p v-if="busy" class="agent-text text-sm text-muted">Thinking…</p>
      </div>
    </div>

    <form class="agent-composer" @submit.prevent="send">
      <textarea
          ref="inputEl"
          v-model="draft"
          rows="1"
          maxlength="300"
          :placeholder="auth.isLogged ? 'What should change?' : 'Sign in to use the agent'"
          :disabled="busy || !auth.isLogged"
          @input="grow"
          @keydown.enter.exact.prevent="send"
      />
      <button
          class="btn primary tm-iconbtn"
          type="submit"
          :disabled="busy || !auth.isLogged || draft.trim().length < 2"
          :title="cost ? `Costs ${cost.chat} credit` : 'Send'"
          aria-label="Send"
      >
        <span class="icon icon-angle-right"/>
      </button>
    </form>
  </div>
</template>

<style scoped>
/* The agent is the rail card's body, not a card of its own — the tab in
   .readme-head is its heading. Shape of a chat: a log that scrolls with the
   newest turn at the bottom, and a composer pinned under it, so nothing shifts
   as turns arrive. */
.agent {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.agent-log {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-3);
}

/* Grows from the bottom: with one turn the conversation sits above the
   composer instead of floating at the top of an empty column. */
.agent-stack {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: var(--space-3);
  min-height: 100%;
}

.agent-intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.agent-hints {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  list-style: none;
}

.agent-turn {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.agent-turn.user .agent-text {
  color: var(--foreground);
  font-weight: 600;
}

.agent-turn.agent .agent-text {
  color: var(--muted);
}

/* Two-up: what the model drew, and what this board would get. Side by side is
   the whole point — that difference is what surprised people at apply time.
   Flex rather than two fixed columns so a lone figure still fills the rail. */
.agent-proposal {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
}

.agent-proposal figure {
  display: flex;
  flex: 1 1 0;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

.agent-render,
.agent-preview {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.agent-preview {
  image-rendering: pixelated;
}

.agent-done {
  color: var(--success);
}

/* An island sitting on the bottom edge of the panel, like the tilemap
   editor's floating controls. */
.agent-composer {
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  gap: var(--space-2);
  margin: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--surface) 94%, transparent);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.agent-composer textarea {
  flex: 1 1 auto;
  min-width: 0;
  /* The island is the frame; a second border inside it reads as a box in a box. */
  border: 0;
  border-radius: 0;
  padding: 0;
  background: transparent;
  resize: none;
  overflow-y: auto;
  max-height: 120px;
  font-family: inherit;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--foreground);
}

/* main.css gives every textarea a focus ring; here the island shows focus, so
   the field itself stays flat. */
.agent-composer textarea:focus,
.agent-composer textarea:focus-visible {
  outline: none;
  border-color: transparent;
  box-shadow: none;
}

/* Focus belongs to the island now that the field itself has no edge. */
.agent-composer:focus-within {
  border-color: color-mix(in oklab, var(--primary) 55%, var(--border));
}
</style>
