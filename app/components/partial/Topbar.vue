<script setup lang="ts">
const desktop = useIsDesktop()
const route = useRoute()
const routePaths = new Set(useRouter().getRoutes().map(r => r.path))

// A segment whose own path is not a page, but which has an obvious home:
// /art/<slug> lives under the gallery, so its crumb should lead there rather
// than sit dead because /art itself does not exist.
const CRUMB_TARGET: Record<string, string> = {
  art: '/arts',
}

const {t, locales} = useI18n()
const LOCALE_SEGMENTS = new Set((locales.value as {code: string}[]).map(l => l.code))

const LABELS: Record<string, string> = {
  arts: 'nav.discovery', art: 'nav.discovery', work: 'nav.yourWork', editor: 'crumb.editor',
  converter: 'nav.converter', generator: 'nav.generator',
  tilesets: 'crumb.tilesets', slicer: 'nav.slicer', tilemaps: 'crumb.tilemaps',
  palettes: 'nav.palettes', challenges: 'nav.challenges', creator: 'crumb.creators', settings: 'common.settings',
  'creator-program': 'crumb.creatorProgram',
  collections: 'crumb.collections', missions: 'crumb.missions', tag: 'common.tags',
  'easy-pixel-art': 'crumb.easyPixelArt',
  'color-palette-from-image': 'nav.extract', 'color-palette-from-color': 'crumb.byColor',
}

const localePath = useLocalePath()
const config = useRuntimeConfig()
const siteUrl = (config.public.siteUrl as string) || 'https://simplepixelart.com'

const crumbs = computed(() => {
  // The locale prefix is not a page, so /ja/editor should read "Editor",
  // not "Ja > Editor".
  const parts = route.path.split('/').filter(Boolean).filter((seg, i) => !(i === 0 && LOCALE_SEGMENTS.has(seg)))
  return parts.map((seg, i) => {
    const own = '/' + parts.slice(0, i + 1).join('/')
    const to = (i < parts.length - 1 && CRUMB_TARGET[seg]) || own
    return {
      to,
      linked: routePaths.has(to),
      label: LABELS[seg] ? t(LABELS[seg]) : decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase()),
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
        {'@type': 'ListItem', position: 1, name: t('common.home'), item: `${siteUrl}${localePath('/')}`},
        // A crumb with no page of its own (/tilesets, /palettes/tag) gets no
        // URL; the last one is this page, under its locale prefix.
        ...crumbs.value.map((c, i, all) => {
          const item = i === all.length - 1 ? `${siteUrl}${route.path}` : c.linked ? `${siteUrl}${localePath(c.to)}` : undefined
          return {'@type': 'ListItem', position: i + 2, name: c.label, ...(item ? {item} : {})}
        }),
      ],
    })),
  }],
})
</script>

<template>
  <div class="dash-top">
    <nav class="dash-crumbs" :aria-label="$t('c_Topbar.breadcrumb')">
      <NuxtLinkLocale to="/" class="dash-crumb">{{ $t('common.home') }}</NuxtLinkLocale>
      <template v-for="(c, i) in crumbs" :key="c.to">
        <span class="icon icon-chevron-right dash-crumb-sep" aria-hidden="true"/>
        <NuxtLinkLocale v-if="i < crumbs.length - 1 && c.linked" :to="c.to" class="dash-crumb">{{ c.label }}</NuxtLinkLocale>
        <span v-else class="dash-crumb" :class="{'is-current': i === crumbs.length - 1}" :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
      </template>
    </nav>
    <div class="dash-top-ctl">
      <PartialTopPrefs/>
      <PartialSocialAuth compact/>
      <!-- Balance and notifications only exist once signed in, so they sit
           last and the bar does not reflow when they appear. -->
      <template v-if="desktop !== false">
        <PartialNotifyBell/>
        <WalletMenu/>
      </template>
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
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: color-mix(in oklab, var(--muted) 60%, transparent);
}

/* No gap: each control's own padding is the spacing, so the row reads as one
   strip of hit areas rather than floating labels. The padding is trimmed here
   only -- .hdr-link and .btn are site-wide chrome and keep their own size
   everywhere else. */
.dash-top-ctl {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: auto;
}

/* SocialAuth brings its own gap for the footer; in the bar the padding does
   the spacing there too. */
.dash-top-ctl .social-auth {
  gap: 0;
}

.dash-top-ctl .hdr-link {
  padding: var(--space-1) var(--space-2);
}

/* The bar's own controls carry the base 20px icon; the menus they open keep
   theirs. */
.dash-top .dash-top-ctl :is(.hdr-link, .wallet-chip) > .icon {
  width: var(--space-5);
  height: var(--space-5);
}

/* Active reads by colour and fill alone here; the outline made the current
   page's icon look like a pressed button. */
.dash-top-ctl .hdr-link.router-link-active {
  box-shadow: none;
}

.dash-top-ctl .btn {
  padding: var(--space-1) var(--space-3);
}

.dash-top-ctl .social-sep {
  margin: 0 var(--space-2);
}
</style>
