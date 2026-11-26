<script setup lang="ts">
const cmdk = useCommandPalette()
import {TOOLS} from '~/helper/tools'
import useStatefulCookie from '~/composables/useStatefulCookie'
import {playUrl} from '~/helper/play'

const sideState = useStatefulCookie('dash_side')
const collapsed = computed(() => sideState.value === 'collapsed')

const isMac = ref(true)
onMounted(() => {
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform)
})

function openCommandPalette() {
  cmdk.show()
}

// The project's own accounts. They used to sit in the top bar beside the
// account link, which mixed "where this project lives" with "who you are".
const SOCIAL = [
  {href: 'https://github.com/comficker/simplepixelart', icon: 'icon-github', key: 'c_Sidebar.sourceOnGithub'},
  {href: 'https://x.com/comficker', icon: 'icon-brand-x', key: 'c_Sidebar.followOnX'},
]

const PRIMARY = [
  {to: '/challenges', icon: 'icon-flag', key: 'nav.challenges'},
  {to: '/work', icon: 'icon-workspace', key: 'nav.yourWork'},
]

// Grouped by what you are doing rather than "page vs tool": browsing and
// making pixel art, working with colour, building for a game. Discovery and
// Palettes sit with the tools they lead into, so they wear the same chip.
const tool = (key: (typeof TOOLS)[number]['key']) => TOOLS.find(t => t.key === key)!
const SECTIONS = [
  {
    key: 'c_Sidebar.pixelArt',
    items: [
      {key: 'discovery', to: '/arts', icon: 'icon-explore', i18n: 'nav.discovery'},
      tool('upload'), tool('draw'), tool('ai'), tool('convert'), tool('slicer'),
    ],
  },
  {
    key: 'c_Sidebar.color',
    items: [
      {key: 'palettes', to: '/palettes', icon: 'icon-bucket', i18n: 'nav.palettes'},
      tool('extract'),
    ],
  },
  {key: 'c_Sidebar.gameDev', items: [tool('tileset'), tool('tilemap')]},
]
</script>

