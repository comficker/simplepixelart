<template>
  <nuxt-link class="card" :to="to" :title="value.name">
    <div class="square">
      <div class="inside card-pad">
        <img
            v-if="!isDraw && !imgError"
            :src="src"
            :alt="value.name || 'Pixel art artwork'"
            class="size-full"
            width="200"
            height="200"
            :loading="priority ? 'eager' : 'lazy'"
            :fetchpriority="priority ? 'high' : 'auto'"
            decoding="async"
            @error="imgError = true"
        />
        <div v-else-if="!isDraw && imgError" class="card-empty" aria-label="No preview yet">
          <span class="icon icon-image"/>
        </div>
        <canvas
            v-else
            :id="`canvas_${value.id}`"
            class="size-full"
            width="200"
            height="200"
            :aria-label="value.name || 'Pixel art preview'"
        />
        <span v-if="isAnim" class="card-anim-badge" title="Animated artwork">
          <svg viewBox="0 0 24 24" width="10" height="10"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          <span>GIF</span>
        </span>
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

const imgError = ref(false)

const src = computed(() => {
  return `${config.public.api}/coloring/files/art-original/${value.id_string}.png`
})
// Reset the error state if the artwork (and thus its image URL) changes.
watch(src, () => { imgError.value = false })
const to = computed(() => {
  return (isDraw || isRemix) ? `/editor?id=${value.id_string || value.id}` : `/art/${value.id_string}`
})
const isAnim = computed(() => (((value.meta as any)?.animation?.frames?.length) || 0) > 1)
</script>

<style>
.card {
  display: block;
  position: relative;
  image-rendering: pixelated;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  transition: --fold-size 220ms cubic-bezier(.22,.61,.36,1);
  /* Truly cut the top-right corner: the page behind shows through, no color faking.
   * 10px along the 225° axis = the diagonal of the 14px flap below. */
  --fold-size: 14px;
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
}

@media (hover: hover) and (pointer: fine) {
  .card:hover {
    --fold-size: 28px;
  }
}

/* Clip contents on the inner box so the folded corner can sit over the border. */
.card .square {
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

/* Folded "file" flap over the cut corner; its diagonal edge sits flush at the mask cut. */
.card::after {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: var(--fold-size);
  height: var(--fold-size);
  background: linear-gradient(
    225deg,
    var(--border) calc(50% + 1.25px),
    var(--surface) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}



.card .size-full {
  transition: transform 320ms cubic-bezier(.22,.61,.36,1);
}

.card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 35%, transparent), var(--shadow);
}

.card-pad {
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Shown when the art has no rendered image yet (empty draft / 404). */
.card-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.card-empty .icon {
  width: 32px;
  height: 32px;
}

.card .size-full {
  object-fit: contain;
}

/* Top-left: the folded file corner owns the top-right. */
.card-anim-badge {
  position: absolute;
  top: 5px;
  left: 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
  background: rgba(0, 0, 0, 0.62);
  border-radius: var(--radius-pill);
  pointer-events: none;
}
</style>