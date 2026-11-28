<template>
  <!-- Tag tiles: a cover art, the tag and its count. Without rows yet it
       draws `slots` placeholders of the same size, so the grid keeps its
       height while the rows load. -->
  <ul class="tag-grid">
    <template v-if="tags">
      <li v-for="(t, i) in tags" :key="t.slug">
        <NuxtLinkLocale :to="`/arts/${t.slug}`" class="tag-tile" :title="t.title">
          <span class="tag-tile-thumb">
            <img
                v-if="t.cover"
                :src="artImage({id_string: t.cover.slug, updated: t.cover.updated})"
                :alt="artAlt(t.cover.name, t.title)"
                width="96"
                height="96"
                :loading="eager > i ? 'eager' : 'lazy'"
                decoding="async"
                :fetchpriority="eager > i ? 'auto' : 'low'"
            >
          </span>
          <span class="tag-tile-name">{{ t.title }}</span>
          <span class="tag-tile-count">{{ $t('p_index.tagArtCount', {count: compact(t.count)}, t.count) }}</span>
        </NuxtLinkLocale>
      </li>
    </template>
    <template v-else>
      <li v-for="n in slots" :key="n" aria-hidden="true">
        <span class="tag-tile is-ghost">
          <span class="tag-tile-thumb"/>
          <span class="tag-tile-name">&nbsp;</span>
          <span class="tag-tile-count">&nbsp;</span>
        </span>
      </li>
    </template>
  </ul>
</template>

<script setup lang="ts">
import type {HomeTag} from '~~/server/api/home-tags.get'

// `eager`: how many covers load straight away (a page that opens on the grid);
// the home page, where the grid is below the fold, leaves them all lazy.
withDefaults(defineProps<{ tags: HomeTag[] | null, slots?: number, eager?: number }>(), {slots: 20, eager: 0})

const {locale} = useI18n()
const artImage = useArtImage()
const artAlt = useArtAlt()
const compact = (n: number) => new Intl.NumberFormat(locale.value, {notation: 'compact', maximumFractionDigits: 1}).format(n)
</script>

<style scoped>
.tag-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tag-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.tag-tile-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  margin-bottom: var(--space-1);
  padding: 14%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2, var(--background));
  overflow: hidden;
  transition: border-color var(--transition);
}

.tag-tile-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.tag-tile-name {
  overflow: hidden;
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tag-tile-count {
  font-size: var(--text-2xs);
  color: var(--muted);
}

.tag-tile.is-ghost .tag-tile-thumb {
  animation: tag-tile-pulse 1.4s ease-in-out infinite;
}

@keyframes tag-tile-pulse {
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .tag-tile.is-ghost .tag-tile-thumb { animation: none; }
}

@media (hover: hover) and (pointer: fine) {
  .tag-tile:hover .tag-tile-thumb {
    border-color: var(--foreground);
  }
  .tag-tile:hover .tag-tile-name {
    color: var(--primary);
  }
}
</style>
