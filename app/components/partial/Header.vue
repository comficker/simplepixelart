<script setup lang="ts">
const config = useRuntimeConfig()
const auth = useAuthStore()
const {current, setTheme, themes} = useTheme()

const currentTheme = computed(() => themes.find(t => t.id === current.value) ?? themes[0])
</script>
<template>
  <header>
    <div class="container">
      <div class="menu">
        <nuxt-link to="/" class="item" title="Home">
          <span class="icon icon-home"/>
          <span class="label">Home</span>
        </nuxt-link>
      </div>
      <div class="menu">
        <nuxt-link to="/arts" class="item" title="Gallery">
          <span class="icon icon-discovery"/>
          <span class="label">Gallery</span>
        </nuxt-link>
        <nuxt-link to="/work" class="item" title="Your work">
          <span class="icon icon-brush"/>
          <span class="label">Your work</span>
        </nuxt-link>
        <ui-dropdown-menu>
          <div class="item theme-trigger" :title="`Theme: ${currentTheme.name}`">
            <span class="swatches">
              <span v-for="c in currentTheme.colors" :key="c" :style="{background: c}"/>
            </span>
            <span class="label">{{ currentTheme.name }}</span>
          </div>
          <template #menu>
            <div
                v-for="t in themes" :key="t.id"
                class="drop-item theme-option"
                :class="{active: t.id === current}"
                @click="setTheme(t.id)"
            >
              <span class="swatches">
                <span v-for="c in t.colors" :key="c" :style="{background: c}"/>
              </span>
              <span>{{ t.name }}</span>
            </div>
          </template>
        </ui-dropdown-menu>
      </div>
    </div>
  </header>
</template>

<style>
@reference "tailwindcss";

.menu {
  @apply flex gap-1 md:gap-4;
}

.menu .item {
  @apply flex gap-1 items-center justify-center;
  min-height: 44px;
  min-width: 44px;
  padding: 8px;
}

@media (min-width: 768px) {
  .menu .item {
    min-width: 0;
    padding: 8px 4px;
  }
}

header .container {
  @apply flex justify-between items-center;
}

header .menu .item {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}

header .menu .item .icon {
  font-size: 1.1em;
}

header .menu .item.router-link-active {
  color: var(--primary);
}

/* Hide text labels on mobile — rely on icons + swatches.
 * Theme dropdown menu items inside the panel keep their labels (.swatches + name)
 * because that markup uses a plain <span>, not .label. */
header .menu .item .label {
  display: none;
}

@media (min-width: 768px) {
  header .menu .item .label {
    display: inline;
  }
}

.theme-trigger {
  gap: 6px !important;
}

.theme-option {
  cursor: pointer;
  gap: 8px;
  align-items: center;
}

.theme-option.active {
  color: var(--primary);
}

.theme-option.active::before {
  content: "►";
  font-size: 0.7em;
}

.swatches {
  display: inline-flex;
  gap: 0;
  border: 1px solid var(--shadow-px);
  flex-shrink: 0;
}

.swatches > span {
  display: inline-block;
  width: 10px;
  height: 14px;
}
</style>