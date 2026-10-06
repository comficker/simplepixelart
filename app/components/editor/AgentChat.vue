<script setup lang="ts">
import {defineComponent, h, type PropType} from 'vue'
import {toast} from 'vue-sonner'
import {fitRedrawToBoard, imageToNativeGrid} from '~/helper/pixel/agentFit'
import {drawThumbnail, layers2MapNumbers} from '~/helper/canvas'

const {t} = useI18n()
const store = useEditor()
const auth = useAuthStore()
const {turns, busy, close} = useAgentPanel()

const draft = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
// Prices come from the server's config and are tuned there without a deploy;
// null until it has said, rather than a number baked in here that goes stale.
const cost = ref<{ chat: number | null; redraw: number | null } | null>(null)
const {setBalance} = useCredits()

const editorData = computed(() => store.editorData)

async function loadCost() {
  try {
    const sum = await useNativeFetch<any>('/coloring/economy/')
    const price = (code: string) =>
        typeof sum.actions?.[code] === 'number' ? sum.actions[code] : null
    cost.value = {chat: price('gen_meta'), redraw: price('gen_image')}
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
  if (!auth.isLogged) { toast.error(t('c_AgentChat.signInToUseTheAgent')); return }
  draft.value = ''
  await nextTick()
  grow()
  turns.value = [...turns.value, {role: 'user', text: message}]
  busy.value = true
  await scrollDown()
  try {
    const res = await useNativeFetch<{
      reply: string; action: 'ops' | 'redraw' | 'animate' | 'none'
      ops: any[]; redraw_prompt: string; frames?: string[]; fps?: number
      balance: number
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
        done: applied ? withUndoHint(pixels
                ? t('c_AgentChat.doneWithPixels', {what: describe(res.ops), count: pixels}, pixels)
                : describe(res.ops))
            : t('c_AgentChat.nothingChanged'),
        undoable: applied > 0,
      }]
      // On a phone the sheet covers the art it just changed, so step aside and
      // put the undo where the user is looking instead.
      if (applied && touch.value) {
        close()
        toast.success(describe(res.ops), {action: {label: t('common.undo'), onClick: undoLast}})
      }
      // No success toast on desktop: the turn itself says what happened, and
      // the toast stack sits bottom-right, on top of this panel's composer.
      if (!applied) toast.error(t('c_AgentChat.thatChangeDidNotApply'))
    } else if (res.action === 'redraw') {
      turns.value = [...turns.value, {
        role: 'agent', text: res.reply, redrawPrompt: res.redraw_prompt || message,
      }]
    } else if (res.action === 'animate' && (res.frames?.length ?? 0) >= 2) {
      // A plan, not frames: each non-"base" entry is a paid generation, so
      // nothing is drawn until the user has seen the list and the price.
      turns.value = [...turns.value, {
        role: 'agent', text: res.reply,
        animatePlan: {frames: res.frames!, fps: res.fps || 8},
      }]
    } else {
      turns.value = [...turns.value, {role: 'agent', text: res.reply}]
    }
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error(t('c_AgentChat.notEnoughCredits'))
    else if (s === 401) toast.error(t('c_AgentChat.signInToUseTheAgent'))
    else if (s === 503) toast.error(t('c_AgentChat.agentOffline'))
    else toast.error(t('c_AgentChat.agentCouldNotAnswer'))
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
    replace_color: t('c_AgentChat.opRecoloured'),
    remove_color: t('c_AgentChat.opRemovedAColour'),
    add_outline: t('c_AgentChat.opOutlined'),
    flip: t('c_AgentChat.opFlipped'),
  }
  return ops.map(o => names[o.op] || o.op).join(', ')
}

/** "<text> — undo with ⌘Z" on desktop; touch gets an Undo button instead. */
function withUndoHint(text: string): string {
  return touch.value ? text : t('c_AgentChat.undoWith', {text, key: `${modKey()}Z`})
}

function modKey(): string {
  return import.meta.client && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+'
}

// A keyboard shortcut is not an affordance on a touch device, so the hint
// becomes a button there — and the sheet gets out of the way so the change it
// is talking about is visible.
const touch = ref(false)

// The on-screen keyboard is drawn over fixed elements, so the composer — which
// is pinned to the bottom of the sheet — would end up under it. visualViewport
// is the only thing that reports how much is covered; lift the sheet by that
// much and let it shrink to fit what is left. A no-op on desktop, where the
// two viewports agree and the inset stays 0.
function syncKeyboardInset() {
  const vv = window.visualViewport
  if (!vv) return
  const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
  document.documentElement.style.setProperty('--agent-kb', `${Math.round(covered)}px`)
}

