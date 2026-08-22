<script setup lang="ts">
import {onMounted, ref, watch} from "vue";
import type {EditorData} from "~/types";
import {layers2MapNumbers} from "~/helper/canvas";

const props = defineProps<{
  data: EditorData
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

function draw() {
  if (!canvas.value || !ctx.value || !props.data) return

  const w = props.data.width
  const h = props.data.height
  const size = Math.max(w, h)
  const zoom = 8
  const cw = size * zoom
  canvas.value.width = cw
  canvas.value.height = cw

  ctx.value.fillStyle = '#ffffff'
  ctx.value.fillRect(0, 0, cw, cw)

  const ox = Math.floor((size - w) / 2) * zoom
  const oy = Math.floor((size - h) / 2) * zoom

  const results = layers2MapNumbers(props.data)
  for (const [key, pixelIndex] of Object.entries(results)) {
    const [x = 0, y = 0] = key.split('_').map(Number)
    ctx.value.fillStyle = props.data.colors[pixelIndex as number] ?? '#000000'
    ctx.value.fillRect(ox + x * zoom, oy + y * zoom, zoom, zoom)
  }
}

onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d')
    ctx.value!.imageSmoothingEnabled = false
    draw()
  }
})

watch(() => props.data, () => {
  draw()
}, {deep: true})
</script>

<template>
  <div class="thumb">
    <canvas ref="canvas" class="thumbnail-canvas"/>
  </div>
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  height: 100%;
}

.thumbnail-canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
</style>