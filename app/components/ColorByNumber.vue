<script setup lang="ts">
// Color by number on one picture: the same game as the Chrome extension.
// Squares are keyed "x_y"; progress per picture lives in localStorage.
interface Art {
  id: number
  id_string: string
  name: string
  width: number
  height: number
  colors: string[]
  map_numbers: Record<string, number>
}

const props = defineProps<{ art: Art | null }>()
const emit = defineEmits<{ finished: [] }>()

const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const done = ref(new Set<string>())
const selected = ref(-1)
const zoom = ref(1)
const finished = ref(false)
let cell = 10

const used = computed(() => props.art ? [...new Set(Object.values(props.art.map_numbers))].sort((x, y) => x - y) : [])
const total = computed(() => props.art ? Object.keys(props.art.map_numbers).length : 0)
const pct = computed(() => total.value ? Math.floor((done.value.size / total.value) * 100) : 0)
const left = (c: number) => props.art ? Object.entries(props.art.map_numbers).filter(([k, v]) => v === c && !done.value.has(k)).length : 0

const key = (a: Art) => `cbn:${a.id}`
function load(a: Art) {
  try { done.value = new Set(JSON.parse(localStorage.getItem(key(a)) || '[]')) } catch { done.value = new Set() }
}
let saveTimer: ReturnType<typeof setTimeout> | undefined
function save() {
  const a = props.art
  if (!a) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { localStorage.setItem(key(a), JSON.stringify([...done.value])) } catch {} }, 300)
}

function luma(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}
const ink = (hex: string) => luma(hex) > 150 ? '#111' : '#fff'

function layout() {
  const a = props.art, st = stage.value, cv = canvas.value
  if (!a || !st || !cv) return
  const fit = Math.max(4, Math.floor(Math.min((st.clientWidth - 30) / a.width, (st.clientHeight - 30) / a.height)))
  cell = Math.max(4, Math.round(fit * zoom.value))
  const dpr = window.devicePixelRatio || 1
  cv.width = a.width * cell * dpr
  cv.height = a.height * cell * dpr
  cv.style.width = `${a.width * cell}px`
  cv.style.height = `${a.height * cell}px`
  cv.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw()
}

