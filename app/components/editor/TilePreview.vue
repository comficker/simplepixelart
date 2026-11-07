<script setup lang="ts">
// The tiled preview mode: the board repeated n×n, to check that a tile or
// pattern meets itself without seams.
const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  repeat: number
}>()

const cv = ref<HTMLCanvasElement | null>(null)

function paint() {
  const c = cv.value, src = props.art()
  if (!c || !src) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const n = Math.max(2, Math.min(8, props.repeat || 3))
  const tw = src.width, th = src.height
  const s = Math.min(w / (tw * n), h / (th * n))
  const ox = (w - tw * n * s) / 2, oy = (h - th * n * s) / 2
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = false
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      ctx.drawImage(src, 0, 0, tw, th, ox + x * tw * s, oy + y * th * s, tw * s, th * s)
}

watch(() => [props.rev, props.repeat], () => requestAnimationFrame(paint))
onMounted(() => requestAnimationFrame(paint))
</script>

<template>
  <canvas ref="cv" class="preview-fill"/>
</template>
