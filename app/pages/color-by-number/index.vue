<script setup lang="ts">
import {CBN_COLLECTIONS} from '~/helper/cbn-collections'

const route = useRoute()
const {t} = useI18n()
const k = (key: string, p?: Record<string, any>) => t(`p_cbn.${key}`, p || {})

const PAGE_URL = 'https://simplepixelart.com/color-by-number'
const STORE_URL = 'https://chromewebstore.google.com/detail/pixel-art-color-by-number/hellpcacohmobfpileciocbpbojljpec'
const IMG = '/images/color-by-number'
const TITLE = computed(() => k('title'))
const DESC = computed(() => k('desc'))

// Small, easy pictures with no third-party characters in them.
const PICKS = [
  'penguin', 'cute-cat', 'little-raccoon', 'pumpkin-halloween', 'swimming-koi-fish', 'juicy-watermelon-slice',
  'morning-tea-cup', 'chubby-blue-cat', 'cat-under-a-sprout', 'little-ghost', 'fresh-carrot', 'brass-key',
]

const steps = computed(() => [1, 2, 3].map(i => ({name: k(`step${i}n`), text: k(`step${i}t`)})))
const faq = computed(() => [1, 2, 3, 4, 5].map(i => ({q: k(`faq${i}q`), a: k(`faq${i}a`)})))

// Translated in every locale, each indexable with its own canonical; a
// picture's own query (?art=) points back to the page.
const indexable = computed(() => !route.query.art)
const colHeading = (slug: string) => k(`col_${slug}_heading`)

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
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SoftwareApplication',
            name: k('appName'),
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web, Chrome',
            url: PAGE_URL,
            installUrl: STORE_URL,
            image: `https://simplepixelart.com${IMG}/og.jpg`,
            description: DESC.value,
            offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
            publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
          },
          {
            '@type': 'FAQPage',
            mainEntity: faq.value.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
          },
        ],
      }),
    },
  ],
})
</script>

<template>
  <ToolLayout :title="k('h1')" title-tag="h1">
    <CbnPlay :picks="PICKS"/>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>{{ k('howToPlayGame') }}</h2>
      <ol>
        <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}</strong> {{ s.text }}</li>
      </ol>
      <p class="text-xs text-muted">{{ k('controlsHint') }}</p>
      <h2>{{ k('chromeH2') }}</h2>
      <p>{{ k('chromeP') }}</p>
      <p><a :href="STORE_URL" class="btn primary" target="_blank" rel="noopener">{{ k('chromeBtn') }}</a></p>
      <h2>{{ k('collectionsH2') }}</h2>
      <ul>
        <li v-for="c in CBN_COLLECTIONS" :key="c.slug">
          <NuxtLinkLocale :to="`/color-by-number/${c.slug}`">{{ colHeading(c.slug) }}</NuxtLinkLocale>
        </li>
      </ul>
      <h2>{{ k('makeOwnH2') }}</h2>
      <ul>
        <li><NuxtLinkLocale to="/converter">{{ k('linkConverter') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/editor">{{ k('linkEditor') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/easy-pixel-art">{{ k('linkEasy') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/palettes">{{ k('linkPalettes') }}</NuxtLinkLocale></li>
      </ul>
      <h2>{{ k('faqH2') }}</h2>
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
