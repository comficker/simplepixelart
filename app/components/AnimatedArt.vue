<script setup lang="ts">
import {compositeFrame} from "~/helper/canvas";
import type {AnimationFrame} from "~/types";

const props = defineProps<{
  frames: AnimationFrame[];
  width: number;
  height: number;
  colors: string[];
  shared?: any[];
  fps?: number;
  loop?: boolean;
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let frameCanvases: HTMLCanvasElement[] = []
let idx = 0
let timer: ReturnType<typeof setTimeout> | null = null
const playing = ref(true)

function buildFrames() {
  const shared = props.shared || []
  frameCanvases = props.frames.map(f => {
    const c = document.createElement('canvas')
    compositeFrame(c, [...shared, ...f.layers], props.width, props.height, props.colors)
    return c
  })
}

function drawFrame(i: number) {
  if (!ctx || !canvas.value || !frameCanvases[i]) return
  ctx.clearRect(0, 0, props.width, props.height)
  ctx.drawImage(frameCanvases[i]!, 0, 0)
}

function tick() {
  const f = props.frames[idx]
  const dur = f?.duration ?? Math.round(1000 / (props.fps || 10))
  timer = setTimeout(() => {
    if (!playing.value) return
    let next = idx + 1
    if (next >= props.frames.length) {
      if (props.loop === false) {
        playing.value = false
        return
      }
      next = 0
    }
    idx = next
    drawFrame(idx)
    tick()
  }, dur)
}

function start() {
  stop()
  idx = 0
  playing.value = true
  drawFrame(0)
  if (props.frames.length > 1) tick()
}

function stop() {
  if (timer) clearTimeout(timer)
  timer = null
}

function toggle() {
  playing.value = !playing.value
  if (playing.value) tick()
  else stop()
}

onMounted(() => {
  if (!canvas.value) return
  canvas.value.width = props.width
  canvas.value.height = props.height
  ctx = canvas.value.getContext('2d')
  if (ctx) ctx.imageSmoothingEnabled = false
  buildFrames()
  start()
})

watch(() => props.frames, () => {
  buildFrames()
  start()
})

onUnmounted(stop)
</script>

<template>
  <div class="anim-art" @click="toggle" :title="playing ? 'Pause' : 'Play'">
    <canvas ref="canvas" class="anim-art-canvas"/>
    <span v-if="!playing" class="anim-art-play" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="40" height="40"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
    </span>
  </div>
</template>

<style scoped>
.anim-art {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.anim-art-canvas {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
  display: block;
}

.anim-art-play {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  pointer-events: none;
}
</style>
