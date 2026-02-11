<template>
  <nuxt-link class="card" :to="to" :title="value.name">
    <div class="square group">
      <div class="inside p-2">
        <img
            v-if="!isDraw"
            :src="src" :alt="value.name"
            class="size-full"
        />
        <canvas
            v-else
            :id="`canvas_${value.id}`"
            class="size-full"
            width="200"
            height="200"
        />
      </div>
    </div>
    <div class="card-head group-hover:translate-y-0">
      <div class="card-title">
        <h4>{{ value.name || value.id_string || "Untitled" }}</h4>
      </div>
    </div>
  </nuxt-link>
</template>

<script setup lang="ts">
import type {SharedPage} from "~/types";

const {value, isDraw, isAdding, added, showVote} = defineProps<{
  value: SharedPage, isDraw?: boolean, isAdding?: boolean, added?: boolean, showVote?: boolean
}>()
const config = useRuntimeConfig()

const src = computed(() => {
  return `${config.public.api}/coloring/files/art-original/${value.id_string}.png`
})
const to = computed(() => {
  return isDraw ? `/editor?id=${value.id_string || value.id}` : `/art/${value.id_string}`
})
</script>

<style>
@reference "tailwindcss";

.card {
  @apply block overflow-hidden border;
  image-rendering: pixelated;
}

.card.selected {
  @apply border-blue-500;
}

.card-head {
  @apply py-1 p-2 text-xs bg-gray-50/80 border-t overflow-hidden;
}

.card-title h4 {
  @apply truncate;
}

.card .size-full {
  @apply object-contain;
}
</style>