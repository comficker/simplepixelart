<script setup lang="ts">
import {EXPORT_FORMATS, type ExportFormat, renderExport, toBlob} from '~/helper/cbn-export'
import {PAINT_STYLES, type PaintStyle, paintResolution, paintSquare, scribble, squaresPath, strokeSegment, stylePreview} from '~/helper/paint-styles'

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
interface Cell { k: string; x: number; y: number; c: number }
// A brush stroke as drawn: style, colour, tip width and the path, in squares.
interface Stroke { s: number; c: number; w: number; p: number[] }

const props = defineProps<{ art: Art | null }>()
const auth = useAuthStore()
const emit = defineEmits<{ finished: [] }>()

const BRUSHES = [
  {id: 'pixel', icon: 'pencil', size: 1, title: 'One square'},
  {id: 'brush3', icon: 'brush', size: 3, title: 'Brush 3×3'},
  {id: 'brush5', icon: 'brush', size: 5, title: 'Brush 5×5'},
  {id: 'bucket', icon: 'bucket', size: 0, title: 'Fill the touching area'},
  {id: 'wand', icon: 'auto-fix', size: 0, title: 'Fill every square of this number'},
] as const
type BrushId = typeof BRUSHES[number]['id']

const stage = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const selected = ref(-1)
const zoom = ref(1)
const finished = ref(false)
const brush = ref<BrushId>('pixel')
const brushSize = computed(() => BRUSHES.find(b => b.id === brush.value)!.size)
const style = ref(0) // index into PAINT_STYLES
const styleId = (i: number) => (PAINT_STYLES[i] ?? PAINT_STYLES[0]).id as PaintStyle
let cell = 10

// Everything the hot paths need is precomputed once per picture, and the
// filled set is plain (not reactive): only the per-colour counts below are,
// so one stroke never re-scans the whole picture.
let cells: Cell[] = []
let grid: Int16Array = new Int16Array(0) // colour per square, -1 = empty
let filled: Uint8Array = new Uint8Array(0) // 0 = empty, else style index + 1
let at: (Cell | null)[] = []
// Off-screen paint, R pixels per square; the visible canvas scales it.
let layer: HTMLCanvasElement | null = null
let lctx: CanvasRenderingContext2D | null = null
let R = 16
let done = new Map<string, number>() // square -> style index
let strokes: Stroke[] = []
let clips = new Map<number, Path2D>()
const remaining = ref<Record<number, number>>({})
const doneCount = ref(0)
const total = ref(0)

const used = computed(() => props.art ? [...new Set(Object.values(props.art.map_numbers))].sort((x, y) => x - y) : [])
const label = computed(() => new Map(used.value.map((c, i) => [c, String(i + 1)])))
const pct = computed(() => total.value ? Math.floor((doneCount.value / total.value) * 100) : 0)
const left = (c: number) => remaining.value[c] || 0
const colorDone = (c: number) => left(c) === 0

const key = (a: Art) => `cbn:${a.id}`
function index(a: Art) {
  cells = Object.entries(a.map_numbers).map(([k, c]) => {
    const [x, y] = k.split('_').map(Number)
    return {k, x, y, c}
  })
  grid = new Int16Array(a.width * a.height).fill(-1)
  filled = new Uint8Array(a.width * a.height)
  for (const p of cells) grid[p.y * a.width + p.x] = p.c
  // Saved as "x_y" (flat, as older saves are) or "x_y:style".
  done = new Map()
  try {
    for (const e of JSON.parse(localStorage.getItem(key(a)) || '[]') as string[]) {
      const [k, st] = String(e).split(':')
      done.set(k, Number(st) || 0)
    }
  } catch {}
  const rem: Record<number, number> = {}
  let n = 0
  for (const p of cells) {
    const st = done.get(p.k)
    if (st !== undefined) { filled[p.y * a.width + p.x] = st + 1; n++ } else rem[p.c] = (rem[p.c] || 0) + 1
  }
  remaining.value = rem
  doneCount.value = n
  total.value = cells.length
  // Paint everything already filled into a fresh paint layer.
  R = paintResolution(a.width, a.height)
  layer = document.createElement('canvas')
  layer.width = a.width * R
  layer.height = a.height * R
  lctx = layer.getContext('2d')!
  at = new Array(a.width * a.height).fill(null)
  clips = new Map()
  for (const p of cells) {
    at[p.y * a.width + p.x] = p
    const f = filled[p.y * a.width + p.x]
    if (f) ground(p.x, p.y, f - 1, p.c)
  }
  try { strokes = JSON.parse(localStorage.getItem(strokeKey(a)) || '[]') } catch { strokes = [] }
  strokes.forEach((st, i) => {
    for (let j = 0; j + 3 < st.p.length; j += 2) segment(st, i, j, st.p[j], st.p[j + 1], st.p[j + 2], st.p[j + 3])
    if (st.p.length === 2) segment(st, i, 0, st.p[0], st.p[1], st.p[0], st.p[1])
  })
}