<template>
  <aside class="dash-side" :class="{'is-collapsed': collapsed}" :aria-label="$t('c_Sidebar.sidebar')">
    <div class="dash-brand-row">
      <!-- Just the way home: the collapse toggle sits in the top bar, so a tap
           on the logo can never land on it. -->
      <NuxtLinkLocale to="/" class="dash-brand" :title="$t('common.home')">
        <span class="dash-brand-tile"><img src="/logo-sidebar.svg" :alt="$t('common.simplePixelArt')" width="32" height="32" class="dash-brand-logo"></span>
        <span v-if="!collapsed" class="dash-brand-text">
          <span class="dash-brand-kicker">{{ $t('common.simplePixelArt') }}</span>
          <span class="dash-brand-name">{{ $t('nav.home') }}</span>
        </span>
      </NuxtLinkLocale>
    </div>

    <section class="dash-group">
      <div class="widget-head"><div class="title dash-label">{{ $t('c_Sidebar.main') }}</div></div>
      <nav class="widget-body dash-nav" :aria-label="$t('common.primary')">
        <NuxtLinkLocale
            v-for="l in PRIMARY"
            :key="l.to"
            :to="l.to"
            class="hdr-link dash-link"
            :title="$t(l.key)"
        >
          <span class="dash-tool-ic"><span class="icon" :class="l.icon"/></span>
          <span class="dash-label">{{ $t(l.key) }}</span>
        </NuxtLinkLocale>
      </nav>
    </section>

    <template v-for="sec in SECTIONS" :key="sec.key">
      <section class="dash-group">
        <div class="widget-head"><div class="title dash-label">{{ $t(sec.key) }}</div></div>
        <nav class="widget-body dash-nav" :aria-label="$t(sec.key)">
          <NuxtLinkLocale
              v-for="t in sec.items"
              :key="t.key"
              :to="t.to"
              class="hdr-link dash-link"
              :title="$t(t.i18n)"
          >
            <span class="dash-tool-ic"><span class="icon" :class="t.icon"/></span>
            <span class="dash-label">{{ $t(t.i18n) }}</span>
            </NuxtLinkLocale>
        </nav>
      </section>
    </template>

    <!-- The coloring game is written in English only, so every locale links
         to the one page. -->
    <section class="dash-group">
      <div class="widget-head"><div class="title dash-label">{{ $t('c_Sidebar.play') }}</div></div>
      <nav class="widget-body dash-nav" :aria-label="$t('c_Sidebar.play')">
        <NuxtLink
            to="/color-by-number"
            class="hdr-link dash-link"
            :title="$t('nav.coloring')"
        >
          <span class="dash-tool-ic"><span class="icon icon-brush"/></span>
          <span class="dash-label">{{ $t('nav.coloring') }}</span>
        </NuxtLink>
      </nav>
    </section>

    <section class="dash-group">
      <div class="widget-head"><div class="title dash-label">{{ $t('c_Sidebar.community') }}</div></div>
      <nav class="widget-body dash-nav" :aria-label="$t('c_Sidebar.community')">
        <NuxtLinkLocale to="/creator-program" class="hdr-link dash-link" :title="$t('c_Sidebar.creatorProgram')">
          <span class="dash-tool-ic"><span class="icon icon-trophy"/></span>
          <span class="dash-label">{{ $t('c_Sidebar.creatorProgram') }}</span>
        </NuxtLinkLocale>
        <a :href="playUrl('sidebar')" target="_blank" rel="noopener" class="hdr-link dash-link" :title="$t('c_AndroidApp.title')">
          <span class="dash-tool-ic"><span class="icon icon-android"/></span>
          <span class="dash-label">{{ $t('c_AndroidApp.short') }}</span>
        </a>
        <a
            v-for="l in SOCIAL"
            :key="l.href"
            :href="l.href"
            target="_blank"
            rel="noopener"
            class="hdr-link dash-link"
            :title="$t(l.key)"
        >
          <span class="dash-tool-ic"><span class="icon" :class="l.icon"/></span>
          <span class="dash-label">{{ $t(l.key) }}</span>
        </a>
      </nav>
    </section>

    <div class="dash-foot">
      <button
          type="button"
          class="cmdk-trigger"
          :title="$t('common.openCommandPalette')"
          :aria-label="$t('common.openCommandPalette')"
          @click="openCommandPalette"
      >
        <span class="icon icon-search"/>
        <span class="dash-label dash-search-label">{{ $t('common.search') }}</span>
        <span class="cmdk-hint">
          <kbd class="kbd kbd-on-surface">{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd class="kbd kbd-on-surface">K</kbd>
        </span>
      </button>
    </div>
  </aside>
</template>

<style>
.dash-side {
  display: none;
}

/* A soft rail: the page's ground tone behind cards that lift off it -- the
   brand card at the top, the current page's row, the search card at the
   foot. Groups part by an inset rule, titles sit in sentence case. */
@media (min-width: 1024px) {
  .dash-side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 0;
    overflow-y: auto;
    background: var(--background);
    border-right: 1px solid var(--border);
  }
}

/* A raised card: the same lift for the active row (and the brand on the
   home page), and search. Hover gives the rows and the brand the same card. */
.dash-brand.router-link-exact-active,
.dash-side .dash-link.router-link-active,
.dash-side .dash-foot .cmdk-trigger {
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.06);
}

.dash-brand-row {
  display: flex;
  align-items: center;
  /* The sidebar is a scrolling flex column: without this a long menu
     squeezed the row below the top bar's height. */
  flex-shrink: 0;
  height: var(--bar-h);
  padding: 0 var(--space-3);
}

.dash-brand {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  overflow: hidden;
  height: calc(var(--bar-h) - 10px);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--foreground);
  transition: background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .dash-brand:hover {
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.06);
  }
}

.dash-brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

/* The pixel wordmark (logo-sidebar.svg, its own white square) -- the same in
   every theme, it is the logo's own colour, not a surface. */
.dash-brand-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: #FFFFFF;
  overflow: hidden;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 1px rgba(38, 36, 57, 0.08);
}

/* 32x32 art at 1px cells, so it stays crisp. */
.dash-brand-logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  image-rendering: pixelated;
}

.dash-brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.dash-brand-kicker,
.dash-brand-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-brand-kicker {
  font-size: var(--text-2xs);
  color: var(--muted);
}

