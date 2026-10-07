<script setup lang="ts">
const cmdk = useCommandPalette()
import {TOOLS} from '~/helper/tools'
import useStatefulCookie from '~/composables/useStatefulCookie'

const sideState = useStatefulCookie('dash_side')
const collapsed = computed(() => sideState.value === 'collapsed')

function toggleCollapsed() {
  sideState.value = collapsed.value ? 'open' : 'collapsed'
}

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
  {to: '/', icon: 'icon-home', key: 'nav.home', c1: '#94a3b8', c2: '#475569'},
  {to: '/challenges', icon: 'icon-flag', key: 'nav.challenges', c1: '#f87171', c2: '#dc2626'},
  {to: '/work', icon: 'icon-workspace', key: 'nav.yourWork', c1: '#60a5fa', c2: '#1d4ed8'},
]

// Grouped by what you are doing rather than "page vs tool": browsing and
// making pixel art, working with colour, building for a game. Discovery and
// Palettes sit with the tools they lead into, so they wear the same chip.
const tool = (key: (typeof TOOLS)[number]['key']) => TOOLS.find(t => t.key === key)!
const SECTIONS = [
  {
    key: 'c_Sidebar.pixelArt',
    items: [
      {key: 'discovery', to: '/arts', icon: 'icon-explore', i18n: 'nav.discovery', c1: '#38bdf8', c2: '#0284c7'},
      tool('upload'), tool('draw'), tool('ai'), tool('convert'), tool('slicer'),
    ],
  },
  {
    key: 'c_Sidebar.color',
    items: [
      {key: 'palettes', to: '/palettes', icon: 'icon-bucket', i18n: 'nav.palettes', c1: '#fb923c', c2: '#ea580c'},
      tool('extract'),
    ],
  },
  {key: 'c_Sidebar.gameDev', items: [tool('tileset'), tool('tilemap')]},
]
</script>

<template>
  <aside class="dash-side" :class="{'is-collapsed': collapsed}" :aria-label="$t('c_Sidebar.sidebar')">
    <div class="dash-brand-row">
      <!-- Collapsed, the row is just the logo; the expand button sits over it
           and shows on hover or focus. -->
      <NuxtLinkLocale to="/" class="dash-brand" :title="$t('common.home')">
        <img src="/logo.svg" :alt="$t('common.simplePixelArt')" width="32" height="32" class="dash-brand-logo">
        <span v-if="!collapsed" class="dash-brand-name"><span>{{ $t('common.simple') }}</span>{{ $t('common.pixelart') }}</span>
      </NuxtLinkLocale>
      <button
          type="button"
          class="widget-ctl-btn dash-collapse"
          :title="collapsed ? $t('c_Sidebar.expandSidebar') : $t('c_Sidebar.collapseSidebar')"
          :aria-label="collapsed ? $t('c_Sidebar.expandSidebar') : $t('c_Sidebar.collapseSidebar')"
          :aria-expanded="!collapsed"
          @click="toggleCollapsed"
      >
        <span class="icon" :class="collapsed ? 'icon-chevron-double-right' : 'icon-chevron-double-left'"/>
      </button>
    </div>

    <nav class="dash-nav" :aria-label="$t('common.primary')">
      <NuxtLinkLocale
          v-for="l in PRIMARY"
          :key="l.to"
          :to="l.to"
          class="hdr-link dash-link"
          :style="{'--ic-1': l.c1, '--ic-2': l.c2}"
          :title="$t(l.key)"
      >
        <span class="dash-tool-ic"><span class="icon" :class="l.icon"/></span>
        <span class="dash-label">{{ $t(l.key) }}</span>
      </NuxtLinkLocale>
    </nav>

    <template v-for="sec in SECTIONS" :key="sec.key">
      <div class="dash-sec"><span class="dash-label">{{ $t(sec.key) }}</span></div>
      <nav class="dash-nav" :aria-label="$t(sec.key)">
        <NuxtLinkLocale
            v-for="t in sec.items"
            :key="t.key"
            :to="t.to"
            class="hdr-link dash-link"
            :style="{'--ic-1': t.c1, '--ic-2': t.c2}"
            :title="$t(t.i18n)"
        >
          <span class="dash-tool-ic"><span class="icon" :class="t.icon"/></span>
          <span class="dash-label">{{ $t(t.i18n) }}</span>
        </NuxtLinkLocale>
      </nav>
    </template>

    <div class="dash-sec"><span class="dash-label">{{ $t('c_Sidebar.community') }}</span></div>
    <nav class="dash-nav" :aria-label="$t('c_Sidebar.community')">
      <NuxtLinkLocale to="/creator-program" class="hdr-link dash-link" :title="$t('c_Sidebar.creatorProgram')">
        <span class="dash-tool-ic dash-tool-ic-plain"><span class="icon icon-trophy"/></span>
        <span class="dash-label">{{ $t('c_Sidebar.creatorProgram') }}</span>
      </NuxtLinkLocale>
      <a
          v-for="l in SOCIAL"
          :key="l.href"
          :href="l.href"
          target="_blank"
          rel="noopener"
          class="hdr-link dash-link"
          :title="$t(l.key)"
      >
        <span class="dash-tool-ic dash-tool-ic-plain"><span class="icon" :class="l.icon"/></span>
        <span class="dash-label">{{ $t(l.key) }}</span>
      </a>
    </nav>

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
    gap: var(--space-2);
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
  gap: var(--space-2);
  height: var(--bar-h);
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border);
}

