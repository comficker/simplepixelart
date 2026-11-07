<script setup lang="ts">
import {CBN_COLLECTIONS} from '~/helper/cbn-collections'
const {t, te, locale, defaultLocale} = useI18n()
const localHtml = useLocalHtml()
import type {APIResponse, ResponseSharedPage, SharedPage, TagSchema} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const idString = computed(() => route.params.id_string?.toString() || '')
// A tag with its own color by number collection links straight to it.
const cbnLink = computed(() => {
  const c = CBN_COLLECTIONS.find(x => x.tags.includes(idString.value))
  return c ? `/color-by-number/${c.slug}` : '/color-by-number'
})

const isSizeSlug = computed(() => /^size-\d+x\d+$/i.test(idString.value))
const isColorSlug = computed(() => /^color-[0-9a-f]{3,8}$/i.test(idString.value))
const isNewSlug = computed(() => idString.value === 'new')
// Underscores too: older tags such as moonstone_pickaxe have them, and the
// sitemap lists them.
const isValidSlug = computed(() => /^[a-z0-9_]+(?:-[a-z0-9_]+)*$/.test(idString.value))
const sizeFromSlug = computed(() => {
  const m = idString.value.match(/^size-(\d+)x(\d+)$/i)
  return m ? `${m[1]}×${m[2]}` : null
})

// A size gallery opens an empty canvas of that size in the editor, for
// people who searched "16x16 pixel art generator" and want to start drawing.
const sizeCanvas = computed(() => {
  const m = idString.value.match(/^size-(\d+)x(\d+)$/i)
  if (!m || +m[1] > 128 || +m[2] > 128) return null
  return {to: `/editor?new=true&w=${+m[1]}&h=${+m[2]}`, label: `${+m[1]}×${+m[2]}`}
})

const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.is_anim || route.query.license || route.query.sort || route.query.search),
)

const tagFetch = (isSizeSlug.value || isColorSlug.value || isNewSlug.value || !isValidSlug.value)
    ? null
    : useAuthFetch<TagSchema>(`/coloring/tags/${idString.value}/`, { key: `tag-${locale.value}-${idString.value}` })

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
  key: `tag-related-${locale.value}`,
})

const gridPrewarm = useArtListFetch({limit: 24}).fetch

await Promise.all([tagFetch, statsFetch, relatedFetch, gridPrewarm].filter(Boolean))
const tag = tagFetch ? tagFetch.data : ref<TagSchema | null>(null)
const tagError = tagFetch ? tagFetch.error : ref<any>(null)
const {data: stats, error: statsError} = statsFetch
const {data: relatedTags} = relatedFetch

const tagTitle = computed(() => {
  if (tag.value?.title) return tag.value.title
  if (tag.value?.name) return tag.value.name
  if (sizeFromSlug.value) return sizeFromSlug.value
  return idString.value.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
})
// The tag row's `desc` is written in English only -- there is no
// desc_translations to go with title_translations -- so outside /arts/x it is
// dropped rather than stranding an English sentence in Japanese.
const localDesc = computed(() =>
    locale.value === defaultLocale ? (tag.value?.desc || '') : '',
)

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
  // Colour slugs are a crawl trap (one per hex swatch, disallowed in robots.txt)
  // with ~no search traffic; keep them out of the index, still crawlable to arts.
  if (isColorSlug.value) return 'noindex, follow'
  if (isNewSlug.value) return 'noindex, follow'
  if (hasFilterQuery.value) return 'noindex, follow'
  if (page.value > 1) return 'noindex, follow'
  // Any empty listing, not just a colour or size slug. 96 of 630 tags have a
  // row but no public art left, and they were serving 200 with an empty grid --
  // which is what Search Console counts as a soft 404.
  // Only when the count is actually known: a failed request reads as zero, and
  // noindexing a good page over an API blip is the worse mistake.
  if (!statsError.value && stats.value && totalCount.value === 0) return 'noindex, follow'
  return 'index, follow'
})

