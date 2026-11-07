<script setup lang="ts">
// The walk preview mode: the board as a character sheet -- `sheetCols`
// frames across, one row per direction -- played as a walk cycle. Turns
// through the directions on its own, or holds the chosen one.
import type {PreviewMeta} from '~/helper/previews'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  opts: PreviewMeta
}>()

const cv = ref<HTMLCanvasElement | null>(null)
const ORDERS: Record<PreviewMeta['dirOrder'], string[]> = {
  'down-left-right-up': ['down', 'left', 'right', 'up'],
  'down-up-left-right': ['down', 'up', 'left', 'right'],
}
const TURN = ['down', 'left', 'up', 'right']
let raf = 0
let clock = 0
let last = 0

function paint() {
  const c = cv.value, src = props.art()
  if (!c || !src) return
  const o = props.opts
  const cols = Math.max(1, o.sheetCols | 0), rows = Math.max(1, o.sheetRows | 0)
  const fw = Math.floor(src.width / cols), fh = Math.floor(src.height / rows)
  if (!fw || !fh) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }

  const step = Math.floor(clock * (o.fps || 6))
  const seq = o.pingPong && cols > 2 ? [...Array(cols).keys(), ...Array.from({length: cols - 2}, (_, i) => cols - 2 - i)] : [...Array(cols).keys()]
  const frame = seq[step % seq.length]!
  // Auto: face each way for two cycles, turning like a character would.
  const dir = o.dir === 'auto' ? TURN[Math.floor(step / (seq.length * 2)) % 4]! : o.dir
  const row = Math.min(rows - 1, Math.max(0, ORDERS[o.dirOrder].indexOf(dir)))

  const s = Math.max(1, Math.floor(Math.min(w / fw, h / fh) * 0.7))
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(w / 2, (h + fh * s) / 2 - s, fw * s * 0.32, fh * s * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, frame * fw, row * fh, fw, fh, Math.round((w - fw * s) / 2), Math.round((h - fh * s) / 2), fw * s, fh * s)
}

function loop(t: number) {
  clock += last ? Math.min(t - last, 100) / 1000 : 0
  last = t
  paint()
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas ref="cv" class="preview-fill"/>
</template>
