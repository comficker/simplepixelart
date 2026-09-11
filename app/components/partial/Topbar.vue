<script setup lang="ts">
const route = useRoute()
const routePaths = new Set(useRouter().getRoutes().map(r => r.path))

// A segment whose own path is not a page, but which has an obvious home:
// /art/<slug> lives under the gallery, so its crumb should lead there rather
// than sit dead because /art itself does not exist.
const CRUMB_TARGET: Record<string, string> = {
  art: '/arts',
}

const LABELS: Record<string, string> = {
  arts: 'Discovery', art: 'Discovery', work: 'Your work', editor: 'Editor',
  converter: 'Converter', generator: 'Generator',
  tilesets: 'Tilesets', slicer: 'Slicer', tilemaps: 'Tilemaps',
  palettes: 'Palettes', challenges: 'Challenges', creator: 'Creators', settings: 'Settings',
  collections: 'Collections', missions: 'Missions', tag: 'Tags',
  'easy-pixel-art': 'Easy pixel art',
  'color-palette-from-image': 'Extract', 'color-palette-from-color': 'By color',
}

const config = useRuntimeConfig()
const siteUrl = (config.public.siteUrl as string) || 'https://simplepixelart.com'

const crumbs = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  return parts.map((seg, i) => {
    const own = '/' + parts.slice(0, i + 1).join('/')
    const to = (i < parts.length - 1 && CRUMB_TARGET[seg]) || own
    return {
      to,
      linked: routePaths.has(to),
      label: LABELS[seg] || decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase()),
    }
  })
})

useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: computed(() => JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: 'Home', item: siteUrl},
        ...crumbs.value.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 2,
          name: c.label,
          item: `${siteUrl}${c.to}`,
        })),
      ],
    })),
  }],
})
</script>

<template>
  <div class="dash-top">
    <nav class="dash-crumbs" aria-label="Breadcrumb">
      <nuxt-link to="/" class="dash-crumb">Home</nuxt-link>
      <template v-for="(c, i) in crumbs" :key="c.to">
        <span class="icon icon-chevron-right dash-crumb-sep" aria-hidden="true"/>
        <nuxt-link v-if="i < crumbs.length - 1 && c.linked" :to="c.to" class="dash-crumb">{{ c.label }}</nuxt-link>
        <span v-else class="dash-crumb" :class="{'is-current': i === crumbs.length - 1}" :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
      </template>
    </nav>
    <div class="dash-top-ctl">
      <PartialNotifyBell/>
      <WalletMenu/>
      <PartialSocialAuth/>
    </div>
  </div>
</template>

<style>
.dash-top {
  display: none;
}

@media (min-width: 1024px) {
  .dash-top {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-3);
    height: var(--bar-h);
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
}

.dash-crumbs {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--muted);
}

.dash-crumb {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--muted);
  transition: color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  a.dash-crumb:hover {
    color: var(--primary);
  }
}

.dash-crumb.is-current {
  color: var(--foreground);
}

.dash-crumb-sep {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: color-mix(in oklab, var(--muted) 60%, transparent);
}

.dash-top-ctl {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: auto;
}
</style>
