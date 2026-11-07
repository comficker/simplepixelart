<script setup lang="ts">
// The color by number frame plus a row of pictures to switch to. The picture
// being played is ?art=<slug>, so every pick is a shareable link.
const props = defineProps<{ picks: string[], moreTo?: string }>()

const route = useRoute()
const config = useRuntimeConfig()
const IMG = '/images/color-by-number'

const slug = computed(() => {
  const q = String(route.query.art || '')
  return /^[a-z0-9-]+$/.test(q) ? q : props.picks[0]
})

// The board only ever runs in the browser, so the picture (its full number
// map) is fetched there too: none of it is rendered or needed server-side,
// and it kept the HTML payload heavy for nothing.
const {data: art} = useAuthFetch<any>(() => `/coloring/shared-pages/${slug.value}/`, {
  // Keyed by picture: a shared key handed the previous page's picture to the
  // next one on client-side navigation.
  key: () => `cbn-art-${slug.value}`,
  server: false,
  lazy: true,
})
const playable = computed(() => art.value?.map_numbers && art.value?.colors ? art.value : null)

const thumb = (s: string) => `${config.public.api}/coloring/files/art-thumb/${s}.png`
const words = (s: string) => s.replace(/-\d+$/, '').replace(/-/g, ' ')
</script>

<template>
  <div class="flat-editor cbn-page">
    <ClientOnly>
      <LazyColorByNumber :art="playable"/>
      <template #fallback>
        <div class="cbn-fallback">
          <img :src="`${IMG}/demo.webp`" :alt="$t('p_cbn.demoAlt')" width="480" height="480" fetchpriority="high">
        </div>
      </template>
    </ClientOnly>
    <nav class="cbn-picks" :aria-label="$t('p_cbn.picksLabel')">
      <NuxtLink
          v-for="s in picks"
          :key="s"
          :to="{query: {art: s}}"
          replace
          class="cbn-pick"
          :class="{on: s === slug}"
          :title="words(s)"
      >
        <img :src="thumb(s)" :alt="`${words(s)} pixel art color by number`" loading="lazy" decoding="async" width="56" height="56">
      </NuxtLink>
      <NuxtLinkLocale :to="moreTo || '/arts/new'" class="cbn-pick cbn-more" :title="$t('p_cbn.morePixelArt')">
        <span class="icon icon-angle-right"/>
      </NuxtLinkLocale>
    </nav>
  </div>
</template>

<style scoped>
.cbn-page {
  flex: 1;
  min-height: 0;
}

.cbn-page > :first-child {
  flex: 1;
  min-height: 0;
}

.cbn-fallback {
  flex: 1;
  display: grid;
  place-items: center;
  padding: var(--space-6);
}

.cbn-fallback img {
  width: min(100%, 320px);
  height: auto;
  image-rendering: pixelated;
}

.cbn-picks {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  overflow-x: auto;
  border-top: 1px solid var(--border);
}

.cbn-pick {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: calc(var(--space-6) * 4);
  height: calc(var(--space-6) * 4);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color var(--transition);
}

.cbn-pick img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}

.cbn-pick.on {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary);
}

@media (hover: hover) and (pointer: fine) {
  .cbn-pick:hover {
    border-color: var(--primary);
  }
}

.cbn-more {
  color: var(--muted);
}
</style>
