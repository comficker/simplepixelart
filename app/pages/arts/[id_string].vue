<script setup lang="ts">
import type {APIResponse, ResponseSharedPage, SharedPage, TagSchema} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const idString = computed(() => route.params.id_string?.toString() || '')

const isSizeSlug = computed(() => /^size-\d+x\d+$/i.test(idString.value))
const sizeFromSlug = computed(() => {
  const m = idString.value.match(/^size-(\d+)x(\d+)$/i)
  return m ? `${m[1]}×${m[2]}` : null
})

const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data: tag} = await useAuthFetch<TagSchema>(`/coloring/tags/${idString.value}/`, {
  key: `tag-${idString.value}`,
})

const {data: stats} = await useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  params: {
    slug: `/arts/${idString.value}`,
    status: 'public',
    page_size: 1,
  },
  key: `tag-stats-${idString.value}`,
})

const {data: relatedTags} = await useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {page_size: 30},
  key: 'tag-related',
})

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
  const base = `https://simplepixelart.com/arts/${idString.value}`
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const ogImage = computed(() => {
  if (firstSample.value?.id_string) {
    return `${config.public.api}/coloring/files/art-social/${firstSample.value.id_string}.png`
  }
  return 'https://simplepixelart.com/og-image.jpg'
})

const seoTitle = computed(() => {
  const base = isSizeSlug.value
      ? `${tagTitle.value} Pixel Art — ${totalCount.value || ''} Sprites & Designs`.trim()
      : `${tagTitle.value} Pixel Art — Sprites, Designs & Gallery${totalCount.value ? ` (${totalCount.value})` : ''}`
  return page.value > 1
      ? `${tagTitle.value} Pixel Art — Page ${page.value} | SimplePixelArt`
      : base
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
  title: seoTitle.value,
  description: seoDesc.value,
  keywords: seoKeywords.value,
  canonical: canonicalUrl.value,
  robots: page.value > 1 ? 'noindex, follow' : 'index, follow',
  ogImage: ogImage.value,
  ogType: 'website',
  modifiedTime: recentUpdated.value || undefined,
  script: [
    {type: 'application/ld+json', innerHTML: JSON.stringify(structuredData.value)},
  ],
})

const formattedDate = computed(() => {
  if (!recentUpdated.value) return null
  try {
    const d = new Date(recentUpdated.value)
    return d.toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'})
  } catch {
    return null
  }
})
</script>

<template>
  <div class="page">
    <section class="tag-hero">
      <span class="tag-eyebrow">{{ isSizeSlug ? 'Canvas size' : 'Tag' }}</span>
      <h1 class="page-title tag-title">{{ tagTitle }} Pixel Art</h1>
      <p v-if="tagDesc" class="text-muted tag-desc">{{ tagDesc }}</p>
      <p v-else class="text-muted tag-desc">
        Browse {{ tagTitle.toLowerCase() }} pixel art creations — sprites, characters and icons in 8-bit and 16-bit
        style. Remix any piece in the editor or download for your game, NFT, or project.
      </p>

      <div class="tag-meta">
        <span v-if="totalCount" class="tag-pill">
          <span class="icon icon-grid"/>
          <span><strong>{{ totalCount }}</strong> {{ totalCount === 1 ? 'piece' : 'pieces' }}</span>
        </span>
        <span v-if="formattedDate" class="tag-pill">
          <span class="icon icon-calender"/>
          <span>Updated {{ formattedDate }}</span>
        </span>
      </div>

      <div class="tag-actions">
        <nuxt-link to="/editor?new=true" class="btn primary">
          <span class="icon icon-brush"/>
          <span>Start drawing</span>
        </nuxt-link>
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-angle-left"/>
          <span>All gallery</span>
        </nuxt-link>
      </div>
    </section>

    <item-list show-filter/>

    <section v-if="filteredRelated.length" class="tag-related" aria-label="Related tags">
      <header class="tag-related-head">
        <h2 class="section-title">Explore more</h2>
        <nuxt-link to="/arts" class="section-link">All tags →</nuxt-link>
      </header>
      <div class="tag-chip-strip">
        <nuxt-link
            v-for="t in filteredRelated"
            :key="t.id"
            :to="`/arts/${t.id_string}`"
            class="tag-chip"
        >
          {{ t.title || t.name }}
        </nuxt-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tag-hero {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
}

.tag-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
}

.tag-title {
  text-transform: capitalize;
}

.tag-desc {
  max-width: 65ch;
  line-height: 1.625;
}

.tag-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.25rem;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 4px 0.625rem;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.tag-pill .icon {
  font-size: 12px;
  color: var(--primary);
}

.tag-pill strong {
  color: var(--foreground);
  font-weight: 800;
}

.tag-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.tag-related {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
}

.tag-related-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.tag-chip-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
}

.tag-chip {
  padding: 5px 12px;
  white-space: nowrap;
  background: color-mix(in oklab, var(--surface-2) 60%, transparent);
  border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: 999px;
  transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .tag-chip:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
    transform: translateY(-1px);
  }
}
</style>
