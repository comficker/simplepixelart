<script setup lang="ts">
import {CBN_COLLECTIONS, cbnHeading} from '~/helper/cbn-collections'

const route = useRoute()
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

const steps = [
  {name: 'Pick a picture', text: 'from the row below.'},
  {name: 'Choose a number', text: 'and its squares light up.'},
  {name: 'Fill the squares', text: 'wrong ones stay empty.'},
]

const faq = [
  {q: 'Is this color by number free?', a: 'Yes. A free game with no ads, no sign-up and nothing to buy.'},
  {q: 'Is it color by number for adults too?', a: 'Yes. Zoom in, pick a bigger picture and color at your own pace. Many players are grown-ups unwinding after work.'},
  {q: 'Is it the same as paint by number?', a: 'Same idea: every square has a number, every number a color. Here you paint by number online, one pixel at a time.'},
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
    <CbnPlay :picks="PICKS"/>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>How to play this color by number game</h2>
      <ol>
        <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}</strong> {{ s.text }}</li>
      </ol>
      <p class="text-xs text-muted">Scroll to zoom · hold Space and drag to move</p>
      <h2>Free color by number app for Chrome</h2>
      <p>Hundreds more pictures, offline, one click away.</p>
      <p><a :href="STORE_URL" class="btn primary" target="_blank" rel="noopener">Add to Chrome — it's free</a></p>
      <h2>Color by number collections</h2>
      <ul>
        <li v-for="c in CBN_COLLECTIONS" :key="c.slug">
          <NuxtLink :to="`/color-by-number/${c.slug}`">{{ cbnHeading(c) }}</NuxtLink>
        </li>
      </ul>
      <h2>Make your own pixel art</h2>
      <ul>
        <li><NuxtLink to="/converter">Turn a photo into pixel art</NuxtLink></li>
        <li><NuxtLink to="/editor">Draw pixel art online</NuxtLink></li>
        <li><NuxtLink to="/easy-pixel-art">Easy pixel art to start with</NuxtLink></li>
        <li><NuxtLink to="/palettes">Color palettes for pixel art</NuxtLink></li>
      </ul>
      <h2>Color by number FAQ</h2>
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
.cbn-faq dt {
  font-weight: 600;
  margin-top: var(--space-4);
}

.cbn-faq dd {
  margin: var(--space-1) 0 0;
}
</style>
