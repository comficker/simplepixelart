<script setup lang="ts">
import type {APIResponse, TagSchema} from "~/types";

const route = useRoute()
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

// Any of these query params turns the listing into a near-duplicate of the base
// page — strip them from canonical and noindex so Google consolidates the URL.
const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
)

const {data: tagsRes} = await useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  // has_pages=1 → only tags with public artworks (skip empty tags that 404).
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
        ? `Pixel Art Gallery — Page ${page.value} | SimplePixelArt`
        : 'Pixel Art Gallery — Browse, Remix & Download Free Pixel Art'
)

useCustomSeoMeta({
  title: seoTitle,
  description: 'Browse thousands of free pixel art creations. Discover sprites, 8-bit and 16-bit designs, characters, icons, and more — remix or download any piece for your game, NFT, or project.',
  keywords: 'pixel art gallery, pixel art collection, browse pixel art, free pixel art, pixel art download, 8-bit art, 16-bit art, pixel sprites, retro art, pixel art community',
  canonical: canonicalUrl,
  robots: () => (page.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
  ogImage: 'https://simplepixelart.com/og-image.jpg',
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
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
            {'@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://simplepixelart.com/arts'}
          ]
        }
      })
    }
  ]
})
</script>

<template>
  <div class="page">
    <section class="page-hero">
      <span class="page-hero-eyebrow">Gallery</span>
      <h1>Pixel Art Gallery</h1>
      <p>
        Browse thousands of free pixel art creations — sprites, 8-bit and 16-bit designs, characters and icons.
        Remix any piece in the editor or download for your game, NFT, or project.
      </p>
    </section>

    <item-list :limit="24" show-filter/>

    <section v-if="tags.length" class="arts-tags" aria-label="Browse by tag">
      <header class="arts-tags-head">
        <span class="arts-tags-label">Browse by tag</span>
        <span class="arts-tags-count">{{ tagsRes?.count || tags.length }}</span>
      </header>
      <TagList :items="tags.map(t => ({ label: t.title || t.name, to: `/arts/${t.id_string}` }))"/>
    </section>
  </div>
</template>

<style scoped>
.arts-tags {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.arts-tags-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.arts-tags-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.arts-tags-count {
  font-size: var(--text-2xs);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--muted);
}

</style>