function draw() {
  const a = props.art, cv = canvas.value
  if (!a || !cv) return
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, a.width * cell, a.height * cell)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.floor(cell * 0.5)}px system-ui, sans-serif`
  for (const [k, c] of Object.entries(a.map_numbers)) {
    const [x, y] = k.split('_').map(Number)
    const px = x * cell, py = y * cell
    if (done.value.has(k)) {
      ctx.fillStyle = a.colors[c]
      ctx.fillRect(px, py, cell, cell)
      continue
    }
    // Unfilled: a pale grey of its own colour so the shape shows through,
    // tinted where the chosen number goes.
    const g = 235 + Math.round((luma(a.colors[c]) / 255) * 20)
    ctx.fillStyle = c === selected.value ? '#cfe3ff' : `rgb(${g},${g},${g})`
    ctx.fillRect(px, py, cell, cell)
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'
    ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1)
    if (cell >= 12) {
      ctx.fillStyle = c === selected.value ? '#1f4fbf' : '#8a8a8a'
      ctx.fillText(String(used.value.indexOf(c) + 1), px + cell / 2, py + cell / 2 + 1)
    }
  }
}

const colorDone = (c: number) => left(c) === 0
function pick(c: number) {
  selected.value = c
  draw()
}

function start() {
  const a = props.art
  if (!a) return
  load(a)
  zoom.value = 1
  finished.value = false
  selected.value = used.value.find(c => !colorDone(c)) ?? used.value[0] ?? -1
  nextTick(layout)
}

function paintAt(ev: PointerEvent) {
  const a = props.art, cv = canvas.value
  if (!a || !cv) return
  const r = cv.getBoundingClientRect()
  const x = Math.floor((ev.clientX - r.left) / cell), y = Math.floor((ev.clientY - r.top) / cell)
  const k = `${x}_${y}`
  if (a.map_numbers[k] !== selected.value || done.value.has(k)) return
  done.value.add(k)
  done.value = new Set(done.value)
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = a.colors[selected.value]
  ctx.fillRect(x * cell, y * cell, cell, cell)
  save()
  if (colorDone(selected.value)) {
    selected.value = used.value.find(c => !colorDone(c)) ?? selected.value
    draw()
  }
  if (done.value.size === total.value && !finished.value) {
    finished.value = true
    emit('finished')
  }
}

let painting = false
let spaceHeld = false
let pan: { x: number; y: number; l: number; t: number } | null = null
function onDown(ev: PointerEvent) {
  const st = stage.value!
  if (spaceHeld || ev.button === 1) {
    ev.preventDefault()
    pan = { x: ev.clientX, y: ev.clientY, l: st.scrollLeft, t: st.scrollTop }
    st.setPointerCapture(ev.pointerId)
    return
  }
  if (ev.button !== 0 || ev.target !== canvas.value) return
  painting = true
  canvas.value!.setPointerCapture(ev.pointerId)
  paintAt(ev)
}
function onMove(ev: PointerEvent) {
  if (pan) {
    stage.value!.scrollLeft = pan.l - (ev.clientX - pan.x)
    stage.value!.scrollTop = pan.t - (ev.clientY - pan.y)
  } else if (painting) paintAt(ev)
}
function onUp() { painting = false; pan = null }

// Zoom keeps the square under the pointer where it is.
function zoomBy(f: number, cx?: number, cy?: number) {
  const st = stage.value, cv = canvas.value
  if (!props.art || !st || !cv) return
  const next = Math.min(8, Math.max(0.5, zoom.value * f))
  if (next === zoom.value) return
  const sr = st.getBoundingClientRect()
  cx ??= sr.left + sr.width / 2
  cy ??= sr.top + sr.height / 2
  const r = cv.getBoundingClientRect()
  const ax = (cx - r.left) / cell, ay = (cy - r.top) / cell
  zoom.value = next
  layout()
  const n = cv.getBoundingClientRect()
  st.scrollLeft += n.left + ax * cell - cx
  st.scrollTop += n.top + ay * cell - cy
}
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  zoomBy(Math.exp(-ev.deltaY * 0.002), ev.clientX, ev.clientY)
}
function fit() { zoom.value = 1; layout() }

function onKey(ev: KeyboardEvent) {
  if (ev.code !== 'Space') return
  const typing = (ev.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')
  if (typing) return
  if (ev.type === 'keydown') ev.preventDefault()
  spaceHeld = ev.type === 'keydown'
}

function download() {
  const a = props.art
  if (!a) return
  // Whole-number nearest-neighbour scale keeps the pixels crisp.
  const s = Math.max(1, Math.floor(1024 / Math.max(a.width, a.height)))
  const c = document.createElement('canvas')
  c.width = a.width * s
  c.height = a.height * s
  const g = c.getContext('2d')!
  for (const [k, v] of Object.entries(a.map_numbers)) {
    const [x, y] = k.split('_').map(Number)
    g.fillStyle = a.colors[v]
    g.fillRect(x * s, y * s, s, s)
  }
  const link = document.createElement('a')
  link.download = `${a.id_string}.png`
  link.href = c.toDataURL('image/png')
  link.click()
}

function restart() {
  const a = props.art
  if (!a) return
  done.value = new Set()
  try { localStorage.removeItem(key(a)) } catch {}
  start()
}

let ro: ResizeObserver | null = null
onMounted(() => {
  start()
  ro = new ResizeObserver(() => layout())
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKey)
})
watch(() => props.art?.id, () => start())

defineExpose({ pct })
</script>

<template>
  <div class="cbn">
    <div
        ref="stage"
        class="cbn-stage"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @wheel="onWheel"
    >
      <canvas ref="canvas" class="cbn-canvas"/>
      <div v-if="finished && art" class="cbn-done">
        <p class="cbn-done-title">Finished!</p>
        <div class="cbn-done-actions">
          <button type="button" class="btn primary" @click="download">
            <span class="icon icon-download"/><span>Download PNG</span>
          </button>
          <NuxtLink :to="`/art/${art.id_string}`" class="btn">See the original</NuxtLink>
          <button type="button" class="btn" @click="restart">Color it again</button>
        </div>
      </div>
    </div>
    <div class="cbn-bar">
      <div class="cbn-palette">
        <button
            v-for="(c, i) in used"
            :key="c"
            type="button"
            class="cbn-swatch"
            :class="{on: c === selected, complete: colorDone(c)}"
            :style="{'--c': art!.colors[c], '--ink': ink(art!.colors[c])}"
            :title="`${left(c)} left`"
            @click="pick(c)"
        >
          <span class="cbn-num">{{ i + 1 }}</span>
          <span v-if="left(c)" class="cbn-left">{{ left(c) }}</span>
        </button>
      </div>
      <span class="cbn-pct">{{ pct }}%</span>
      <div class="cbn-zoom">
        <button type="button" class="widget-ctl-btn" title="Zoom out (scroll)" @click="zoomBy(1 / 1.25)"><span class="icon icon-minus"/></button>
        <button type="button" class="widget-ctl-btn" title="Fit" @click="fit"><span class="icon icon-fullscreen"/></button>
        <button type="button" class="widget-ctl-btn" title="Zoom in (scroll)" @click="zoomBy(1.25)"><span class="icon icon-plus"/></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cbn {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.cbn-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  padding: var(--space-6);
  overscroll-behavior: contain;
}

/* Below the dashboard layout the page scrolls and gives the stage no
   height of its own; a square-ish box keeps the picture big enough to tap. */
@media (max-width: 1023px) {
  .cbn-stage {
    min-height: min(100vw, 70vh);
  }
}

.cbn-canvas {
  margin: auto;
  display: block;
  max-width: none;
  touch-action: none;
  cursor: crosshair;
  image-rendering: pixelated;
  background: #fff;
  outline: 1px solid var(--border);
}

.cbn-done {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: color-mix(in oklab, var(--surface) 92%, transparent);
  border-top: 1px solid var(--border);
}

.cbn-done-title {
  margin: 0;
  font-weight: 700;
}

.cbn-done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.cbn-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
}

/* Room above and right for each swatch's count, which the scroll box would
   otherwise clip. */
.cbn-palette {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: var(--space-4);
  overflow-x: auto;
  padding: var(--space-3) var(--space-3) var(--space-1) var(--space-1);
}

.cbn-swatch {
  position: relative;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: calc(var(--space-6) * 2 + var(--space-4));
  height: calc(var(--space-6) * 2 + var(--space-4));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--c);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
}

.cbn-swatch.on {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.cbn-swatch.complete .cbn-num {
  visibility: hidden;
}

.cbn-swatch.complete::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: var(--icon-md, 20px);
  height: var(--icon-md, 20px);
  background: var(--ink);
  mask: url("/icons/check.svg") center / contain no-repeat;
  -webkit-mask: url("/icons/check.svg") center / contain no-repeat;
}

.cbn-left {
  position: absolute;
  right: calc(var(--space-2) * -1);
  top: calc(var(--space-2) * -1);
  min-width: calc(var(--space-6) + var(--space-1));
  padding: 0 var(--space-1);
  border-radius: var(--space-4);
  border: 1px solid var(--surface);
  background: var(--surface-2);
  color: var(--foreground);
  font-size: var(--text-2xs, 10px);
  line-height: calc(var(--space-6) + var(--space-1));
}

.cbn-pct {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.cbn-zoom {
  display: flex;
  gap: var(--space-1);
}
</style>
