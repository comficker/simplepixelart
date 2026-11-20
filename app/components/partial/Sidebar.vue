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
  {to: '/', icon: 'icon-home', key: 'nav.home'},
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
        <span class="dash-brand-tile"><img src="/logo-mark.svg" :alt="$t('common.simplePixelArt')" width="10" height="23" class="dash-brand-logo"></span>
        <span v-if="!collapsed" class="dash-brand-name" aria-hidden="true">Simple<b>PX</b></span>
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

@media (min-width: 1024px) {
  .dash-side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 0;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--border);
  }
}

.dash-brand-row {
  display: flex;
  align-items: center;
  /* The sidebar is a scrolling flex column: without this a long menu
     squeezed the row below the top bar's height. */
  flex-shrink: 0;
  height: var(--bar-h);
  padding: 0 5px;
  border-bottom: 1px solid var(--border);
}

/* The whole block is the home link, a row like the nav rows below it: same
   inset, same hover fill, the logo's left edge on theirs. */
.dash-brand {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  overflow: hidden;
  height: calc(var(--bar-h) - 8px);
  padding: 0 5px;
  border-radius: var(--radius-sm);
  color: var(--foreground);
  transition: background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .dash-brand:hover {
    background: var(--surface-2);
  }
}

.dash-brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

/* The pencil on the brand's cream square -- cream in every theme, it is the
   logo's own colour, not a surface. */
.dash-brand-tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  background: #F0EBE1;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 1px rgba(38, 36, 57, 0.08);
}

/* As tall as the top bar's action icons (23px). */
.dash-brand-logo {
  width: auto;
  height: 23px;
  flex-shrink: 0;
  image-rendering: pixelated;
}

/* Sized to the pencil: at --text-2xl (26px) the capitals stand ~18px, about
   the pencil's body, so icon and word read as one lockup. */
.dash-brand-name {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  font-variation-settings: "wght" 800;
  line-height: 1;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.dash-brand-name b {
  font-weight: inherit;
  color: var(--primary);
}

.dash-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* Each section is a widget: a head band over a padded body, the next one
   below a single rule. */
.dash-group {
  border-bottom: 1px solid var(--border);
}


.dash-link {
  display: flex;
  width: 100%;
}

/* The current page is a filled row in the text colour, not a recoloured
   one: blue text beside a green, purple or orange chip was a third colour
   that matched none of them, and the shared .hdr-link rule even turned the
   chip's white glyph blue. */
.dash-side .dash-link.router-link-active {
  color: var(--foreground);
  background: var(--surface-2);
  box-shadow: none;
}


.dash-tool-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Two and a quarter base steps: its own size, not a gap, so it does not
     follow the spacing scale down. */
  width: calc(var(--space-4) * 2.25);
  height: calc(var(--space-4) * 2.25);
  flex-shrink: 0;
  border-radius: var(--radius);
}

/* Monochrome: plain glyphs in the text colour, no colour chips. */
.dash-tool-ic .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--foreground);
}

/* The header's .hdr-link turns an active icon blue; here the row's fill is
   the marker, the glyph stays in the text colour. */
.dash-side .dash-link.router-link-active .dash-tool-ic .icon {
  color: var(--foreground);
}

.dash-foot {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--foot-h);
  margin-top: auto;
  padding: 0 var(--space-3);
  border-top: 1px solid var(--border);
  /* The rail hides its scrollbar; pinning the foot keeps ⌘K in reach when
     the list runs past a short screen. */
  position: sticky;
  bottom: 0;
  background: var(--surface);
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
}

/* Collapsed, each entry is a square as wide as the rail, edge to edge and
   stacked with no gap: the rail reads as one column of tiles. */
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

/* The glyph at the top bar's icon size (23px), now that the tile has room. */
.dash-side.is-collapsed .dash-tool-ic .icon {
  width: 23px;
  height: 23px;
}

/* Collapsed, the titles have no room: the groups part by their rule alone. */
.dash-side.is-collapsed .widget-head {
  display: none;
}

/* Same height as the status bar beside it; the search button just centres. */
.dash-side.is-collapsed .dash-foot {
  justify-content: center;
  padding: 0 var(--space-1);
}
</style>
