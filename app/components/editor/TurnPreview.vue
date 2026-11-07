<script setup lang="ts">
// The turning 3D preview modes: a skin as a figure, a texture as a block.
// Turns on its own unless spin is off or it was dragged; the art is re-read
// whenever `rev` moves.
import {drawSkin} from '~/helper/previews/mc-skin'
import {drawBlock} from '~/helper/previews/block'
import type {PreviewMeta} from '~/helper/previews'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  opts: PreviewMeta
  mode: 'mc-skin' | 'mc-block'
}>()

const cv = ref<HTMLCanvasElement | null>(null)
let yaw = 0.6
let phase = 0
let dragged = false
let raf = 0
let last = 0
// Painted every frame only while something moves; otherwise on change.
let dirty = true

const posing = () => props.mode === 'mc-skin' && props.opts.pose !== 'stand'
const moving = () => (props.opts.spin && !dragged) || posing()

function paint() {
  const c = cv.value, src = props.art()
  if (!c || !src) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const o = props.opts
  const pitch = o.pitch * Math.PI / 180
  if (props.mode === 'mc-block') {
    drawBlock(c.getContext('2d')!, src, w, h, {yaw, pitch, shade: o.shade}, props.rev)
    return
  }
  drawSkin(c.getContext('2d')!, src, w, h, {
    yaw, phase, pitch, arms: o.arms, outer: o.outer,
    pose: o.pose, shade: o.shade, framing: o.framing,
  }, props.rev)
}

function loop(t: number) {
  const dt = last ? Math.min(t - last, 100) : 0
  last = t
  if (props.opts.spin && !dragged) yaw += dt * props.opts.speed * Math.PI * 2 / 60000
  if (posing()) phase += dt * 0.006
  if (moving() || dirty) { paint(); dirty = false }
  raf = requestAnimationFrame(loop)
}

let dragX: number | null = null
function down(e: PointerEvent) {
  dragX = e.clientX
  dragged = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function move(e: PointerEvent) {
  if (dragX === null) return
  yaw += (e.clientX - dragX) * 0.012
  dragX = e.clientX
  dirty = true
}
function up() { dragX = null }
function reset() { dragged = false; yaw = 0.6; dirty = true }

watch(() => [props.rev, props.opts, props.mode], () => { dirty = true }, {deep: true})
// Turning spin back on in the settings resumes it even after a drag.
watch(() => props.opts.spin, v => { if (v) dragged = false })
onMounted(() => { raf = requestAnimationFrame(loop) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas ref="cv" class="preview-fill skin-cv" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @dblclick="reset"/>
</template>

<style scoped>
.skin-cv { cursor: grab; touch-action: none; }
.skin-cv:active { cursor: grabbing; }
</style>
