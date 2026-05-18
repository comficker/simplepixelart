<template>
  <nuxt-link class="card" :to="to" :title="value.name">
    <div class="square">
      <div class="inside card-pad">
        <img
            v-if="!isDraw"
            :src="src"
            :alt="value.name || 'Pixel art artwork'"
            class="size-full"
            width="200"
            height="200"
            :loading="priority ? 'eager' : 'lazy'"
            :fetchpriority="priority ? 'high' : 'auto'"
            decoding="async"
        />
        <canvas
            v-else
            :id="`canvas_${value.id}`"
            class="size-full"
            width="200"
            height="200"
            :aria-label="value.name || 'Pixel art preview'"
        />
      </div>
    </div>
    <div class="card-head">
      <div class="card-title">
        <p>{{ value.name || value.id_string || "Untitled" }}</p>
      </div>
    </div>
  </nuxt-link>
</template>

<script setup lang="ts">
import type {SharedPage} from "~/types";

const {value, isDraw, isRemix, priority, isAdding, added, showVote} = defineProps<{
  value: SharedPage, isDraw?: boolean, isRemix?: boolean, priority?: boolean, isAdding?: boolean, added?: boolean, showVote?: boolean
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
.card {
  display: block;
  image-rendering: pixelated;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition:
    transform 260ms cubic-bezier(.34,1.56,.64,1),
    box-shadow 220ms cubic-bezier(.22,.61,.36,1),
    border-color 180ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-hover);
    border-color: var(--primary);
  }

  .card:hover .size-full {
    transform: scale(1.02);
  }
}

.card .size-full {
  transition: transform 320ms cubic-bezier(.22,.61,.36,1);
}

.card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent), var(--shadow);
}

.card-pad {
  padding: 0.5rem;
  aspect-ratio: 1;
}

.card-head {
  padding: 0.25rem 0.5rem;
  overflow: hidden;
  background: var(--surface);
  color: var(--foreground);
  border-top: 1px solid var(--border);
}

.card-title p {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 600;
  letter-spacing: -0.005em;
}

.card .size-full {
  object-fit: contain;
}
</style>