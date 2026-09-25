<script setup lang="ts">
const {t} = useI18n()
import type {APIResponse, TagSchema} from "~/types";

const route = useRoute()
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
)

// Same-key kick-off so the artwork list and the tag list travel together
// instead of the grid waiting a whole round trip for the tags.
useArtListFetch({limit: 24})

const {data: tagsRes} = await useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {page_size: 30, has_pages: 1},
  key: 'arts-tags',
})

const tags = computed(() => tagsRes.value?.results || [])

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/arts'
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `${t('seo.arts.title')} — ${page.value}`
        : t('seo.arts.title'),
)

useCustomSeoMeta({
  title: seoTitle,
  description: () => t('seo.arts.description'),
  keywords: () => t('seo.arts.keywords'),
  canonical: canonicalUrl,
  robots: () => (page.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
  ogImage: 'https://simplepixelart.com/og-image.png',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Pixel Art Gallery',
        description: 'Curated collection of free pixel art creations from artists worldwide',
        url: canonicalUrl.value,
        isPartOf: {
          '@type': 'WebSite',
          name: 'SimplePixelArt.com',
          url: 'https://simplepixelart.com/'
        }
      })
    }
  ]
})
</script>

<template>
  <div class="page">
    <item-list
        :limit="24"
        show-filter
        :title="$t('p_arts.pixelArtGallery')"
        desc="Browse thousands of free pixel art creations — sprites, 8-bit and 16-bit designs, characters and icons. Remix any piece in the editor or download for your game, NFT, or project."
    >
      <template v-if="tags.length" #filters-extra>
        <BrowseFilter :label="$t('common.tags')" icon="icon-flag" :value="String(tagsRes?.count || tags.length)">
          <BrowseOpt v-for="t in tags" :key="t.id_string" :to="`/arts/${t.id_string}`">
            {{ t.title || t.name }}
          </BrowseOpt>
        </BrowseFilter>
      </template>
    </item-list>
  </div>
</template>
