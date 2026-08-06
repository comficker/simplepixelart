<script setup lang="ts">
import type {APIResponse, ResponseSharedPage, SharedPage, TagSchema} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const idString = computed(() => route.params.id_string?.toString() || '')

const isSizeSlug = computed(() => /^size-\d+x\d+$/i.test(idString.value))
const isColorSlug = computed(() => /^color-[0-9a-f]{3,8}$/i.test(idString.value))
// `/arts/new` is a sort-order variant of `/arts`, not a real tag — canonicalize
// to /arts so Google doesn't keep two near-identical listing URLs.
const isNewSlug = computed(() => idString.value === 'new')
// Real slugs are always lowercase kebab-case — tags come from the backend's
// `unique_slugify`, and the synthetic families are `size-WxH` / `color-XXXXXX`.
// Anything else (stray filter state, wrong case, injected junk) is not a page.
const isValidSlug = computed(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(idString.value))
const sizeFromSlug = computed(() => {
  const m = idString.value.match(/^size-(\d+)x(\d+)$/i)
  return m ? `${m[1]}×${m[2]}` : null
})

const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
)

// The three lookups are independent, so fire them concurrently and await together
// — sequential awaits would create an SSR request waterfall (extra TTFB) on this
// public, indexed page. Synthetic slugs (size-WxH, color-XXXXXX) and `/arts/new`
// are not real tag records — there is no /coloring/tags/<slug>/ for them, so skip
// that fetch (it would 404) and let the slug-derived title/description take over.
// Malformed slugs skip it too: they 404 below, so the lookup is pure waste.
const tagFetch = (isSizeSlug.value || isColorSlug.value || isNewSlug.value || !isValidSlug.value)
    ? null
    : useAuthFetch<TagSchema>(`/coloring/tags/${idString.value}/`, { key: `tag-${idString.value}` })

// page_size 10, not 1: this fetch supplies the count AND the ItemList entries in
// the CollectionPage schema. At 1 the ItemList described a single artwork, which
// is not a collection — pointless on a gallery page whose SERP is image-driven.
// The response stays small (LIST_ONLY_FIELDS), and the visible grid is a separate
// fetch inside <item-list>, so this doesn't duplicate rendering work.
const statsFetch = useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    slug: `/arts/${idString.value}`,
    status: 'public',
    page_size: 10,
  },
  key: `tag-stats-${idString.value}`,
})

const relatedFetch = useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  // has_pages=1 → only tags with public artworks (skip empty tags that 404).
  params: {page_size: 30, has_pages: 1},
  key: 'tag-related',
})

await Promise.all([tagFetch, statsFetch, relatedFetch].filter(Boolean))
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

const canonicalUrl = computed(() => {
  if (isNewSlug.value) return 'https://simplepixelart.com/arts'
  const base = `https://simplepixelart.com/arts/${idString.value}`
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

// A 5xx/timeout on the tag lookup is NOT proof the tag is gone. Only a hard 404
// is. Noindexing every real tag page because the API blipped would be far worse
// than briefly indexing one unknown slug, so failures stay indexable.
const tagLookupFailed = computed(() => {
  const s = tagError.value?.statusCode
  return !!tagError.value && s !== 404
})

// Tag is "unknown" when the slug is malformed, or when it's a plain slug with no
// tag record behind it. These are GSC's "thin/auto-generated" pages — 404 + noindex.
//
// This deliberately does NOT consult `totalCount`: the stats endpoint ignores a
// slug filter it can't match and returns the *full* public count, so every bogus
// slug looked populated and the old `totalCount === 0` condition never fired —
// leaving `/arts/<anything>` a 200, self-canonical, indexable duplicate.
const isUnknownTag = computed(() => {
  // Synthetic families clear FIRST: they match case-insensitively, and uppercase
  // hex colors like /arts/color-24110B are real indexed URLs (80 of them carry
  // impressions). Running the lowercase shape check ahead of this would 404 the lot.
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
  // Color/size slugs with zero results are valid query templates but empty —
  // don't index a thin "0 results for color #FFAABB" page.
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

// `titleTemplate` in nuxt.config already appends " - SimplePixelArt.com" (21
// chars), so the page part has to stay short or Google truncates it — mobile CTR
// (2.16%) trails desktop (3.32%) despite ranking ~3 positions better, and the old
// format ran to 79 chars. Size pages keep their count (browse intent, and the
// numbers are real); tag pages drop it, because most sit at 2-3 items and
// "Steve Pixel Art — 2 Sprites" actively sells against itself.
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
        // `image` is a plain URL, not an ImageObject. A listing can't supply the
        // credit fields honestly: this fetch goes through SharedPageSerializer,
        // which carries no `user`, so there's no per-item creator — and adding one
        // means either an N+1 or widening the hot list payload for every consumer.
        // A partial ImageObject is worse than a URL: it earns "Missing field
        // creator / copyrightNotice / acquireLicensePage" in Search Console and
        // buys nothing. Full attribution lives on each artwork's own detail page,
        // which is the canonical page for that image anyway.
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
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
        {'@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://simplepixelart.com/arts'},
        {'@type': 'ListItem', position: 3, name: tagTitle.value, item: url},
      ],
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
    <section class="page-hero">
      <span class="page-hero-eyebrow">{{ isSizeSlug ? 'Canvas size' : 'Tag' }}</span>
      <h1>{{ tagTitle }} Pixel Art</h1>
      <p v-if="tagDesc">{{ tagDesc }}</p>
      <p v-else>
        Browse {{ tagTitle.toLowerCase() }} pixel art creations — sprites, characters and icons in 8-bit and 16-bit
        style. Remix any piece in the editor or download for your game, NFT, or project.
      </p>
    </section>

    <item-list :limit="24" show-filter/>

    <section v-if="filteredRelated.length" class="tag-related" aria-label="Related tags">
      <header class="tag-related-head">
        <span class="tag-related-label">Browse by tag</span>
        <span class="tag-related-count">{{ filteredRelated.length }}</span>
      </header>
      <TagList :items="filteredRelated.map(t => ({ label: t.title || t.name, to: `/arts/${t.id_string}` }))"/>
    </section>
  </div>
</template>

<style scoped>
.tag-related {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.tag-related-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.tag-related-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.tag-related-count {
  font-size: var(--text-2xs);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
}

</style>
