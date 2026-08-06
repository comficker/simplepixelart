<template>
  <nav class="studio-paths" :style="{'--tp-cols': shown.length}" aria-label="Pixel art tools">
    <nuxt-link
        v-for="t in shown"
        :key="t.key"
        :to="t.to"
        class="studio-path"
        :style="{'--ic-1': t.c1, '--ic-2': t.c2}"
    >
      <span class="studio-path-icon icon" :class="t.icon"/>
      <span class="studio-path-title">{{ t.title }}</span>
    </nuxt-link>
  </nav>
</template>

<script setup lang="ts">
// The one list of studio tools — home and every tool page render from here.
// Colors ride with the tool (not nth-child) so excluding one never reshuffles.
const TOOLS = [
  {key: 'draw', to: '/editor?new=true', icon: 'icon-pen', title: 'Draw', c1: '#7c8cff', c2: '#4f46e5'},
  {key: 'convert', to: '/convert', icon: 'icon-image', title: 'Convert', c1: '#34d399', c2: '#0d9488'},
  {key: 'slicer', to: '/tilesets/slicer', icon: 'icon-grid', title: 'Slicer', c1: '#fbbf24', c2: '#d97706'},
  {key: 'tileset', to: '/tilesets/editor', icon: 'icon-grid', title: 'Tileset', c1: '#c084fc', c2: '#7c3aed'},
  {key: 'tilemap', to: '/tilemaps/editor', icon: 'icon-rhombus', title: 'Tilemap', c1: '#fb7185', c2: '#e11d48'},
  {key: 'palettes', to: '/palettes', icon: 'icon-bucket', title: 'Palettes', c1: '#22d3ee', c2: '#0891b2'},
  {key: 'extract', to: '/palettes/color-palette-from-image', icon: 'icon-auto-fix', title: 'Extract', c1: '#f472b6', c2: '#db2777'},
] as const

type ToolKey = typeof TOOLS[number]['key']

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
  /* One row: as many columns as tools shown (7 on home, 6 inside a tool). */
  .studio-paths { grid-template-columns: repeat(var(--tp-cols, 7), minmax(0, 1fr)); }
}

/* App-icon tile card: colored rounded glyph tile above a small label. */
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
  /* App-icon sheen: accent gradient (--ic) with a soft top highlight. */
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 55%),
    linear-gradient(160deg, var(--ic-1), var(--ic-2));
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.4),
    0 2px 6px -2px var(--ic-2);
}

.studio-path-title {
  font-family: var(--font-display);
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--foreground);
  line-height: 1.2;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
