<template>
  <div class="card-wrapper group/card">
    <nuxt-link class="card" :to="to" :title="value.name">
      <div class="square group">
        <div class="inside p-2">
          <img
              v-if="!isDraw"
              :src="src" :alt="value.name"
              class="size-full"
              loading="lazy"
              decoding="async"
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
      <div class="card-head">
        <div class="card-title">
          <p>{{ value.name || value.id_string || "Untitled" }}</p>
        </div>
      </div>
    </nuxt-link>
    <nuxt-link
        v-if="!isDraw"
        :to="`/editor?id=${value.id_string || value.id}`"
        class="card-remix"
        title="Remix this pixel art"
        @click.stop
    >
      <span class="icon icon-brush"/>
      <span>Remix</span>
    </nuxt-link>
  </div>
</template>

<script setup lang="ts">
import type {SharedPage} from "~/types";

const {value, isDraw, isRemix, isAdding, added, showVote} = defineProps<{
  value: SharedPage, isDraw?: boolean, isRemix?: boolean, isAdding?: boolean, added?: boolean, showVote?: boolean
}>()
const config = useRuntimeConfig()

const src = computed(() => {
  return `${config.public.api}/coloring/files/art-original/${value.id_string}.png`
})
const to = computed(() => {
  return (isDraw || isRemix) ? `/editor?id=${value.id_string || value.id}` : `/art/${value.id_string}`
})
</script>

<style>
@reference "tailwindcss";

.card-wrapper {
  @apply relative;
}

.card {
  @apply block overflow-hidden;
  image-rendering: pixelated;
  border: 2px solid var(--shadow-px);
  background: var(--surface);
  box-shadow: 3px 3px 0 0 var(--shadow-px);
  transition: transform 80ms steps(2), box-shadow 80ms steps(2);
}

.card-wrapper:hover .card {
  transform: translate(-3px, -3px);
  box-shadow: 6px 6px 0 0 var(--shadow-px);
  border-color: var(--primary);
}

.card.selected {
  border-color: var(--primary);
  box-shadow: 4px 4px 0 0 var(--secondary);
}

.card-head {
  @apply py-1 p-2 text-xs overflow-hidden;
  background: var(--surface);
  color: var(--foreground);
  border-top: 1px solid var(--border);
}

.card-title p {
  @apply truncate;
}

.card .size-full {
  @apply object-contain;
}

.card-remix {
  @apply absolute bottom-8 right-1 flex items-center gap-1 px-2 py-1 text-xs;
  @apply opacity-0 transition-opacity;
  background: var(--primary);
  color: var(--primary-foreground, #fff);
  border: 1px solid var(--shadow-px);
  z-index: 10;
}

.card-wrapper:hover .card-remix {
  @apply opacity-100;
}
</style>