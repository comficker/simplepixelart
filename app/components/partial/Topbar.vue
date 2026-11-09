<script setup lang="ts">
import useStatefulCookie from '~/composables/useStatefulCookie'

const desktop = useIsDesktop()
const auth = useAuthStore()
const sideState = useStatefulCookie('dash_side')
const sideCollapsed = computed(() => sideState.value === 'collapsed')
function toggleSide() {
  sideState.value = sideCollapsed.value ? 'open' : 'collapsed'
}
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
  'easy-pixel-art': 'crumb.easyPixelArt', ideas: 'crumb.ideas', learn: 'crumb.learn', 'how-to-make-pixel-art': 'crumb.howToMakePixelArt', 'color-by-number': 'crumb.colorByNumber',
  'color-palette-from-image': 'nav.extract', 'color-palette-from-color': 'crumb.byColor',
}

const localePath = useLocalePath()
const config = useRuntimeConfig()
const siteUrl = (config.public.siteUrl as string) || 'https://simplepixelart.com'

// A detail page names its own last crumb (the artwork, collection or
// tileset title) through useCrumbTitle; otherwise it reads the slug.
const crumbTitle = useCrumbTitle()

// On the server the bar renders before the page has fetched its piece, so
// it would print the slug. Ask for the same piece under the page's own key
// (one request, shared) and name the crumb from it.
const DETAIL: Record<string, { url: (s: string) => string, query?: Record<string, any> }> = {
  'art-id_string': {url: s => `/coloring/shared-pages/${s}/`, query: {lite: 1}},
  'collections-id_string': {url: s => `/coloring/collections/${s}/`},
  'tilesets-id_string': {url: s => `/coloring/tilesets/${s}/`},
  'worlds-id_string': {url: s => `/coloring/worlds/${s}/`},
}
if (import.meta.server) {
  const base = String(route.name || '').split('___')[0]!
  const d = DETAIL[base]
  const slug = String(route.params.id_string || '')
  if (d && slug) {
    const url = d.url(slug)
    const {data} = await useAuthFetch<any>(url, {key: `detail:${url}`, ...(d.query ? {query: d.query} : {})})
    const name = (data.value?.name || data.value?.title || '').trim()
    if (name) crumbTitle.value = name
  }
}

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
      label: i === parts.length - 1 && crumbTitle.value ? crumbTitle.value
          : LABELS[seg] ? t(LABELS[seg]) : decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/^\w/, c => c.toUpperCase()),
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
        // Google wants an `item` URL on every crumb, so one with no page of
        // its own (/tilesets, /palettes/tag) is left out of the trail; the
        // last one is this page, under its locale prefix.
        ...crumbs.value
            .map((c, i, all) => ({name: c.label, item: i === all.length - 1 ? `${siteUrl}${route.path}` : c.linked ? `${siteUrl}${localePath(c.to)}` : ''}))
            .filter(c => c.item)
            .map((c, i) => ({'@type': 'ListItem', position: i + 2, ...c})),
      ],
    })),
  }],
})
</script>

<template>
  <div class="dash-top">
    <button
        type="button"
        class="widget-ctl-btn dash-collapse"
        :title="sideCollapsed ? $t('c_Sidebar.expandSidebar') : $t('c_Sidebar.collapseSidebar')"
        :aria-label="sideCollapsed ? $t('c_Sidebar.expandSidebar') : $t('c_Sidebar.collapseSidebar')"
        :aria-expanded="!sideCollapsed"
        @click="toggleSide"
    >
      <span class="icon" :class="sideCollapsed ? 'icon-chevron-double-right' : 'icon-chevron-double-left'"/>
    </button>
    <nav class="dash-crumbs" :aria-label="$t('c_Topbar.breadcrumb')">
      <NuxtLinkLocale to="/" class="dash-crumb">{{ $t('common.home') }}</NuxtLinkLocale>
      <template v-for="(c, i) in crumbs" :key="c.to">
        <span class="icon icon-chevron-right dash-crumb-sep" aria-hidden="true"/>
        <NuxtLinkLocale v-if="i < crumbs.length - 1 && c.linked" :to="c.to" class="dash-crumb">{{ c.label }}</NuxtLinkLocale>
        <span v-else class="dash-crumb" :class="{'is-current': i === crumbs.length - 1}" :aria-current="i === crumbs.length - 1 ? 'page' : undefined">{{ c.label }}</span>
      </template>
    </nav>
    <div class="dash-top-ctl">
      <!-- Balance first, then the page's own tools (feedback, theme,
           language), then what is about you: notifications and the account
           menu, last, with settings and log out in it. -->
      <template v-if="desktop !== false && auth.isLogged">
        <WalletMenu/>
        <span class="dash-top-sep" aria-hidden="true"/>
      </template>
      <PartialTopPrefs/>
      <span class="dash-top-sep" aria-hidden="true"/>
      <PartialNotifyBell v-if="desktop !== false"/>
      <PartialSocialAuth compact/>
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

/* Flush with the edge the sidebar meets: the toggle is about that edge. */
.dash-collapse {
  flex-shrink: 0;
  margin-left: calc(var(--space-1) - var(--space-4));
}

.dash-collapse .icon {
  width: var(--icon-md);
  height: var(--icon-md);
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
  gap: var(--space-2);
  margin-left: auto;
}

/* Splits the bar's groups: balance | page tools | you. */
.dash-top-sep {
  width: 1px;
  height: var(--space-5);
  background: var(--border);
}

/* The theme and language menus wrap their button in an inline-flex box that
   sits on the text baseline, which left those two icons a pixel above
   Feedback, Settings and Login. */
.dash-top-ctl .dropdown-trigger-wrap {
  display: flex;
}

/* SocialAuth brings its own gap for the footer; in the bar the padding does
   the spacing there too. */
.dash-top-ctl .social-auth {
  gap: 0;
}

/* The bar's own controls carry a 22.5px icon, like the sidebar's; the menus they open keep
   theirs. */
.dash-top .dash-top-ctl :is(.hdr-link, .wallet-chip) > .icon {
  width: calc(var(--space-4) * 2.25);
  height: calc(var(--space-4) * 2.25);
}

/* Active reads by colour and fill alone here; the outline made the current
   page's icon look like a pressed button. */
.dash-top-ctl .hdr-link.router-link-active {
  box-shadow: none;
}

.dash-top-ctl .btn {
  padding: var(--space-1) var(--space-3);
}

/* Get started: the bar's one lit control, a size up from the rest. */
.dash-top-ctl .btn.social-auth-cta {
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-sm);
}

.dash-top-ctl .social-sep {
  margin: 0 var(--space-2);
}
</style>
