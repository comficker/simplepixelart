<script setup lang="ts">
/** A public collection in a browse grid: one card with a cover (a mosaic of
 *  its first pieces when there are four) and its name and piece count,
 *  laid out like the palette cards. */
const props = defineProps<{
  value: { id_string: string; name?: string; title?: string; items?: unknown[] | null }
  cover?: string | null
  mosaic?: string[] | null
  failed?: boolean
}>()
defineEmits<{ (e: 'error'): void }>()
const name = computed(() => props.value.name || props.value.title || '')
const count = computed(() => (props.value.items || []).length)
</script>

<template>
  <NuxtLinkLocale class="cl-card" :to="`/collections/${value.id_string}`" :title="name || $t('common.untitled')">
    <div class="cl-cover">
      <div v-if="mosaic && mosaic.length >= 4 && !failed" class="cl-mosaic">
        <img v-for="(src, i) in mosaic.slice(0, 4)" :key="i" :src="src" alt="" loading="lazy" decoding="async">
      </div>
      <img
          v-else-if="cover && !failed"
          :src="cover"
          :alt="name || $t('c_CollectionTile.collection')"
          class="cl-single"
          loading="lazy"
          decoding="async"
          @error="$emit('error')"
      >
      <div v-else class="card-empty"><span class="icon icon-rhombus"/></div>
    </div>
    <div class="cl-head">
      <p class="cl-name">{{ name || $t('common.untitled') }}</p>
      <p class="cl-meta">{{ $t('p_collections.pieceCount', count, {count}) }}</p>
    </div>
  </NuxtLinkLocale>
</template>

<style scoped>
.cl-card {
  display: block;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: transform 220ms cubic-bezier(.22,.61,.36,1), border-color 180ms ease;
}

/* A grey ground, so pale art (white 1-bit sprites) still shows. */
.cl-cover {
  position: relative;
  aspect-ratio: 1 / 1;
  background: var(--surface-2);
}

.cl-mosaic {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 1px;
  background: var(--border);
}

.cl-mosaic img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
  padding: var(--space-2);
  background: var(--surface-2);
  image-rendering: pixelated;
}

.cl-single {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: var(--space-3);
  image-rendering: pixelated;
}

.cl-head {
  padding: var(--space-2) 0.625rem;
  border-top: 1px solid var(--border);
}

.cl-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: -0.005em;
}

.cl-meta {
  margin-top: 0.125rem;
  font-size: var(--text-2xs);
  color: var(--muted);
  font-weight: 600;
}

@media (hover: hover) and (pointer: fine) {
  .cl-card:hover { border-color: var(--primary); }
}
</style>
