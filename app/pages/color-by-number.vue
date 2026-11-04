<script setup lang="ts">
import type {ResponseSharedPage} from '~/types'

const {locale, defaultLocale} = useI18n()

const PAGE_URL = 'https://simplepixelart.com/color-by-number'
const STORE_URL = 'https://chromewebstore.google.com/detail/pixel-art-color-by-number/hellpcacohmobfpileciocbpbojljpec'
const IMG = '/images/color-by-number'
const TITLE = 'Pixel Art Color by Number – Free Chrome Extension'
const DESC = 'Relaxing pixel art color by number in your browser: pick a picture, choose a number, fill the squares. Free, no ads, no sign-up, works offline.'

// Small, easy pictures with no third-party characters in them: these are
// the ones the page points people to, and links shared from here travel.
const PICKS = [
  'penguin', 'cute-cat', 'little-raccoon', 'pumpkin-halloween', 'swimming-koi-fish', 'juicy-watermelon-slice',
  'morning-tea-cup', 'chubby-blue-cat', 'cat-under-a-sprout', 'little-ghost', 'fresh-carrot', 'brass-key',
]

const {data} = await useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {status: 'public', is_template: true, is_anim: false, width__lt: 49, height__lt: 49, ordering: '-score,-id', page_size: 80},
  key: 'color-by-number-picks',
})
const picks = computed(() => {
  const bySlug = new Map((data.value?.results || []).map(r => [r.id_string, r]))
  return PICKS.map(s => bySlug.get(s)).filter(Boolean)
})

const steps = [
  {name: 'Pick a picture', text: 'Open the extension and choose one of hundreds of small pixel art pictures: cats, food, fruit, Halloween and more.'},
  {name: 'Choose a number', text: 'Tap a number in the palette. Every square with that number lights up, and the palette shows how many are left.'},
  {name: 'Fill the squares', text: 'Click or drag to color. Wrong squares stay empty, so the picture always comes out right.'},
]

const faq = [
  {q: 'Is it free?', a: 'Yes. No ads, no account and nothing to buy.'},
  {q: 'Does it work offline?', a: 'Pictures you have opened, and the gallery you last saw, open without a connection. Your progress is saved on your computer.'},
  {q: 'Where do the pictures come from?', a: 'From SimplePixelArt.com, a free community for making and sharing pixel art. Finished a picture? Open it here to remix it or draw your own.'},
  {q: 'Can I keep what I colored?', a: 'Download any finished picture as a crisp PNG, or copy a link to it.'},
]

// Written in English only; the other locales point Google back here.
const translated = computed(() => locale.value === defaultLocale)

useCustomSeoMeta({
  title: TITLE,
  description: DESC,
  keywords: 'pixel art color by number, color by number, pixel color by number, color by number online, color by number game, paint by number, pixel coloring, chrome extension coloring',
  canonical: PAGE_URL,
  robots: () => translated.value ? 'index, follow' : 'noindex, follow',
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
            operatingSystem: 'Chrome',
            url: STORE_URL,
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
    <div class="screen">
      <Widget title="Color pixel art, square by square">
        <div class="cbn-hero">
          <img :src="`${IMG}/demo.webp`" alt="A penguin being colored by number, one color at a time" width="480" height="480" class="cbn-demo">
          <div class="cbn-pitch">
            <p class="cbn-lead">
              A calm little coloring book for your browser. Pick a picture, choose a number, fill the squares and
              watch it come to life.
            </p>
            <ol class="cbn-steps">
              <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}.</strong> {{ s.text }}</li>
            </ol>
            <p class="cbn-cta">
              <a :href="STORE_URL" class="btn primary" target="_blank" rel="noopener">Add to Chrome — it's free</a>
              <span class="text-xs text-muted">No ads · no sign-up · works offline</span>
            </p>
          </div>
        </div>
      </Widget>

      <Widget v-if="picks.length" title="Pictures to color" to="/arts/new">
        <div class="results">
          <ItemCard v-for="item in picks" :key="item.id" :value="item"/>
        </div>
      </Widget>
    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>Pixel art color by number</h2>
      <p>
        Color by number with pixel art is the quietest way to make a picture: every square already has its color,
        you only fill it in. The extension brings hundreds of free pictures from SimplePixelArt.com into a tab of
        their own.
      </p>
      <h2>Questions</h2>
      <dl class="cbn-faq">
        <template v-for="f in faq" :key="f.q">
          <dt>{{ f.q }}</dt>
          <dd>{{ f.a }}</dd>
        </template>
      </dl>
      <p>
        Want to draw instead? Try the <NuxtLinkLocale to="/editor?new=true">free pixel art editor</NuxtLinkLocale>
        or browse <NuxtLinkLocale to="/ideas">pixel art ideas</NuxtLinkLocale>.
      </p>
    </template>
  </ToolLayout>
</template>

<style scoped>
.cbn-hero {
  display: grid;
  grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: var(--space-6);
  align-items: center;
  padding: var(--space-6);
}

.cbn-demo {
  width: 100%;
  height: auto;
  image-rendering: pixelated;
  border-radius: var(--radius-sm);
}

.cbn-lead {
  margin: 0 0 var(--space-4);
  font-size: var(--text-base);
}

.cbn-steps {
  margin: 0 0 var(--space-6);
  padding-left: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.cbn-cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
}

.cbn-faq dt {
  font-weight: 600;
  margin-top: var(--space-4);
}

.cbn-faq dd {
  margin: var(--space-1) 0 0;
}

@media (max-width: 720px) {
  .cbn-hero {
    grid-template-columns: 1fr;
  }
}
</style>
