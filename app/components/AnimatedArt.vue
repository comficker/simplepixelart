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
let timer: ReturnType<typeof setTimeout> | null = null
const idx = ref(0)
const playing = ref(true)
/** Playback rate; 1 plays at the artwork's own timing. */
const speed = ref(1)
/** Starts as the artwork's own setting; the viewer may override it. */
const looping = ref(props.loop !== false)

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

function stop() {
  if (timer) clearTimeout(timer)
  timer = null
}

function tick() {
  stop()
  const f = props.frames[idx.value]
  const dur = (f?.duration ?? Math.round(1000 / (props.fps || 10))) / speed.value
  timer = setTimeout(() => {
    if (!playing.value) return
    let next = idx.value + 1
    if (next >= props.frames.length) {
      if (!looping.value) {
        playing.value = false
        return
      }
      next = 0
    }
    seek(next)
    tick()
  }, dur)
}

function seek(i: number) {
  const n = props.frames.length
  idx.value = ((i % n) + n) % n
  drawFrame(idx.value)
}

function play() {
  if (props.frames.length < 2) return
  // A one-shot that already ran to its end would stop again on the very next
  // tick, which read as a dead play button. Start it over instead.
  if (!looping.value && idx.value >= props.frames.length - 1) seek(0)
  playing.value = true
  tick()
}

function pause() {
  playing.value = false
  stop()
}

function toggle() {
  if (playing.value) pause()
  else play()
}

function restart() {
  seek(0)
  playing.value = false
  play()
}

/** Steps pause playback: a frame-by-frame look is the point of stepping. */
function step(d: number) {
  pause()
  seek(idx.value + d)
}

function setSpeed(v: number) {
  speed.value = v
  if (playing.value) tick()
}

function setLooping(v: boolean) {
  looping.value = v
}

function start() {
  stop()
  looping.value = props.loop !== false
  seek(0)
  playing.value = props.frames.length > 1
  if (playing.value) tick()
}

defineExpose({idx, playing, speed, looping, play, pause, toggle, restart, step, seek, setSpeed, setLooping})

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
  <div class="anim-art" @click="toggle" :title="playing ? $t('c_AnimatedArt.pause') : $t('c_AnimatedArt.play')">
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
