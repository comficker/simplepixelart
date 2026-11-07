<script setup lang="ts">
import {CBN_COLLECTIONS, CBN_MIN_PICTURES, cbnPlayable, type CbnCollection} from '~/helper/cbn-collections'

const route = useRoute()
const config = useRuntimeConfig()
const {t} = useI18n()
const k = (key: string) => t(`p_cbn.${key}`)

const col = CBN_COLLECTIONS.find(c => c.slug === route.params.collection)
if (!col) throw createError({statusCode: 404, statusMessage: 'Not found', fatal: true})

const PAGE_URL = `https://simplepixelart.com/color-by-number/${col.slug}`

// One request per source, merged in order without repeats; pictures of the
// collections it excludes are fetched the same way and left out.
const BASE = {status: 'public', is_template: 'true', is_anim: 'false', width__lt: 49, height__lt: 49}
const sourcesOf = (c: CbnCollection) => c.queries || c.tags.map(tag => ({slug: `/arts/${tag}`, page_size: 40}))
async function collect(c: CbnCollection) {
  const lists = await Promise.all(sourcesOf(c).map(q => useNativeFetch<any>('/coloring/shared-pages/', {
    params: {...BASE, page_size: 100, ...q},
  }).catch(() => null)))
  const out: string[] = []
  // Copies of one picture differ only by a number on the end of the slug.
  const seen = new Set<string>()
  for (const l of lists) for (const it of l?.results || []) {
    const base = it.id_string.replace(/-\d+$/, '')
    if (seen.has(base) || !cbnPlayable(it)) continue
    if (c.minSide && Math.min(it.width, it.height) < c.minSide) continue
    seen.add(base)
    out.push(it.id_string)
  }
  return out
}

const {data: picks} = await useAsyncData(`cbn-col-${col.slug}`, async () => {
  const [mine, ...others] = await Promise.all([col, ...CBN_COLLECTIONS.filter(c => col.exclude?.includes(c.slug))].map(collect))
  const skip = new Set(others.flat().map(s => s.replace(/-\d+$/, '')))
  return mine.filter(s => !skip.has(s.replace(/-\d+$/, ''))).slice(0, 40)
}, {default: () => [] as string[]})

const others = CBN_COLLECTIONS.filter(c => c.slug !== col.slug)
const colText = (slug: string, field: 'heading' | 'title' | 'description' | 'intro') => k(`col_${slug}_${field}`)

// Translated in every locale; each picture's own query and a thin
// collection point Google back to the page.
const indexable = computed(() => !route.query.art && picks.value.length >= CBN_MIN_PICTURES)

useCustomSeoMeta({
  title: () => colText(col.slug, 'title'),
  description: () => colText(col.slug, 'description'),
  keywords: `${col.name.toLowerCase()} color by number, ${col.name.toLowerCase()} pixel art, color by number online, free color by number`,
  canonical: PAGE_URL,
  robots: () => indexable.value ? 'index, follow' : 'noindex, follow',
  ogType: 'website',
  // Each collection has its own card (its pictures on a seasonal colour),
  // so a shared link shows what is inside.
  ogImage: `https://simplepixelart.com/images/color-by-number/og-${col.slug}.png`,
  script: [{
    type: 'application/ld+json',
    innerHTML: () => JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: colText(col.slug, 'heading'),
      url: PAGE_URL,
      description: colText(col.slug, 'description'),
      isPartOf: {'@type': 'WebPage', url: 'https://simplepixelart.com/color-by-number'},
      // The pictures on the page, so search engines see what can be colored.
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: picks.value.length,
        itemListElement: picks.value.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `https://simplepixelart.com/art/${s}`,
          name: s.replace(/-\d+$/, '').replace(/-/g, ' '),
          image: `${config.public.api}/coloring/files/art-thumb/${s}.png`,
        })),
      },
    }),
  }],
})
</script>

<template>
  <ToolLayout :title="colText(col!.slug, 'heading')" title-tag="h1">
    <CbnPlay v-if="picks.length" :picks="picks" :more-to="col!.moreTo || `/arts/${col!.tags[0]}`"/>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <p>{{ colText(col!.slug, 'intro') }}</p>
      <h2>{{ k('howToPlay') }}</h2>
      <ol>
        <li><strong>{{ k('step1n') }}</strong> {{ k('step1t') }}</li>
        <li><strong>{{ k('step2n') }}</strong> {{ k('step2t') }}</li>
        <li><strong>{{ k('step3n') }}</strong> {{ k('step3tBrush') }}</li>
      </ol>
      <h2>{{ k('moreCbn') }}</h2>
      <ul>
        <li v-for="c in others" :key="c.slug">
          <NuxtLinkLocale :to="`/color-by-number/${c.slug}`">{{ colText(c.slug, 'heading') }}</NuxtLinkLocale>
        </li>
        <li><NuxtLinkLocale to="/color-by-number">{{ k('allCbn') }}</NuxtLinkLocale></li>
      </ul>
      <h2>{{ k('makeOwnH2') }}</h2>
      <ul>
        <li><NuxtLinkLocale to="/converter">{{ k('linkConverter') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/editor">{{ k('linkEditor') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/easy-pixel-art">{{ k('linkEasy') }}</NuxtLinkLocale></li>
        <li><NuxtLinkLocale to="/palettes">{{ k('linkPalettes') }}</NuxtLinkLocale></li>
      </ul>
    </template>
  </ToolLayout>
</template>
