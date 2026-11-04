<script setup lang="ts">
import {CBN_COLLECTIONS, CBN_MIN_PICTURES, cbnPlayable, cbnHeading, type CbnCollection} from '~/helper/cbn-collections'

const route = useRoute()
const config = useRuntimeConfig()
const {locale, defaultLocale} = useI18n()

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

// English only; the other locales, each picture's own query and a thin
// collection all point Google back to the one page.
const indexable = computed(() => locale.value === defaultLocale && !route.query.art && picks.value.length >= CBN_MIN_PICTURES)

useCustomSeoMeta({
  title: col.title,
  description: col.description,
  keywords: `${col.name.toLowerCase()} color by number, ${col.name.toLowerCase()} pixel art, color by number online, free color by number`,
  canonical: PAGE_URL,
  robots: () => indexable.value ? 'index, follow' : 'noindex, follow',
  ogType: 'website',
  // Each collection has its own card (its pictures on a seasonal colour),
  // so a shared link shows what is inside.
  ogImage: `https://simplepixelart.com/images/color-by-number/og-${col.slug}.png`,
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: cbnHeading(col),
      url: PAGE_URL,
      description: col.description,
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
  <ToolLayout :title="cbnHeading(col!)" title-tag="h1">
    <CbnPlay v-if="picks.length" :picks="picks" :more-to="col!.moreTo || `/arts/${col!.tags[0]}`"/>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <p>{{ col!.intro }}</p>
      <h2>How to play</h2>
      <ol>
        <li><strong>Pick a picture</strong> from the row below.</li>
        <li><strong>Choose a number</strong> and its squares light up.</li>
        <li><strong>Fill the squares</strong> with a pencil, watercolor or crayon brush.</li>
      </ol>
      <h2>More color by number</h2>
      <ul>
        <li v-for="c in others" :key="c.slug">
          <NuxtLink :to="`/color-by-number/${c.slug}`">{{ cbnHeading(c) }}</NuxtLink>
        </li>
        <li><NuxtLink to="/color-by-number">All color by number pictures</NuxtLink></li>
      </ul>
      <h2>Make your own pixel art</h2>
      <ul>
        <li><NuxtLink to="/converter">Turn a photo into pixel art</NuxtLink></li>
        <li><NuxtLink to="/editor">Draw pixel art online</NuxtLink></li>
        <li><NuxtLink to="/easy-pixel-art">Easy pixel art to start with</NuxtLink></li>
        <li><NuxtLink to="/palettes">Color palettes for pixel art</NuxtLink></li>
      </ul>
    </template>
  </ToolLayout>
</template>