const strokeKey = (a: Art) => `cbn:${a.id}:strokes`
function ground(x: number, y: number, st: number, c: number) {
  paintSquare(lctx!, R, styleId(st), props.art!.colors[c], x, y)
}
function clipFor(c: number) {
  let p = clips.get(c)
  if (!p) {
    p = squaresPath(cells.filter(q => q.c === c), R)
    clips.set(c, p)
  }
  return p
}
// Draws one piece of a stroke into the paint layer, only on its colour's squares.
function segment(st: Stroke, i: number, j: number, x0: number, y0: number, x1: number, y1: number) {
  if (!lctx) return
  lctx.save()
  lctx.clip(clipFor(st.c))
  strokeSegment(lctx, styleId(st.s), props.art!.colors[st.c], st.w * R, R, i * 7919 + j, x0 * R, y0 * R, x1 * R, y1 * R)
  lctx.restore()
}
let strokeTimer: ReturnType<typeof setTimeout> | undefined
function saveStrokes() {
  const a = props.art
  if (!a) return
  clearTimeout(strokeTimer)
  strokeTimer = setTimeout(() => {
    // Strokes are decoration over the filled squares: if they outgrow the
    // budget, the oldest go first.
    let json = JSON.stringify(strokes)
    while (json.length > 400_000 && strokes.length > 1) {
      strokes.splice(0, Math.ceil(strokes.length / 4))
      json = JSON.stringify(strokes)
    }
    try { localStorage.setItem(strokeKey(a), json) } catch {}
  }, 600)
}
let saveTimer: ReturnType<typeof setTimeout> | undefined
function save() {
  const a = props.art
  if (!a) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { try { localStorage.setItem(key(a), JSON.stringify([...done].map(([k, st]) => st ? `${k}:${st}` : k))) } catch {} }, 400)
}

function luma(hex: string) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}
const ink = (hex: string) => luma(hex) > 150 ? '#111' : '#fff'
let pale: string[] = []

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

function drawCell(ctx: CanvasRenderingContext2D, p: Cell) {
  const a = props.art!
  const px = p.x * cell, py = p.y * cell
  if (filled[p.y * a.width + p.x]) return // the paint layer covers it
  // Unfilled: a pale grey of its own colour so the shape shows through,
  // tinted where the chosen number goes.
  const on = p.c === selected.value
  ctx.fillStyle = on ? '#cfe3ff' : pale[p.c]
  ctx.fillRect(px, py, cell, cell)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1)
  if (cell >= 12) {
    ctx.fillStyle = on ? '#1f4fbf' : '#8a8a8a'
    ctx.fillText(label.value.get(p.c)!, px + cell / 2, py + cell / 2 + 1)
  }
}

function draw() {
  const a = props.art, cv = canvas.value
  if (!a || !cv) return
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, a.width * cell, a.height * cell)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.floor(cell * 0.5)}px system-ui, sans-serif`
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'
  for (const p of cells) drawCell(ctx, p)
  if (layer) {
    ctx.imageSmoothingEnabled = cell < R
    ctx.drawImage(layer, 0, 0, a.width * cell, a.height * cell)
  }
}

// Redraws squares x0..x1, y0..y1: their numbers, then the paint over them.
function refresh(x0: number, y0: number, x1: number, y1: number) {
  const a = props.art, cv = canvas.value
  if (!a || !cv || !layer) return
  x0 = Math.max(0, x0); y0 = Math.max(0, y0)
  x1 = Math.min(a.width - 1, x1); y1 = Math.min(a.height - 1, y1)
  const ctx = cv.getContext('2d')!
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${Math.floor(cell * 0.5)}px system-ui, sans-serif`
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  ctx.clearRect(x0 * cell, y0 * cell, w * cell, h * cell)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = at[y * a.width + x]
    if (p) drawCell(ctx, p)
  }
  ctx.imageSmoothingEnabled = cell < R
  ctx.drawImage(layer, x0 * R, y0 * R, w * R, h * R, x0 * cell, y0 * cell, w * cell, h * cell)
}

