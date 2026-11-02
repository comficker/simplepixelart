<script setup lang="ts">
import type {ResponseSharedPage} from '~/types'

const {t} = useI18n()
const localHtml = useLocalHtml()

/** Themes people search "<x> pixel art ideas" for, each an existing tag with
 *  enough public art to fill a row. The row links on to the full tag page. */
const THEMES = [
  'cute', 'kawaii', 'animal', 'cat', 'bird', 'food',
  'fruit', 'nature', 'halloween', 'character', 'fantasy', 'emoji',
] as const
const PER_THEME = 6

const rows = await Promise.all(THEMES.map(tag =>
    useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
      params: {slug: `/arts/${tag}`, status: 'public', page_size: PER_THEME},
      key: `ideas-${tag}`,
    }),
))

const themes = computed(() => THEMES
    .map((tag, i) => ({tag, items: rows[i]!.data.value?.results?.slice(0, PER_THEME) || []}))
    .filter(th => th.items.length))

// Rounded down to a ten so the title does not change every time one row
// gains or loses a piece.
const ideaCount = computed(() => {
  const n = themes.value.reduce((sum, th) => sum + th.items.length, 0)
  return Math.max(10, Math.floor(n / 10) * 10)
})

const config = useRuntimeConfig()
const firstArt = computed(() => themes.value[0]?.items[0])

useCustomSeoMeta({
  title: () => t('p_ideas.seoTitle', {count: ideaCount.value}),
  description: () => t('p_ideas.seoDescription'),
  keywords: 'pixel art ideas, easy pixel art ideas, cute pixel art ideas, ideas for pixel art, pixel art ideas easy, simple pixel art ideas, what to draw pixel art',
  canonical: 'https://simplepixelart.com/ideas',
  ogImage: () => firstArt.value
      ? `${config.public.api}/coloring/files/art-social/${firstArt.value.id_string}.png`
      : 'https://simplepixelart.com/og-image.png',
  ogType: 'website',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: t('p_ideas.seoTitle', {count: ideaCount.value}),
        url: 'https://simplepixelart.com/ideas',
        hasPart: themes.value.map(th => ({
          '@type': 'ItemList',
          name: t('p_ideas.themeIdeas', {theme: t(`p_ideas.theme_${th.tag}`)}),
          url: `https://simplepixelart.com/arts/${th.tag}`,
          numberOfItems: th.items.length,
        })),
      }),
    },
  ],
})
</script>

<template>
  <ToolLayout :title="$t('p_ideas.pixelArtIdeas')" title-tag="h1">
    <Widget
        v-for="(th, i) in themes"
        :key="th.tag"
        :title="$t('p_ideas.themeIdeas', {theme: $t(`p_ideas.theme_${th.tag}`)})"
    >
      <template #ctl>
        <NuxtLinkLocale :to="`/arts/${th.tag}`" class="widget-ctl-btn">
          <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
        </NuxtLinkLocale>
      </template>
      <div class="results">
        <ItemCard v-for="(item, j) in th.items" :key="item.id" :value="item" :priority="i === 0 && j < 3"/>
      </div>
    </Widget>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>{{ $t('p_ideas.pixelArtIdeas') }}</h2>
      <p>{{ $t('p_ideas.intro') }}</p>

      <h2>{{ $t('p_ideas.howToPick') }}</h2>
      <ul>
        <li v-for="n in 3" :key="n" v-html="localHtml($t(`p_ideas.tip${n}`))"/>
      </ul>

      <p>
        <NuxtLinkLocale to="/editor?new=true" class="btn">{{ $t('p_ideas.startDrawing') }}</NuxtLinkLocale>
      </p>
    </template>
  </ToolLayout>
</template>
