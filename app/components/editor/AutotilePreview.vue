<script setup lang="ts">
// The autotile preview mode: a sample map painted with the board's terrain
// and joined by the tilemap's own rules (helper/previews/autotile).
import {drawAutotile, guessTerrainType, sampleCells} from '~/helper/previews/autotile'
import type {PreviewMeta} from '~/helper/previews'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  opts: PreviewMeta
}>()

const cv = ref<HTMLCanvasElement | null>(null)

function paint() {
  const c = cv.value, src = props.art()
  if (!c || !src) return
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr))
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  const o = props.opts
  const type = o.terrainType === 'auto' ? guessTerrainType(src.width, src.height) : o.terrainType
  drawAutotile(c.getContext('2d')!, src, w, h, type, sampleCells(o.sampleMap, o.seed))
}

watch(() => [props.rev, props.opts], () => requestAnimationFrame(paint), {deep: true})
onMounted(() => requestAnimationFrame(paint))
</script>

<template>
  <canvas ref="cv" class="preview-fill"/>
</template>