// Changing number only repaints the squares of the old and new number.
function pick(c: number) {
  const a = props.art, cv = canvas.value
  const prev = selected.value
  selected.value = c
  if (!a || !cv || prev === c) return
  for (const p of cells) if ((p.c === c || p.c === prev) && !filled[p.y * a.width + p.x]) refresh(p.x, p.y, p.x, p.y)
}

function start() {
  const a = props.art
  if (!a) return
  index(a)
  pale = a.colors.map(h => { const g = 235 + Math.round((luma(h) / 255) * 20); return `rgb(${g},${g},${g})` })
  zoom.value = 1
  finished.value = false
  selected.value = used.value.find(c => !colorDone(c)) ?? used.value[0] ?? -1
  nextTick(layout)
}

// Fills the given squares if they carry the chosen number; returns how many.
function fill(xs: Iterable<number>, c = selected.value) {
  const a = props.art!, st = style.value
  if (!lctx) return 0
  let n = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (const i of xs) {
    if (grid[i] !== c || filled[i]) continue
    filled[i] = st + 1
    const x = i % a.width, y = (i - x) / a.width
    done.set(`${x}_${y}`, st)
    ground(x, y, st, c)
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    n++
  }
  // Paint can bleed a little into the neighbours.
  if (n) refresh(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
  if (!n) return 0
  remaining.value[c] -= n
  doneCount.value += n
  save()
  if (colorDone(c)) pick(used.value.find(u => !colorDone(u)) ?? c)
  if (doneCount.value === cells.length && !finished.value) {
    finished.value = true
    emit('finished')
  }
  return n
}

function* square(x: number, y: number, size: number) {
  const a = props.art!, r = (size - 1) / 2
  for (let j = y - r; j <= y + r; j++) for (let i = x - r; i <= x + r; i++) {
    if (i >= 0 && j >= 0 && i < a.width && j < a.height) yield j * a.width + i
  }
}

function flood(x: number, y: number) {
  const a = props.art!, w = a.width, c = selected.value, out: number[] = []
  const s = y * w + x
  if (grid[s] !== c) return out
  const seen = new Uint8Array(grid.length), stack = [s]
  seen[s] = 1
  while (stack.length) {
    const i = stack.pop()!
    out.push(i)
    const ix = i % w
    for (const n of [ix > 0 ? i - 1 : -1, ix < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (n >= 0 && n < grid.length && !seen[n] && grid[n] === c) { seen[n] = 1; stack.push(n) }
    }
  }
  return out
}

function pointAt(ev: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return [(ev.clientX - r.left) / cell, (ev.clientY - r.top) / cell] as const
}
function cellAt(ev: PointerEvent) {
  const [x, y] = pointAt(ev)
  return [Math.floor(x), Math.floor(y)] as const
}

const round2 = (v: number) => Math.round(v * 100) / 100
let live: Stroke | null = null
let last: readonly [number, number] | null = null
function stroke(fx: number, fy: number) {
  const a = props.art!, size = brushSize.value, x = Math.floor(fx), y = Math.floor(fy)
  const c = live ? live.c : selected.value
  const lastCell = last ? [Math.floor(last[0]), Math.floor(last[1])] : [x, y]
  // Walk the line from the last square so quick drags leave no gaps.
  let [x0, y0] = lastCell
  const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1
  let err = dx + dy
  const hit = new Set<number>()
  for (;;) {
    if (size === 1) { if (x0 >= 0 && y0 >= 0 && x0 < a.width && y0 < a.height) hit.add(y0 * a.width + x0) }
    else for (const i of square(x0, y0, size)) hit.add(i)
    if (x0 === x && y0 === y) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x0 += sx }
    if (e2 <= dx) { err += dx; y0 += sy }
  }
  fill(hit, c)
  // The brush mark itself, following the pointer.
  if (live) {
    const [px, py] = last ?? [fx, fy]
    const k = live.p.length
    live.p.push(round2(fx), round2(fy))
    segment(live, strokes.length, k ? k - 2 : 0, px, py, fx, fy)
    const h = Math.ceil(size / 2) + 1
    refresh(Math.floor(Math.min(px, fx)) - h, Math.floor(Math.min(py, fy)) - h, Math.floor(Math.max(px, fx)) + h, Math.floor(Math.max(py, fy)) + h)
  }
  last = [fx, fy]
}
function endStroke() {
  if (live && live.p.length) {
    strokes.push(live)
    saveStrokes()
  }
  live = null
  last = null
}

// Bucket and wand fill a whole area at once; give it a scribble of the brush.
function fillArea(xs: number[]) {
  const a = props.art!, c = selected.value
  const fresh = xs.filter(i => grid[i] === c && !filled[i])
  if (!fresh.length) return
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1
  for (const i of fresh) {
    const x = i % a.width, y = (i - x) / a.width
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
  }
  fill(fresh, c)
  if (styleId(style.value) === 'flat') return
  const st: Stroke = {s: style.value, c, w: 1.3, p: scribble(x0, y0, x1, y1, strokes.length).map(round2)}
  for (let j = 0; j + 3 < st.p.length; j += 2) segment(st, strokes.length, j, st.p[j], st.p[j + 1], st.p[j + 2], st.p[j + 3])
  strokes.push(st)
  saveStrokes()
  refresh(x0 - 1, y0 - 1, x1 + 1, y1 + 1)
}

function paintDown(ev: PointerEvent) {
  const a = props.art
  if (!a) return
  const [x, y] = cellAt(ev)
  if (x < 0 || y < 0 || x >= a.width || y >= a.height) return
  if (brush.value === 'wand') {
    fillArea(cells.filter(p => p.c === selected.value).map(p => p.y * a.width + p.x))
    return
  }
  if (brush.value === 'bucket') {
    fillArea(flood(x, y))
    return
  }
  painting = true
  last = null
  // Flat paint is pixel-exact: squares only, no brush marks.
  live = styleId(style.value) === 'flat' ? null : {s: style.value, c: selected.value, w: Math.max(1, brushSize.value) * 1.05, p: []}
  const [fx, fy] = pointAt(ev)
  stroke(fx, fy)
}

// Pointer moves are coalesced to one stroke per frame.
let pending: PointerEvent | null = null
let raf = 0
function flush() {
  raf = 0
  if (pending && painting) { const [x, y] = pointAt(pending); stroke(x, y) }
  if (pending) moveCursor(pending)
  pending = null
}

const cursor = ref<{ x: number; y: number; w: number } | null>(null)
function moveCursor(ev: PointerEvent) {
  if (!props.art || brushSize.value < 3 || ev.pointerType !== 'mouse') { cursor.value = null; return }
  const [x, y] = cellAt(ev), r = (brushSize.value - 1) / 2
  cursor.value = {x: (x - r) * cell, y: (y - r) * cell, w: brushSize.value * cell}
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
  canvas.value!.setPointerCapture(ev.pointerId)
  paintDown(ev)
}
function onMove(ev: PointerEvent) {
  if (pan) {
    stage.value!.scrollLeft = pan.l - (ev.clientX - pan.x)
    stage.value!.scrollTop = pan.t - (ev.clientY - pan.y)
    return
  }
  pending = ev
  if (!raf) raf = requestAnimationFrame(flush)
}
function onUp() {
  if (pending && painting) flush()
  painting = false
  pan = null
  endStroke()
}
function onLeave() { cursor.value = null }

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
  const before = cell
  zoom.value = next
  layout()
  if (cell === before) return
  const n = cv.getBoundingClientRect()
  st.scrollLeft += n.left + ax * cell - cx
  st.scrollTop += n.top + ay * cell - cy
}
// Wheel ticks arrive faster than a full redraw; fold them into one per frame.
let wheel = { f: 1, x: 0, y: 0, raf: 0 }
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  cursor.value = null
  wheel.f *= Math.exp(-ev.deltaY * 0.002)
  wheel.x = ev.clientX
  wheel.y = ev.clientY
  if (!wheel.raf) wheel.raf = requestAnimationFrame(() => {
    const {f, x, y} = wheel
    wheel = {f: 1, x: 0, y: 0, raf: 0}
    zoomBy(f, x, y)
  })
}
function fit() { zoom.value = 1; layout() }

