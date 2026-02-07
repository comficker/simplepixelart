<script setup lang="ts">
import {onMounted, ref, watch} from "vue";
import type {EditorData} from "~/types";
import {drawThumbnail} from "~/helper/canvas";

const props = defineProps<{
  data: EditorData
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

const defaultSize = computed(() => props.data.width > props.data.height ? props.data.width : props.data.height)

function draw() {
  if (!canvas.value || !ctx.value || !props.data) return

  const canvasSize = defaultSize.value

  canvas.value.width = canvasSize
  canvas.value.height = canvasSize

  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height)

  drawThumbnail(canvas.value!, props.data)
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
    <canvas
        ref="canvas"
        :style="{ width: defaultSize + 'px', height: defaultSize + 'px'}"
        class="thumbnail-canvas"
    />
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.thumb {
  @apply inline-block size-full;
}

.thumbnail-canvas {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}
</style>