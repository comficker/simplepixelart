<script setup lang="ts">
const isMac = ref(true)
onMounted(() => {
  isMac.value = /Mac|iPhone|iPad/.test(navigator.platform)
})

function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'k', metaKey: true, ctrlKey: true}))
}
</script>
<template>
  <header>
    <div class="container hdr">
      <nuxt-link to="/" class="brand" title="Home">
        <img :src="`/logo.svg`" alt="Simple Pixel Art" width="42" height="42" class="brand-logo">
        <span class="brand-name">
          <span class="brand-name-stamp">Simple</span>
          <span class="brand-name-main">PixelArt</span>
        </span>
      </nuxt-link>

      <nav class="hdr-nav" aria-label="Primary">
        <nuxt-link to="/arts" class="hdr-link" title="Discovery">
          <span class="icon icon-explore"/>
          <span class="hdr-link-label">Discovery</span>
        </nuxt-link>
        <nuxt-link to="/work" class="hdr-link" title="Your work">
          <span class="icon icon-workspace"/>
          <span class="hdr-link-label">Your work</span>
        </nuxt-link>
        <span class="hdr-divider" aria-hidden="true"/>
        <WalletMenu/>
        <button
            type="button"
            class="cmdk-trigger"
            title="Open command palette (themes, navigation, more)"
            aria-label="Open command palette"
            @click="openCommandPalette"
        >
          <span class="icon icon-search"/>
          <span class="cmdk-hint">
            <kbd class="kbd kbd-on-surface">{{ isMac ? '⌘' : 'Ctrl' }}</kbd><kbd class="kbd kbd-on-surface">K</kbd>
          </span>
        </button>
      </nav>
    </div>
  </header>
</template>

<style>
/* ============ Header layout ============ */
header .hdr {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 56px;
}

.hdr-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  padding: 3px;
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  border-radius: var(--radius-sm);
}

.hdr-divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 2px;
  background: color-mix(in oklab, var(--border) 80%, transparent);
}

/* ============ Brand ============ */
header .brand {
  position: relative;
  margin-left: -0.3rem;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  isolation: isolate;
  flex-shrink: 0;
  transition: transform 240ms cubic-bezier(.22,.61,.36,1);
}

header .brand::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(135deg, color-mix(in oklab, var(--primary) 12%, transparent) 0%, transparent 55%);
  opacity: 0;
  transition: opacity 240ms ease;
  z-index: -1;
}

@media (hover: hover) and (pointer: fine) {
  header .brand:hover::before { opacity: 1; }
}

header .brand-logo {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--background);
  padding: 3px;
  border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
  transition: border-color 240ms ease;
}

header .brand-name {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  line-height: 1;
  white-space: nowrap;
}

/* SIMPLE sticker — flat primary chip */
header .brand-name-stamp {
  display: inline-block;
  padding: 3px 7px 3px 8px;
  transform: rotate(-2deg);
  font-size: 8px;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 3px;
}

/* PixelArt — chunky logotype */
header .brand-name-main {
  display: block;
  font-size: 1em;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.04em;
  color: var(--foreground);
}

/* ============ Nav links (pill group) ============ */
.hdr-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 12px;
  border-radius: 6px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
  transition: color 160ms ease, background 160ms ease;
  -webkit-tap-highlight-color: transparent;
}

.hdr-link .icon {
  font-size: 0.95em;
  flex-shrink: 0;
}

@media (hover: hover) and (pointer: fine) {
  .hdr-link:hover {
    color: var(--foreground);
    background: color-mix(in oklab, var(--surface) 60%, transparent);
  }
}

.hdr-link.router-link-active {
  color: var(--foreground);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}

.hdr-link.router-link-active .icon {
  color: var(--primary);
}

/* ============ ⌘K trigger ============ */
.cmdk-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 7px 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

.cmdk-trigger:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--surface) 60%, transparent);
}

.cmdk-trigger:active { transform: scale(0.97); }

.cmdk-hint {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* ============ Responsive ============ */
@media (max-width: 1023px) {
  .hdr-link-label { display: none; }
  .hdr-link { padding: 7px 10px; }
}

@media (max-width: 767px) {
  header .hdr { gap: var(--space-3); min-height: 56px; }
  header .brand { gap: 0.45rem; padding: var(--space-1); }
  header .brand-logo { width: 36px; height: 36px; padding: 2px; border-radius: var(--radius-sm); }
  header .brand-name { font-size: var(--text-lg); }
  .hdr-nav { padding: 2px; gap: 0; }
  .hdr-link { padding: 7px 9px; }
  .cmdk-hint { display: none; }
  .cmdk-trigger { padding: 7px; border-radius: var(--radius-sm); }
}

</style>
