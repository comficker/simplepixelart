<script setup lang="ts">
import type {Palette} from "~/types";

const {value} = defineProps<{ value: Palette }>()

// Cap the swatches shown so a 200-color palette doesn't render hair-thin slivers.
const MAX_SWATCHES = 24
const shown = computed(() => value.colors.slice(0, MAX_SWATCHES))
const overflow = computed(() => Math.max(0, value.colors.length - MAX_SWATCHES))
</script>

<template>
  <nuxt-link class="pcard" :to="`/palettes/${value.id_string}`" :title="value.name">
    <div class="pcard-strip">
      <span
          v-for="(c, i) in shown"
          :key="i"
          class="pcard-sw"
          :style="{ backgroundColor: c }"
      />
    </div>
    <div class="pcard-head">
      <p class="pcard-name">{{ value.name || value.id_string || 'Untitled' }}</p>
      <div class="pcard-meta">
        <span>{{ value.color_count }} colors</span>
        <template v-if="overflow"><span class="pcard-dot">·</span><span>+{{ overflow }}</span></template>
        <template v-if="value.usage_count"><span class="pcard-dot">·</span><span>{{ value.usage_count }} uses</span></template>
      </div>
    </div>
  </nuxt-link>
</template>

<style scoped>
.pcard {
  display: block;
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: transform 220ms cubic-bezier(.22,.61,.36,1), border-color 180ms ease;
}



.pcard-strip {
  display: flex;
  height: 92px;
  width: 100%;
}

.pcard-sw {
  flex: 1 1 0;
  min-width: 0;
}

.pcard-head {
  padding: 0.5rem 0.625rem;
  border-top: 1px solid var(--border);
}

.pcard-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  font-weight: 600;
  letter-spacing: -0.005em;
}

.pcard-meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: 0.125rem;
  font-size: var(--text-2xs);
  color: var(--muted);
  font-weight: 600;
}

.pcard-dot { opacity: 0.6; }
</style>
