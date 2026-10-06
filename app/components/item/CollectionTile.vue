<script setup lang="ts">
/** A public collection in a browse grid: cover card, name and piece count. */
defineProps<{
  value: { id_string: string; name?: string; items?: unknown[] | null }
  cover?: string | null
  failed?: boolean
}>()
defineEmits<{ (e: 'error'): void }>()
</script>

<template>
  <div class="cl-tile">
    <NuxtLinkLocale class="card" :to="`/collections/${value.id_string}`" :title="value.name || $t('common.untitled')">
      <div class="square">
        <div class="inside card-pad">
          <img
              v-if="cover && !failed"
              :src="cover"
              :alt="value.name || $t('c_CollectionTile.collection')"
              class="size-full"
              loading="lazy"
              decoding="async"
              @error="$emit('error')"
          >
          <div v-else class="card-empty"><span class="icon icon-rhombus"/></div>
        </div>
      </div>
    </NuxtLinkLocale>
    <NuxtLinkLocale class="cl-tile-name" :to="`/collections/${value.id_string}`">
      {{ value.name || $t('common.untitled') }}
    </NuxtLinkLocale>
    <span class="cl-tile-n">
      {{ $t('p_collections.pieceCount', (value.items || []).length, {count: (value.items || []).length}) }}
    </span>
  </div>
</template>

<style scoped>
.cl-tile {
  min-width: 0;
}

.cl-tile-name {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-tile-n {
  display: block;
  font-size: var(--text-2xs);
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .cl-tile-name:hover {
    color: var(--primary);
  }
}
</style>
