<template>
  <nav class="studio-paths" :style="{'--tp-cols': shown.length}" :aria-label="$t('c_ToolPaths.pixelArtTools')">
    <NuxtLinkLocale
        v-for="t in shown"
        :key="t.key"
        :to="t.to"
        class="studio-path"
        :style="{'--ic-1': t.c1, '--ic-2': t.c2}"
    >
      <span class="studio-path-icon icon" :class="t.icon"/>
      <span class="studio-path-title">{{ $t(t.i18n) }}</span>
    </NuxtLinkLocale>
  </nav>
</template>

<script setup lang="ts">
import {TOOLS, type ToolKey} from '~/helper/tools'

const props = defineProps<{ exclude?: ToolKey | ToolKey[] }>()

const shown = computed(() => {
  const ex = new Set(Array.isArray(props.exclude) ? props.exclude : props.exclude ? [props.exclude] : [])
  return TOOLS.filter(t => !ex.has(t.key))
})
</script>

<style scoped>
.studio-paths {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
}

@media (min-width: 900px) {

  .studio-paths { grid-template-columns: repeat(var(--tp-cols, 7), minmax(0, 1fr)); }
}

.studio-path {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-2);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .studio-path:hover {
    border-color: color-mix(in oklab, var(--ic-2) 55%, var(--border));
  }
}

.studio-path-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  font-size: 24px;
  color: #fff;

  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 55%),
    linear-gradient(160deg, var(--ic-1), var(--ic-2));
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 2px 6px -2px var(--ic-2);
}

/* The tool grid is secondary navigation; below 900px it was eating 227px of the
   first viewport and pushing the gallery out of sight. */
@media (max-width: 899px) {
  .studio-path {
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2);
  }

  .studio-path-icon {
    width: 36px;
    height: 36px;
    font-size: var(--text-lg);
    border-radius: 10px;
  }
}

/* Phones: every tool on one row that scrolls sideways, each just its icon
   and name -- no tile around it -- so the row costs one icon's height
   instead of pushing the gallery out of the first screen. */
@media (max-width: 767px) {
  .studio-paths {
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .studio-paths::-webkit-scrollbar {
    display: none;
  }

  .studio-path {
    flex: 0 0 calc(var(--space-6) * 2.5);
    gap: var(--space-1);
    padding: var(--space-1) 0;
    background: transparent;
    border: 0;
    scroll-snap-align: start;
  }
}

.studio-path-title {
  font-family: var(--font-display);
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--foreground);
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
