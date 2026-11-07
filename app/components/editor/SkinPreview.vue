<script setup lang="ts">
// The skin preview mode: the board as a turning figure. Turns on its own
// until dragged; the art is re-read whenever `rev` moves.
import {drawSkin, type SkinArms} from '~/helper/previews/mc-skin'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  arms: SkinArms
  outer: boolean
}>()
const emit = defineEmits<{ arms: [SkinArms]; outer: [boolean] }>()

const cv = ref<HTMLCanvasElement | null>(null)
let yaw = 0.6
const pitch = 0.32
let spinning = true
let raf = 0
let last = 0
// Painted every frame only while it turns; otherwise when something changed.
let dirty = true

function paint() {
  const c = cv.value, src = props.art()
  if (!c || !src) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  drawSkin(c.getContext('2d')!, src, w, h, {yaw, pitch, arms: props.arms, outer: props.outer})
}

function loop(t: number) {
  if (spinning && last) yaw += (t - last) * 0.0006
  last = t
  if (spinning || dirty) { paint(); dirty = false }
  raf = requestAnimationFrame(loop)
}

let dragX: number | null = null
function down(e: PointerEvent) {
  dragX = e.clientX
  spinning = false
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (dragX === null) return
  yaw += (e.clientX - dragX) * 0.012
  dragX = e.clientX
  dirty = true
}
function up() { dragX = null }

watch(() => [props.rev, props.arms, props.outer], () => { dirty = true })
onMounted(() => { raf = requestAnimationFrame(loop) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="skin-preview">
    <canvas ref="cv" class="skin-cv" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @dblclick="spinning = true"/>
    <div class="skin-opts">
      <button type="button" :class="{active: arms === 'classic'}" @click="emit('arms', 'classic')">4px</button>
      <button type="button" :class="{active: arms === 'slim'}" @click="emit('arms', 'slim')">3px</button>
      <button type="button" :class="{active: outer}" :title="'Outer layer'" @click="emit('outer', !outer)">Outer</button>
    </div>
  </div>
</template>

<style scoped>
.skin-preview { position: absolute; inset: 0; }
.skin-cv { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; }
.skin-cv:active { cursor: grabbing; }
.skin-opts { position: absolute; left: var(--space-2); bottom: var(--space-2); display: flex; gap: 2px; }
.skin-opts button {
  font-size: var(--text-2xs); font-weight: 700; padding: 2px var(--space-2); border-radius: var(--radius-sm);
  background: var(--surface-2); color: var(--muted); border: 0; cursor: pointer;
}
.skin-opts button.active { background: var(--surface); color: var(--foreground); box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
</style>