.dash-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* The bar's height less the row's 1px bottom border: 47px. */
  height: calc(var(--bar-h) - 1px);
  min-width: 0;
  color: var(--foreground);
}

.dash-collapse {
  margin-left: auto;
}

.dash-collapse .icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

.dash-brand-logo {
  width: 32px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
}

.dash-brand-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-base);
  line-height: 1;
  white-space: nowrap;
}

.dash-brand-name span {
  display: block;
  margin-bottom: 3px;
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--primary);
}

.dash-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 var(--space-1);
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

.dash-side .dash-link.router-link-active .dash-tool-ic .icon {
  color: #fff;
}

.dash-sec {
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-4) 0;
  border-top: 1px solid var(--border);
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.dash-tool-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-5);
  height: var(--space-5);
  flex-shrink: 0;
  border-radius: var(--space-1);
  background: linear-gradient(135deg, var(--ic-1), var(--ic-2));
}

.dash-tool-ic .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: #fff;
}

/* Off-site links: same slot, no colour, so they don't read as tools. */
.dash-tool-ic-plain {
  background: var(--surface-2);
}

.dash-side .dash-tool-ic-plain .icon,
.dash-side .dash-link.router-link-active .dash-tool-ic-plain .icon {
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

/* Over the logo, the same size, hidden until the row is hovered or the
   button is focused. */
.dash-side.is-collapsed .dash-collapse {
  position: absolute;
  inset: 0;
  width: calc(var(--space-6) + var(--space-2));
  height: calc(var(--space-6) + var(--space-2));
  margin: auto;
  justify-content: center;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  opacity: 0;
  transition: opacity var(--transition);
}

.dash-side.is-collapsed .dash-brand-row:hover .dash-collapse,
.dash-side.is-collapsed .dash-collapse:focus-visible {
  opacity: 1;
}

.dash-side.is-collapsed .dash-nav {
  padding: 0 var(--space-1);
}

.dash-side.is-collapsed .dash-link {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.dash-side.is-collapsed .dash-sec {
  padding: var(--space-2) 0 0;
}

/* Same height as the status bar beside it; the search button just centres. */
.dash-side.is-collapsed .dash-foot {
  justify-content: center;
  padding: 0 var(--space-1);
}
</style>