onMounted(() => {
  try { touch.value = window.matchMedia('(pointer: coarse)').matches } catch { /* older browsers */ }
  window.visualViewport?.addEventListener('resize', syncKeyboardInset)
  window.visualViewport?.addEventListener('scroll', syncKeyboardInset)
  syncKeyboardInset()
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', syncKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', syncKeyboardInset)
  document.documentElement.style.removeProperty('--agent-kb')
})

function undoLast() {
  store.undo()
}

/** The art as the board shows it right now — flattened across layers with
 * their offsets applied, in the board's own palette. This is what a redraw is
 * held to (position, scale, colours) and what a "base" animation frame is. */
function boardGrid(): AgentGrid | null {
  const ed = editorData.value
  const pixels = layers2MapNumbers(ed)
  if (!Object.keys(pixels).length) return null
  return {colors: [...ed.colors], pixels, w: ed.width, h: ed.height}
}

/** Quantise a proposal against the board it would land on — and, when the
 * board has art (a redraw is almost always an edit of it), against that art:
 * fitRedrawToBoard matches its scale, snaps to its palette and aligns to its
 * position, instead of re-centring a re-quantised sprite that then landed a
 * few pixels off everything the user had. */
function toBoardGrid(dataUrl: string) {
  return fitRedrawToBoard(dataUrl, editorData.value.width, editorData.value.height, boardGrid())
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
    if (!grid) toast.error(t('c_AgentChat.couldNotReadResult'))
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error(t('c_AgentChat.notEnoughCreditsRedraw'))
    else toast.error(t('c_AgentChat.redrawFailed'))
  } finally {
    busy.value = false
    await scrollDown()
  }
}

// Which frame is being drawn right now, for the progress line under the log.
const animStep = ref<{ n: number; total: number } | null>(null)

function paidFrames(plan: { frames: string[] }): number {
  return plan.frames.filter(f => f !== 'base').length
}

/** The expensive path for an animation: one gen-image per non-"base" frame.
 *
 * Every frame is generated from the SAME reference — the art as it is now —
 * and fitted against it, so the frames agree with each other instead of each
 * drifting its own way; frame-to-frame drift is exactly what reads as jitter
 * on playback. "base" frames are the art itself and cost nothing. */
async function animate(turn: AgentTurn) {
  if (busy.value || !turn.animatePlan) return
  if (!auth.isLogged) { toast.error(t('c_AgentChat.signInToUseTheAgent')); return }
  busy.value = true
  const plan = turn.animatePlan
  const base = boardGrid()
  const reference = artDataUrl()
  const grids: AgentGrid[] = []
  const keep = () => {
    // Keep whatever already succeeded if it still plays as an animation —
    // those frames are paid for.
    if (grids.length >= 2) {
      turn.frames = grids
      turn.fps = plan.fps
      turn.baseFirst = plan.frames[0] === 'base'
      turn.animatePlan = undefined
      turns.value = [...turns.value]
      return true
    }
    return false
  }
  try {
    for (let i = 0; i < plan.frames.length; i++) {
      const instruction = plan.frames[i]!
      if (instruction === 'base') {
        if (base) grids.push(base)
        continue
      }
      animStep.value = {n: i + 1, total: plan.frames.length}
      await scrollDown()
      const res = await useNativeFetch<{ image: string; balance: number }>(
          '/coloring/economy/gen-image/', {
            method: 'POST',
            body: {
              prompt: instruction,
              size: editorData.value.width,
              height: editorData.value.height,
              colors: editorData.value.colors.length || 16,
              reference,
              reference_kind: 'art',
            },
          })
      setBalance(res.balance)
      const grid = await fitRedrawToBoard(
          res.image, editorData.value.width, editorData.value.height, base)
      if (grid) grids.push(grid)
    }
    if (!keep()) toast.error(t('c_AgentChat.couldNotReadFrames'))
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 402) toast.error(t('c_AgentChat.notEnoughCredits'))
    else toast.error(t('c_AgentChat.frameFailed'))
    keep()
  } finally {
    animStep.value = null
    busy.value = false
    await scrollDown()
  }
}