.dash-brand-name {
  font-size: var(--text-sm);
  font-weight: 600;
}

.dash-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* The rail is one sheet: its widgets add no fill of their own. */
.dash-side .widget-body {
  padding: var(--space-1) 0 var(--space-3);
  background: transparent;
  box-shadow: none;
}

/* Group titles: a small muted uppercase line over the rows. */
.dash-side .dash-group > .widget-head {
  min-height: 0;
  padding: var(--space-4) var(--space-1) var(--space-1);
  background: transparent;
  border-bottom: 0;
  box-shadow: none;
}

.dash-side .dash-group > .widget-head > .title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

/* Collapsed, the titles have no room: the groups part by their rule alone. */
.dash-side.is-collapsed .widget-head {
  display: none;
}

/* The rows sit inset from the rail's edges; the rule between groups runs
   edge to edge. */
.dash-group {
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border);
}

.dash-group:last-of-type {
  border-bottom: 0;
}

/* Rows: a muted glyph and label; the current page is a raised card. */
.dash-side .dash-link {
  display: flex;
  width: 100%;
  min-height: 34px;
  gap: var(--space-3);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  font-weight: 500;
  color: var(--muted);
}

/* Hover looks exactly like the active row: the same raised card. */
@media (hover: hover) and (pointer: fine) {
  .dash-side .dash-link:hover {
    color: var(--foreground);
    font-weight: 600;
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.06);
  }
}

.dash-side .dash-link.router-link-active {
  color: var(--foreground);
  font-weight: 600;
}

.dash-tool-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-md);
  height: var(--icon-md);
  flex-shrink: 0;
  border-radius: var(--radius);
}

/* Monochrome glyphs that follow the row's text colour. */
.dash-tool-ic .icon,
.dash-side .dash-link.router-link-active .dash-tool-ic .icon {
  width: var(--icon-md);
  height: var(--icon-md);
  color: currentColor;
}

/* Search as a card at the foot, pinned so ⌘K stays in reach when the list
   runs past a short screen. */
.dash-foot {
  display: flex;
  align-items: center;
  min-height: calc(var(--foot-h) + var(--space-6));
  margin-top: auto;
  padding: var(--space-3);
  position: sticky;
  bottom: 0;
  background: var(--background);
}

.dash-side .dash-foot .cmdk-trigger {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-sm);
}

.dash-side .dash-foot .cmdk-trigger > .icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

.dash-search-label {
  flex: 1;
  text-align: left;
}

.dash-link .dash-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dash-side.is-collapsed .dash-label,
.dash-side.is-collapsed .cmdk-hint {
  display: none;
}

.dash-side.is-collapsed .dash-brand-row {
  position: relative;
  justify-content: center;
  padding: 0;
}

.dash-side.is-collapsed .dash-brand {
  justify-content: center;
  height: 100%;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

/* Collapsed, each entry is a square as wide as the rail, edge to edge and
   stacked with no gap: the rail reads as one column of tiles. */
.dash-side.is-collapsed .dash-group {
  padding: 0;
}

.dash-side.is-collapsed .widget-body,
.dash-side.is-collapsed .dash-nav {
  padding: 0;
  gap: 0;
}

.dash-side.is-collapsed .dash-link {
  justify-content: center;
  align-items: center;
  width: 100%;
  /* The rail's collapsed width less its 1px right border -- a fixed size,
     not aspect-ratio, so the tiles do not balloon while the rail's width
     is still animating down. */
  height: calc(var(--dash-side-w) - 1px);
  min-height: 0;
  padding: 0;
  border-radius: 0;
}

/* ...and the icon slot and logo tile fill the square, no inset. */
.dash-side.is-collapsed .dash-tool-ic,
.dash-side.is-collapsed .dash-brand-tile {
  width: 100%;
  height: 100%;
  border-radius: 0;
  box-shadow: none;
}

.dash-side.is-collapsed .dash-foot {
  justify-content: center;
  padding: var(--space-1);
}

.dash-side.is-collapsed .dash-foot .cmdk-trigger {
  flex: 0 0 auto;
  justify-content: center;
  padding: var(--space-2);
  box-shadow: none;
  background: transparent;
}
</style>