function setStyle(i: number) {
  style.value = i
  try { localStorage.setItem('cbn:style', String(i)) } catch {}
}
// Each style chip shows that style in the chosen colour.
const previews = computed(() => {
  const a = props.art, col = a && selected.value >= 0 ? a.colors[selected.value] : '#5b8def'
  return PAINT_STYLES.map(st => stylePreview(st.id, col))
})

function setBrush(id: BrushId) {
  brush.value = id
  try { localStorage.setItem('cbn:brush', id) } catch {}
}

function onKey(ev: KeyboardEvent) {
  const typing = (ev.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')
  if (typing) return
  if (ev.code === 'Space') {
    if (ev.type === 'keydown') ev.preventDefault()
    spaceHeld = ev.type === 'keydown'
    return
  }
  // B cycles brushes.
  if (ev.type === 'keydown' && ev.key.toLowerCase() === 'b' && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    const i = BRUSHES.findIndex(b => b.id === brush.value)
    setBrush(BRUSHES[(i + 1) % BRUSHES.length].id)
  }
}

// Export: a preview of the chosen social format, then download or share.
const exporting = ref(false)
const format = ref<ExportFormat>('square')
const exportUrl = ref('')
const canShare = ref(false)
let exportCanvas: HTMLCanvasElement | null = null
async function renderPreview() {
  if (!layer) return
  exportCanvas = await renderExport(layer, format.value, auth.logged?.username)
  const blob = await toBlob(exportCanvas)
  if (exportUrl.value) URL.revokeObjectURL(exportUrl.value)
  exportUrl.value = URL.createObjectURL(blob)
  const file = new File([blob], fileName(), {type: 'image/png'})
  canShare.value = !!navigator.canShare?.({files: [file]})
}
const fileName = () => `${props.art?.id_string || 'pixel-art'}-${format.value}.png`
function openExport() {
  exporting.value = true
  renderPreview()
}
function closeExport() {
  exporting.value = false
  if (exportUrl.value) URL.revokeObjectURL(exportUrl.value)
  exportUrl.value = ''
}
watch(format, () => { if (exporting.value) renderPreview() })
function download() {
  if (!exportUrl.value) return
  const link = document.createElement('a')
  link.download = fileName()
  link.href = exportUrl.value
  link.click()
}
async function share() {
  if (!exportCanvas) return
  const file = new File([await toBlob(exportCanvas)], fileName(), {type: 'image/png'})
  try {
    await navigator.share({files: [file], title: props.art?.name, text: 'Colored on simplepixelart.com'})
  } catch {}
}

function restart() {
  const a = props.art
  if (!a) return
  try {
    localStorage.removeItem(key(a))
    localStorage.removeItem(strokeKey(a))
  } catch {}
  start()
}

let ro: ResizeObserver | null = null
onMounted(() => {
  try {
    const b = localStorage.getItem('cbn:brush')
    if (BRUSHES.some(x => x.id === b)) brush.value = b as BrushId
    const st = Number(localStorage.getItem('cbn:style'))
    if (PAINT_STYLES[st]) style.value = st
  } catch {}
  start()
  ro = new ResizeObserver(() => layout())
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
})
onBeforeUnmount(() => {
  ro?.disconnect()
  cancelAnimationFrame(raf)
  cancelAnimationFrame(wheel.raf)
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
        @pointerleave="onLeave"
        @wheel="onWheel"
    >
      <div class="cbn-board">
        <canvas ref="canvas" class="cbn-canvas"/>
        <div
            v-if="cursor"
            class="cbn-cursor"
            :style="{transform: `translate(${cursor.x}px, ${cursor.y}px)`, width: `${cursor.w}px`}"
        />
      </div>
      <div v-if="finished && art" class="cbn-done">
        <p class="cbn-done-title">Finished!</p>
        <div class="cbn-done-actions">
          <button type="button" class="btn primary" @click="openExport">
            <span class="icon icon-download"/><span>Save &amp; share</span>
          </button>
          <NuxtLink :to="`/art/${art.id_string}`" class="btn">See the original</NuxtLink>
          <button type="button" class="btn" @click="restart">Color it again</button>
        </div>
      </div>
    </div>
    <div class="cbn-bar">
      <div class="cbn-brushes" role="radiogroup" aria-label="Brush">
        <button
            v-for="b in BRUSHES"
            :key="b.id"
            type="button"
            role="radio"
            class="toolbar-btn cbn-brush"
            :class="{active: brush === b.id}"
            :aria-checked="brush === b.id"
            :title="`${b.title} (B)`"
            @click="setBrush(b.id)"
        >
          <span class="icon" :class="`icon-${b.icon}`"/>
          <span v-if="b.size > 1" class="cbn-size">{{ b.size }}</span>
        </button>
      </div>
      <div class="cbn-styles" role="radiogroup" aria-label="Paint">
        <button
            v-for="(st, i) in PAINT_STYLES"
            :key="st.id"
            type="button"
            role="radio"
            class="cbn-style"
            :class="{on: style === i}"
            :aria-checked="style === i"
            :title="st.name"
            :style="{backgroundImage: `url(${previews[i]})`}"
            @click="setStyle(i)"
        />
      </div>
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
      <button type="button" class="toolbar-btn" title="Save &amp; share" aria-label="Save and share" @click="openExport">
        <span class="icon icon-share"/>
      </button>
      <div class="cbn-zoom">
        <button type="button" class="widget-ctl-btn" title="Zoom out (scroll)" @click="zoomBy(1 / 1.25)"><span class="icon icon-minus"/></button>
        <button type="button" class="widget-ctl-btn" title="Fit" @click="fit"><span class="icon icon-fullscreen"/></button>
        <button type="button" class="widget-ctl-btn" title="Zoom in (scroll)" @click="zoomBy(1.25)"><span class="icon icon-plus"/></button>
      </div>
    </div>
    <UiModal v-if="exporting" title="Save & share" sub="Signed and sized for social posts." width="560px" @close="closeExport">
      <div class="cbn-export">
        <div class="cbn-formats" role="radiogroup" aria-label="Size">
          <button
              v-for="f in EXPORT_FORMATS"
              :key="f.id"
              type="button"
              role="radio"
              class="btn"
              :class="{primary: format === f.id}"
              :aria-checked="format === f.id"
              :title="f.note"
              @click="format = f.id"
          >{{ f.name }}</button>
        </div>
        <p class="cbn-export-note">{{ EXPORT_FORMATS.find(f => f.id === format)!.note }}</p>
        <div class="cbn-export-preview">
          <img v-if="exportUrl" :src="exportUrl" :alt="`${art?.name || 'Pixel art'} colored by number`">
        </div>
        <div class="cbn-export-actions">
          <button type="button" class="btn primary" :disabled="!exportUrl" @click="download">
            <span class="icon icon-download"/><span>Download PNG</span>
          </button>
          <button v-if="canShare" type="button" class="btn" @click="share">
            <span class="icon icon-share"/><span>Share</span>
          </button>
        </div>
      </div>
    </UiModal>
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
@media (max-width: 1279px) {
  .cbn-stage {
    min-height: min(100vw, 70vh);
  }
}

.cbn-board {
  position: relative;
  margin: auto;
}

.cbn-cursor {
  position: absolute;
  left: 0;
  top: 0;
  aspect-ratio: 1;
  pointer-events: none;
  outline: 2px solid var(--primary);
  outline-offset: -1px;
  will-change: transform;
}

.cbn-canvas {
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

@media (max-width: 767px) {
  .cbn-bar {
    flex-wrap: wrap;
  }

  .cbn-palette {
    order: 3;
    flex-basis: 100%;
  }

  .cbn-pct {
    margin-left: auto;
  }
}

.cbn-styles {
  display: flex;
  gap: var(--space-2);
  padding-right: var(--space-3);
  border-right: 1px solid var(--border);
}

.cbn-style {
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background-size: cover;
  cursor: pointer;
}

.cbn-style.on {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.cbn-brushes {
  display: flex;
  gap: var(--space-1);
  padding-right: var(--space-3);
  border-right: 1px solid var(--border);
}

.cbn-brush {
  position: relative;
}

/* Same 20px glyph as the editor toolbar; the size badge sits in the corner. */
.cbn-brush .icon-pencil,
.cbn-brush .icon-brush,
.cbn-brush .icon-bucket,
.cbn-brush .icon-auto-fix {
  width: var(--icon-md, 20px);
  height: var(--icon-md, 20px);
}

.cbn-size {
  position: absolute;
  right: var(--space-1);
  bottom: 0;
  font-size: var(--text-2xs, 10px);
  font-weight: 700;
  line-height: 1;
}

.cbn-export {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.cbn-formats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.cbn-export-note {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.cbn-export-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  height: min(44vh, 400px);
  padding: var(--space-3);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

/* Sized off the box itself: a percentage height inside a flex/grid item
   would not hold the tall Story format in. */
.cbn-export-preview img {
  display: block;
  max-width: 100%;
  max-height: calc(min(44vh, 400px) - var(--space-3) * 2);
  width: auto;
  height: auto;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.cbn-export-actions {
  display: flex;
  gap: var(--space-3);
  justify-content: flex-end;
}

.cbn-zoom {
  display: flex;
  gap: var(--space-1);
}
</style>