/** On a still board ensureAnimation keeps the art itself as frame 1, so a
 * plan that opened on "base" would add that frame twice — skip it there. */
function framesToAdd(turn: AgentTurn): AgentGrid[] {
  if (!turn.frames?.length) return []
  const hasAnim = (editorData.value.meta?.animation?.frames?.length ?? 0) > 0
  return !hasAnim && turn.baseFirst ? turn.frames.slice(1) : turn.frames
}

function applyFrames(turn: AgentTurn) {
  if (!turn.frames?.length || busy.value) return
  const grids = framesToAdd(turn)
  const added = store.applyAgentFrames(grids, turn.fps)
  if (!added) { toast.error(t('c_AgentChat.couldNotAddFrames')); return }
  turn.done = t('c_AgentChat.undoWith', {text: t('c_AgentChat.addedNFrames', {count: added}, added), key: `${modKey()}Z`})
  turn.frames = undefined
  turn.fps = undefined
  turns.value = [...turns.value]
}

/** The generated frames, playing at the plan's speed. Its own component so
 * the interval lives and dies with the canvas, not with the chat. */
const AnimPreview = defineComponent({
  props: {
    frames: {type: Array as PropType<AgentGrid[]>, required: true},
    fps: {type: Number, default: 8},
  },
  setup(props) {
    const el = ref<HTMLCanvasElement | null>(null)
    let timer = 0
    let i = 0
    const tick = () => {
      paintPreview(el.value, props.frames[i % props.frames.length])
      i++
    }
    onMounted(() => {
      tick()
      timer = window.setInterval(tick, 1000 / Math.max(2, Math.min(24, props.fps)))
    })
    onBeforeUnmount(() => window.clearInterval(timer))
    return () => h('canvas', {ref: el, class: 'agent-preview pixelated'})
  },
})

