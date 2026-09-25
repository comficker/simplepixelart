<script setup lang="ts">
const {t} = useI18n()
import type {APIResponse, ResponseSharedPage, SharedPage, TagSchema} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const idString = computed(() => route.params.id_string?.toString() || '')

const isSizeSlug = computed(() => /^size-\d+x\d+$/i.test(idString.value))
const isColorSlug = computed(() => /^color-[0-9a-f]{3,8}$/i.test(idString.value))
const isNewSlug = computed(() => idString.value === 'new')
const isValidSlug = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idString.value))
const sizeFromSlug = computed(() => {
  const m = idString.value.match(/^size-(\d+)x(\d+)$/i)
  return m ? `${m[1]}×${m[2]}` : null
})

const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
)

const tagFetch = (isSizeSlug.value || isColorSlug.value || isNewSlug.value || !isValidSlug.value)
    ? null
    : useAuthFetch<TagSchema>(`/coloring/tags/${idString.value}/`, { key: `tag-${idString.value}` })

const statsFetch = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    slug: `/arts/${idString.value}`,
    status: 'public',
    page_size: 10,
  },
  key: `tag-stats-${idString.value}`,
})

const relatedFetch = useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {page_size: 30, has_pages: 1},
  key: 'tag-related',
})

const gridPrewarm = useArtListFetch({limit: 24}).fetch

await Promise.all([tagFetch, statsFetch, relatedFetch, gridPrewarm].filter(Boolean))
const tag = tagFetch ? tagFetch.data : ref<TagSchema | null>(null)
const tagError = tagFetch ? tagFetch.error : ref<any>(null)
const {data: stats} = statsFetch
const {data: relatedTags} = relatedFetch

const tagTitle = computed(() => {
  if (tag.value?.title) return tag.value.title
  if (tag.value?.name) return tag.value.name
  if (sizeFromSlug.value) return sizeFromSlug.value
  return idString.value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
})
const tagDesc = computed(() => tag.value?.desc || '')

const totalCount = computed(() => stats.value?.count || 0)
const firstSample = computed<SharedPage | undefined>(() => stats.value?.results?.[0])

const recentUpdated = computed(() => firstSample.value?.updated || tag.value?.updated || null)

const filteredRelated = computed(() =>
    (relatedTags.value?.results || [])
        .filter(t => t.id_string !== idString.value)
        .slice(0, 20),
)

const fallbackDesc = computed(() =>
    t('p_arts_id_string.browseXPixelArtCreations', {tag: tagTitle.value.toLowerCase()}),
)

const canonicalUrl = computed(() => {
  if (isNewSlug.value) return 'https://simplepixelart.com/arts'
  const base = `https://simplepixelart.com/arts/${idString.value}`
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const tagLookupFailed = computed(() => {
  const s = tagError.value?.statusCode
  return !!tagError.value && s !== 404
})

const isUnknownTag = computed(() => {
  if (isSizeSlug.value || isColorSlug.value || isNewSlug.value) return false
  if (!isValidSlug.value) return true
  if (tagLookupFailed.value) return false
  return !tag.value
})

const robotsValue = computed(() => {
  if (isUnknownTag.value) return 'noindex, follow'
  if (isNewSlug.value) return 'noindex, follow'
  if (hasFilterQuery.value) return 'noindex, follow'
  if (page.value > 1) return 'noindex, follow'
  if ((isColorSlug.value || isSizeSlug.value) && totalCount.value === 0) return 'noindex, follow'
  return 'index, follow'
})

if (isUnknownTag.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const ogImage = computed(() => {
  if (firstSample.value?.id_string) {
    return `${config.public.api}/coloring/files/art-social/${firstSample.value.id_string}.png`
  }
  return 'https://simplepixelart.com/og-image.png'
})

const seoTitle = computed(() => {
  if (page.value > 1) return `${tagTitle.value} Pixel Art — Page ${page.value}`
  if (isSizeSlug.value && totalCount.value) {
    return `${tagTitle.value} Pixel Art — ${totalCount.value} Sprites`
  }
  return `${tagTitle.value} Pixel Art — Free Sprites`
})

const seoDesc = computed(() => {
  if (tagDesc.value) {
    return `${tagDesc.value} Browse ${totalCount.value || 'free'} ${tagTitle.value.toLowerCase()} pixel art creations — remix or download for your game, NFT, or project on SimplePixelArt.com.`
  }
  return `Browse ${totalCount.value || 'free'} ${tagTitle.value.toLowerCase()} pixel art creations on SimplePixelArt.com — 8-bit and 16-bit sprites, designs, and templates ready to remix or download.`
})

const seoKeywords = computed(() => {
  const t = tagTitle.value.toLowerCase()
  return [
    `${t} pixel art`,
    `${t} sprite`,
    `${t} sprites`,
    `${t} 8-bit`,
    `${t} 16-bit`,
    `${t} pixel art template`,
    `${t} pixel art free`,
    `pixel art ${t}`,
    `${t} pixel art download`,
    `${t} pixel art gallery`,
    'pixel art community',
  ].join(', ')
})

const items = computed(() => {
  const list = stats.value?.results || []
  return list.slice(0, 10)
})

const structuredData = computed(() => {
  const url = canonicalUrl.value
  const graph: any[] = [
    {
      '@type': 'CollectionPage',
      '@id': url,
      url,
      name: seoTitle.value,
      description: seoDesc.value,
      about: {
        '@type': 'Thing',
        name: tagTitle.value,
        ...(tagDesc.value ? {description: tagDesc.value} : {}),
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'SimplePixelArt.com',
        url: 'https://simplepixelart.com/',
      },
      ...(recentUpdated.value ? {dateModified: recentUpdated.value} : {}),
      ...(totalCount.value ? {numberOfItems: totalCount.value} : {}),
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: items.value.length,
        itemListElement: items.value.map((it, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `https://simplepixelart.com/art/${it.id_string}`,
          name: it.name || tagTitle.value,
          image: `${config.public.api}/coloring/files/art-social/${it.id_string}.png`,
        })),
      },
    },
  ]
  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
})


useCustomSeoMeta({
  untranslated: true,
  title: seoTitle,
  description: seoDesc,
  keywords: seoKeywords,
  canonical: canonicalUrl,
  robots: robotsValue,
  ogImage: ogImage,
  ogType: 'website',
  modifiedTime: () => recentUpdated.value || undefined,
  script: [
    {type: 'application/ld+json', innerHTML: JSON.stringify(structuredData.value)},
  ],
})

</script>

<template>
  <div class="page">
    <item-list :limit="24" show-filter :title="$t('p_arts_id_string.xPixelArt', {x: tagTitle})" :desc="tagDesc || fallbackDesc">
      <template v-if="filteredRelated.length" #filters-extra>
        <BrowseFilter :label="$t('common.tags')" icon="icon-flag" :value="String(filteredRelated.length)">
          <BrowseOpt v-for="t in filteredRelated" :key="t.id_string" :to="`/arts/${t.id_string}`">
            {{ t.title || t.name }}
          </BrowseOpt>
        </BrowseFilter>
      </template>
    </item-list>
  </div>
</template>
