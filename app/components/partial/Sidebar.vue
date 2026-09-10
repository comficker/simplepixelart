<script setup lang="ts">
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
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', metaKey: true, ctrlKey: true}))
}

const PRIMARY = [
  {to: '/', icon: 'icon-home', title: 'Home'},
  {to: '/arts', icon: 'icon-explore', title: 'Discovery'},
  {to: '/palettes', icon: 'icon-bucket', title: 'Palettes'},
  {to: '/challenges', icon: 'icon-flag', title: 'Challenges'},
  {to: '/work', icon: 'icon-workspace', title: 'Your work'},
]
</script>

<template>
  <aside class="dash-side" :class="{'is-collapsed': collapsed}" aria-label="Sidebar">
    <div class="dash-brand-row">
      <nuxt-link v-if="!collapsed" to="/" class="dash-brand" title="Home">
        <img src="/logo.svg" alt="Simple Pixel Art" width="32" height="32" class="dash-brand-logo">
        <span class="dash-brand-name"><span>Simple</span>PixelArt</span>
      </nuxt-link>
      <button
          type="button"
          class="widget-ctl-btn dash-collapse"
          :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
          :aria-expanded="!collapsed"
          @click="toggleCollapsed"
      >
        <span class="icon" :class="collapsed ? 'icon-angle-right' : 'icon-angle-left'"/>
      </button>
    </div>

    <nav class="dash-nav" aria-label="Primary">
      <nuxt-link v-for="l in PRIMARY" :key="l.to" :to="l.to" class="hdr-link dash-link" :title="l.title">
        <span class="icon" :class="l.icon"/>
        <span class="dash-label">{{ l.title }}</span>
      </nuxt-link>
    </nav>

    <div class="dash-sec"><span class="dash-label">Tools</span></div>
    <nav class="dash-nav" aria-label="Tools">
      <nuxt-link
          v-for="t in TOOLS"
          :key="t.key"
          :to="t.to"
          class="hdr-link dash-link"
          :style="{'--ic-1': t.c1, '--ic-2': t.c2}"
          :title="t.title"
      >
        <span class="dash-tool-ic"><span class="icon" :class="t.icon"/></span>
        <span class="dash-label">{{ t.title }}</span>
      </nuxt-link>
    </nav>

    <div class="dash-foot">
      <button
          type="button"
          class="cmdk-trigger"
          title="Open command palette"
          aria-label="Open command palette"
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
  min-width: 0;
  color: var(--foreground);
}

.dash-collapse {
  margin-left: auto;
}

.dash-collapse .icon {
  width: 15px;
  height: 15px;
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
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--primary);
}

.dash-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 var(--space-3);
}

.dash-link {
  display: flex;
  width: 100%;
}

.dash-side .dash-link.router-link-active {
  color: var(--primary);
  background: transparent;
  box-shadow: none;
}

.dash-sec {
  margin-top: var(--space-1);
  padding: var(--space-3) var(--space-6) var(--space-1);
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
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: 4px;
  background: linear-gradient(135deg, var(--ic-1), var(--ic-2));
}

.dash-tool-ic .icon {
  width: 11px;
  height: 11px;
  color: #fff;
}

.dash-foot {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--bar-h);
  margin-top: auto;
  padding: 0 var(--space-3);
  border-top: 1px solid var(--border);
}

.dash-side.is-collapsed .dash-label,
.dash-side.is-collapsed .cmdk-hint {
  display: none;
}

.dash-side.is-collapsed .dash-brand-row {
  justify-content: center;
  padding: 0;
}

.dash-side.is-collapsed .dash-collapse {
  margin-left: 0;
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

.dash-side.is-collapsed .dash-foot {
  flex-direction: column;
  padding: var(--space-2) var(--space-1) var(--space-2);
}
</style>
