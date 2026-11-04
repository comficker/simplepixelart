<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const {locale, defaultLocale} = useI18n()

const PAGE_URL = 'https://simplepixelart.com/color-by-number'
const STORE_URL = 'https://chromewebstore.google.com/detail/pixel-art-color-by-number/hellpcacohmobfpileciocbpbojljpec'
const IMG = '/images/color-by-number'
const TITLE = 'Pixel Art Color by Number – Free Online & Chrome Extension'
const DESC = 'Relaxing pixel art color by number, right here in your browser: pick a picture, choose a number, fill the squares. Free, no ads, no sign-up.'

// Small, easy pictures with no third-party characters in them.
const PICKS = [
  'penguin', 'cute-cat', 'little-raccoon', 'pumpkin-halloween', 'swimming-koi-fish', 'juicy-watermelon-slice',
  'morning-tea-cup', 'chubby-blue-cat', 'cat-under-a-sprout', 'little-ghost', 'fresh-carrot', 'brass-key',
]

const slug = computed(() => {
  const q = String(route.query.art || '')
  return /^[a-z0-9-]+$/.test(q) ? q : PICKS[0]
})

const {data: art} = await useAuthFetch<any>(() => `/coloring/shared-pages/${slug.value}/`, {
  key: 'cbn-art',
  watch: [slug],
})
const playable = computed(() => art.value?.map_numbers && art.value?.colors ? art.value : null)

const thumb = (s: string) => `${config.public.api}/coloring/files/art-thumb/${s}.png`

const steps = [
  {name: 'Pick a picture', text: 'from the row below.'},
  {name: 'Choose a number', text: 'and its squares light up.'},
  {name: 'Fill the squares', text: 'wrong ones stay empty.'},
]

const faq = [
  {q: 'Is it free?', a: 'Yes. No ads, no account, nothing to buy.'},
  {q: 'Is my progress saved?', a: 'Yes, in this browser. Come back to any picture and carry on.'},
  {q: 'Can I color offline?', a: 'The Chrome extension keeps the pictures you started and works offline.'},
]

// Written in English only; the other locales, and each picture's own query,
// point Google back to the one page.
const indexable = computed(() => locale.value === defaultLocale && !route.query.art)

useCustomSeoMeta({
  title: TITLE,
  description: DESC,
  keywords: 'pixel art color by number, color by number, pixel color by number, color by number online, color by number game, paint by number, pixel coloring, chrome extension coloring',
  canonical: PAGE_URL,
  robots: () => indexable.value ? 'index, follow' : 'noindex, follow',
  ogType: 'website',
  ogImage: `https://simplepixelart.com${IMG}/og.jpg`,
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: 'Pixel Art Color by Number',
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web, Chrome',
            url: PAGE_URL,
            installUrl: STORE_URL,
            image: `https://simplepixelart.com${IMG}/og.jpg`,
            description: DESC,
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'FAQPage',
            mainEntity: faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
          },
        ],
      }),
    },
  ],
})
</script>

<template>
  <ToolLayout title="Pixel Art Color by Number" title-tag="h1">
    <div class="flat-editor cbn-page">
      <ClientOnly>
        <ColorByNumber :art="playable"/>
        <template #fallback>
          <div class="cbn-fallback">
            <img :src="`${IMG}/demo.webp`" alt="A penguin being colored by number" width="480" height="480">
          </div>
        </template>
      </ClientOnly>
      <nav class="cbn-picks" aria-label="Pictures to color">
        <NuxtLink
            v-for="s in PICKS"
            :key="s"
            :to="{query: {art: s}}"
            replace
            class="cbn-pick"
            :class="{on: s === slug}"
            :title="s.replace(/-/g, ' ')"
        >
          <img :src="thumb(s)" :alt="`${s.replace(/-/g, ' ')} pixel art to color`" loading="lazy" width="56" height="56">
        </NuxtLink>
        <NuxtLinkLocale to="/arts/new" class="cbn-pick cbn-more" title="More pixel art">
          <span class="icon icon-angle-right"/>
        </NuxtLinkLocale>
      </nav>
    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>How to play</h2>
      <ol>
        <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}</strong> {{ s.text }}</li>
      </ol>
      <p class="text-xs text-muted">Scroll to zoom · hold Space and drag to move</p>
      <h2>Chrome extension</h2>
      <p>Hundreds more pictures, offline, one click away.</p>
      <p><a :href="STORE_URL" class="btn primary" target="_blank" rel="noopener">Add to Chrome — it's free</a></p>
      <h2>Questions</h2>
      <dl class="cbn-faq">
        <template v-for="f in faq" :key="f.q">
          <dt>{{ f.q }}</dt>
          <dd>{{ f.a }}</dd>
        </template>
      </dl>
    </template>
  </ToolLayout>
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

.cbn-faq dt {
  font-weight: 600;
  margin-top: var(--space-4);
}

.cbn-faq dd {
  margin: var(--space-1) 0 0;
}
</style>