// An unknown slug's list request ignores the slug and counts every public
// art, which put "Browse 1087 ..." in the title of a 404.
const shownCount = computed(() => isUnknownTag.value ? 0 : totalCount.value)

if (isUnknownTag.value && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const ogImage = computed(() => {
  if (firstSample.value?.id_string) {
    return `${config.public.api}/coloring/files/art-social/${firstSample.value.id_string}.png`
  }
  return 'https://simplepixelart.com/og-image.png'
})

// A few tags carry a whole search cluster ("pixel art animation", "pixel art
// character") that the generic "<Tag> Pixel Art — Free Sprites" misses. They
// get their own title, description and intro, written in English only.
const pageCopy = computed(() => {
  const key = `seo.tagPage.${idString.value}`
  if (locale.value !== defaultLocale || page.value > 1 || hasFilterQuery.value) return null
  return te(`${key}.title`, defaultLocale) ? key : null
})

const seoTitle = computed(() => {
  if (pageCopy.value) return t(`${pageCopy.value}.title`)
  if (page.value > 1) return t('seo.tag.titlePage', {tag: tagTitle.value, page: page.value})
  // Only past one: "32x32 Pixel Art - 1 Sprites" reads as a bug, and the
  // plain title already says everything at that point.
  if (isSizeSlug.value && shownCount.value > 1) {
    return t('seo.tag.titleCount', {tag: tagTitle.value, count: shownCount.value})
  }
  return t('seo.tag.title', {tag: tagTitle.value})
})

const seoDesc = computed(() => {
  if (pageCopy.value) return t(`${pageCopy.value}.description`, {count: shownCount.value})
  // `desc` is already a meta description, written to 140-160 characters by
  // rewrite_tag_desc. Appending the template to it made 300+, which Google
  // cuts in half, so it stands alone where it exists.
  if (localDesc.value) return localDesc.value
  const n = shownCount.value
  const args = {tag: tagTitle.value.toLowerCase(), count: n}
  // A size page gets its own wording: the generic "8-bit and 16-bit sprites"
  // read oddly on a 10x10 grid, and searchers also type "10 by 10".
  if (isSizeSlug.value && n > 1) {
    const [w, h] = sizeFromSlug.value!.split('×')
    return t('seo.size.description', {size: sizeFromSlug.value, by: `${w} by ${h}`, count: n})
  }
  // Three forms rather than one template with a number in it: every locale
  // here agrees the noun with the count, so "1 creations" and its Spanish and
  // Russian equivalents are all wrong, and vue-i18n's default plural rule only
  // knows two forms (which Russian needs three of).
  return n > 1 ? t('seo.tag.description', args)
      : n === 1 ? t('seo.tag.descriptionOne', args)
          : t('seo.tag.descriptionEmpty', args)
})

const seoKeywords = computed(() =>
    t('seo.tag.keywords', {tag: tagTitle.value.toLowerCase()}),
)

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
        ...(localDesc.value ? {description: localDesc.value} : {}),
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
    <item-list :limit="24" show-filter :title="$t('p_arts_id_string.xPixelArt', {x: tagTitle})" :desc="localDesc || fallbackDesc">
      <template v-if="pageCopy" #head>
        <h1 class="screen-title">{{ $t(`${pageCopy}.h1`) }}</h1>
        <p class="screen-desc" v-html="localHtml($t(`${pageCopy}.intro`))"/>
      </template>
      <template v-if="sizeCanvas || locale === defaultLocale" #actions>
        <NuxtLinkLocale v-if="sizeCanvas" :to="sizeCanvas.to" rel="nofollow" class="btn primary">
          <span class="icon icon-pen"/>
          <span>{{ $t('p_arts_id_string.drawOnXCanvas', {x: sizeCanvas.label}) }}</span>
        </NuxtLinkLocale>
        <NuxtLink v-if="locale === defaultLocale" :to="cbnLink" class="btn">Color pictures like this</NuxtLink>
      </template>
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
