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
        <nuxt-link to="/" class="item">
          <span class="icon icon-home"/>
          <span>Home</span>
        </nuxt-link>
      </div>
      <div class="menu">
        <nuxt-link to="/arts" class="item">
          <span>Gallery</span>
        </nuxt-link>
        <nuxt-link to="/work" class="item">
          <span>Your work</span>
        </nuxt-link>
        <ui-dropdown-menu>
          <div class="item theme-trigger" title="Change theme">
            <span class="swatches">
              <span v-for="c in currentTheme.colors" :key="c" :style="{background: c}"/>
            </span>
            <span>{{ currentTheme.name }}</span>
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
        <div class="item" v-if="auth.isLogged" @click="auth.logout()">Logout</div>
        <a class="item" v-else :href="`${config.public.api}/auth/google`">Login</a>
      </div>
    </div>
  </header>
</template>

<style>
@reference "tailwindcss";

.menu {
  @apply flex gap-4;
}

.menu .item {
  @apply flex gap-1 items-center py-2;
}

header .container {
  @apply flex justify-between items-center;
}

header .menu .item {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}

header .menu .item.router-link-active {
  color: var(--primary);
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