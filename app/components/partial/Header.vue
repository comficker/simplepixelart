<script setup lang="ts">
const isMac = ref(false)
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
        <nuxt-link to="/editor" class="hdr-link" title="Editor">
          <span class="icon icon-square"/>
          <span class="hdr-link-label">Editor</span>
        </nuxt-link>
        <nuxt-link to="/arts" class="hdr-link" title="Discovery">
          <span class="icon icon-search"/>
          <span class="hdr-link-label">Discovery</span>
        </nuxt-link>
        <nuxt-link to="/work" class="hdr-link" title="Your work">
          <span class="icon icon-grid"/>
          <span class="hdr-link-label">Your work</span>
        </nuxt-link>
      </nav>

      <div class="hdr-actions">
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
      </div>
    </div>
  </header>
</template>

<style>
/* ============ Header layout ============ */
header .hdr {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
  border-radius: 999px;
}

.hdr-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ============ Brand ============ */
header .brand {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 4px 6px;
  border-radius: 10px;
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
  header .brand:hover { transform: translateY(-1px); }
  header .brand:hover .brand-logo {
    transform: translate(-1px, -1px);
    box-shadow:
      0 0 0 1px color-mix(in oklab, var(--foreground) 18%, transparent),
      4px 4px 0 0 var(--primary);
  }
}

header .brand-logo {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--background);
  padding: 3px;
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--foreground) 12%, transparent),
    3px 3px 0 0 var(--primary);
  transition:
    box-shadow 240ms cubic-bezier(.22,.61,.36,1),
    transform 240ms cubic-bezier(.22,.61,.36,1);
}

header .brand-name {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  font-size: var(--text-xl);
  line-height: 1;
  white-space: nowrap;
}

/* SIMPLE sticker — primary block with offset pixel shadow */
header .brand-name-stamp {
  display: inline-block;
  padding: 3px 7px 3px 8px;
  font-size: 10px;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 3px;
  box-shadow:
    2px 2px 0 0 color-mix(in oklab, var(--foreground) 35%, transparent);
  transform: rotate(-2deg);
  transform-origin: bottom left;
  transition: transform 240ms cubic-bezier(.34,1.56,.64,1);
}

header .brand:hover .brand-name-stamp {
  transform: rotate(-3.5deg) translateY(-1px);
}

/* PixelArt — chunky logotype */
header .brand-name-main {
  display: block;
  font-size: 1em;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.04em;
  color: var(--foreground);
  text-shadow:
    1px 1px 0 color-mix(in oklab, var(--primary) 22%, transparent);
}

/* ============ Nav links (pill group) ============ */
.hdr-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 999px;
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
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent);
}

.hdr-link.router-link-active .icon {
  color: var(--primary);
}

/* ============ ⌘K trigger ============ */
.cmdk-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease, transform 160ms ease;
}

.cmdk-trigger:hover {
  color: var(--foreground);
  border-color: color-mix(in oklab, var(--primary) 50%, var(--border));
  background: color-mix(in oklab, var(--surface-2) 70%, var(--surface));
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
  header .hdr { gap: 0.5rem; min-height: 56px; }
  header .brand { gap: 0.45rem; padding: 4px; }
  header .brand-logo { width: 36px; height: 36px; padding: 2px; border-radius: 8px; }
  header .brand-name { font-size: var(--text-lg); }
  .hdr-nav { padding: 2px; gap: 0; }
  .hdr-link { padding: 7px 9px; }
  .cmdk-hint { display: none; }
  .cmdk-trigger { padding: 7px; border-radius: 8px; }
}

</style>