async function apply(turn: AgentTurn, grid: AgentGrid | undefined, asNewBoard: boolean) {
  if (!grid) return
  busy.value = true
  try {
    const {colors, pixels, w, h} = grid
    store.applyAgentArt(colors, pixels, w, h, asNewBoard)
    turn.done = asNewBoard
        ? t('c_AgentChat.openedAsNewBoard', {w, h})
        : t('c_AgentChat.undoWith', {text: t('c_AgentChat.applied'), key: `${modKey()}Z`})
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
          <p class="text-sm">{{ $t('c_AgentChat.tellTheAgentWhatToChange') }}</p>
          <ul class="agent-hints text-xs text-muted">
            <li>{{ $t('c_AgentChat.example0') }}</li>
            <li>{{ $t('c_AgentChat.example1') }}</li>
            <li>{{ $t('c_AgentChat.example2') }}</li>
            <li>{{ $t('c_AgentChat.example3') }}</li>
            <li>{{ $t('c_AgentChat.example4') }}</li>
          </ul>
          <p class="text-2xs text-muted" v-html="$t('c_AgentChat.exactChangesApplyStraightAwayAnd')"/>
        </div>

        <div v-for="(t, i) in turns" :key="i" class="agent-turn" :class="t.role">
          <p class="agent-text">{{ t.text }}</p>

          <div v-if="t.redrawPrompt" class="settings-row">
            <button class="btn primary" :disabled="busy" @click="redraw(t)">
              <span class="icon icon-auto-fix"/>
              <span>{{ $t('c_AgentChat.redraw') }}{{ cost?.redraw == null ? '' : ` — ${cost.redraw}` }}</span>
            </button>
            <button class="btn" :disabled="busy" @click="t.redrawPrompt = undefined">{{ $t('c_AgentChat.noThanks') }}</button>
          </div>

          <template v-if="t.animatePlan">
            <ol class="agent-frame-plan text-2xs text-muted">
              <li v-for="(f, j) in t.animatePlan.frames" :key="j">
                {{ f === 'base' ? $t('c_AgentChat.frameAsIs') : f }}
              </li>
            </ol>
            <div class="settings-row">
              <button class="btn primary" :disabled="busy" @click="animate(t)">
                <span class="icon icon-auto-fix"/>
                <span>
                  {{ $t('c_AgentChat.animateFrames', {count: t.animatePlan.frames.length}) }}{{
                    cost?.redraw == null ? '' : ` — ${paidFrames(t.animatePlan) * cost.redraw}`
                  }}
                </span>
              </button>
              <button class="btn" :disabled="busy" @click="t.animatePlan = undefined">{{ $t('c_AgentChat.noThanks') }}</button>
            </div>
          </template>

          <template v-if="t.frames?.length">
            <div class="agent-proposal">
              <figure>
                <AnimPreview :frames="t.frames" :fps="t.fps || 8"/>
                <figcaption class="text-2xs text-muted">
                  {{ $t('c_AgentChat.framesCaption', {count: t.frames.length, fps: t.fps || 8}) }}
                </figcaption>
              </figure>
            </div>
            <div class="settings-row">
              <button class="btn primary" :disabled="busy" @click="applyFrames(t)">
                {{ $t('c_AgentChat.addFrames', framesToAdd(t).length) }}
              </button>
              <button class="btn" :disabled="busy" @click="t.frames = undefined">{{ $t('c_AgentChat.noThanks') }}</button>
            </div>
          </template>

          <template v-if="t.grid">
            <div class="agent-proposal">
              <figure v-if="t.image">
                <img :src="t.image" alt="" class="agent-render"/>
                <figcaption class="text-2xs text-muted">{{ $t('c_AgentChat.whatTheModelDrew') }}</figcaption>
              </figure>
              <figure>
                <canvas
                    :ref="el => paintPreview(el as HTMLCanvasElement, t.grid)"
                    class="agent-preview pixelated"
                />
                <figcaption class="text-2xs text-muted">
                  {{ $t('c_AgentChat.gridCaption', {w: t.grid.w, h: t.grid.h, count: t.grid.colors.length}) }}
                </figcaption>
              </figure>
            </div>
            <div class="settings-row">
              <button class="btn primary" :disabled="busy" @click="apply(t, t.grid, false)">
                {{ $t('c_AgentChat.applyToThisBoard') }}
              </button>
              <button class="btn" :disabled="busy" @click="apply(t, t.grid, true)">
                {{ $t('c_AgentChat.newBoardSize', {w: t.grid.w, h: t.grid.h}) }}
              </button>
              <!-- The model's own size, kept as a separate board so the
                   detail it drew is not lost to this board's dimensions. -->
              <button
                  v-if="t.origGrid && (t.origGrid.w !== t.grid.w || t.origGrid.h !== t.grid.h)"
                  class="btn"
                  :disabled="busy"
                  @click="apply(t, t.origGrid, true)"
              >
                {{ $t('c_AgentChat.newBoardOriginal', {w: t.origGrid.w, h: t.origGrid.h}) }}
              </button>
            </div>
          </template>

          <p v-if="t.done" class="agent-done text-2xs">
            {{ t.done }}
            <button v-if="touch && t.undoable" type="button" class="btn agent-undo" @click="undoLast">
              {{ $t('common.undo') }}
            </button>
          </p>
        </div>

        <p v-if="busy" class="agent-text text-sm text-muted">
          {{ animStep ? $t('c_AgentChat.drawingFrame', animStep) : $t('c_AgentChat.thinking') }}
        </p>
      </div>
    </div>

    <form class="agent-composer" @submit.prevent="send">
      <textarea
          ref="inputEl"
          v-model="draft"
          rows="1"
          maxlength="300"
          :placeholder="auth.isLogged ? $t('c_AgentChat.whatShouldChange') : $t('c_AgentChat.signInToUseTheAgent')"
          :disabled="busy || !auth.isLogged"
          @input="grow"
          @keydown.enter.exact.prevent="send"
      />
      <button
          class="btn primary tm-iconbtn"
          type="submit"
          :disabled="busy || !auth.isLogged || draft.trim().length < 2"
          :title="cost?.chat == null ? $t('c_AgentChat.send') : $t('c_AgentChat.costsNCredit', {count: cost.chat})"
          :aria-label="$t('c_AgentChat.send')"
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

/* The frame plan reads as what it is: a numbered play order. */
.agent-frame-plan {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding-left: var(--space-4);
  list-style: decimal;
}

/* Touch targets: the desktop sizes here are 34 and 36, both under the 44px
   minimum a finger needs. */
@media (pointer: coarse) {
  .agent-composer .tm-iconbtn {
    width: 44px;
    height: 44px;
  }

  .agent-proposal ~ .settings-row .btn {
    min-height: 44px;
    width: 100%;
  }

  .agent-composer textarea {
    font-size: var(--text-base); /* anything smaller and iOS zooms the page on focus */
  }
}

.agent-undo {
  margin-left: var(--space-2);
  min-height: 32px;
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
