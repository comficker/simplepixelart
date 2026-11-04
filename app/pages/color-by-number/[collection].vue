<script setup lang="ts">
import {CBN_COLLECTIONS, CBN_MIN_PICTURES} from '~/helper/cbn-collections'

const route = useRoute()
const config = useRuntimeConfig()
const {locale, defaultLocale} = useI18n()

const col = CBN_COLLECTIONS.find(c => c.slug === route.params.collection)
if (!col) throw createError({statusCode: 404, statusMessage: 'Not found', fatal: true})

const PAGE_URL = `https://simplepixelart.com/color-by-number/${col.slug}`

// One request per tag, merged in order without repeats.
const {data: picks} = await useAsyncData(`cbn-col-${col.slug}`, async () => {
  const lists = await Promise.all(col.tags.map(tag => useNativeFetch<any>('/coloring/shared-pages/', {
    params: {
      slug: `/arts/${tag}`, status: 'public', is_template: 'true', is_anim: 'false',
      width__lt: 49, height__lt: 49, page_size: 40,
    },
  }).catch(() => null)))
  const out: string[] = []
  for (const l of lists) for (const it of l?.results || []) {
    if (!out.includes(it.id_string)) out.push(it.id_string)
  }
  return out
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
  ogImage: 'https://simplepixelart.com/images/color-by-number/og.jpg',
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${col.name} Color by Number`,
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
  <ToolLayout :title="`${col!.name} Color by Number`" title-tag="h1">
    <CbnPlay v-if="picks.length" :picks="picks" :more-to="`/arts/${col!.tags[0]}`"/>

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
          <NuxtLink :to="`/color-by-number/${c.slug}`">{{ c.name }} color by number</NuxtLink>
        </li>
        <li><NuxtLink to="/color-by-number">All color by number pictures</NuxtLink></li>
      </ul>
    </template>
  </ToolLayout>
</template>
