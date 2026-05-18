<script setup lang="ts">
import type {APIResponse, TagSchema} from "~/types";

const route = useRoute()
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data: tagsRes} = await useAuthFetch<APIResponse<TagSchema>>('/coloring/tags/', {
  params: {page_size: 30},
  key: 'arts-tags',
})

const tags = computed(() => tagsRes.value?.results || [])

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/arts'
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `Pixel Art Gallery — Page ${page.value} | SimplePixelArt`
        : 'Pixel Art Gallery — Browse, Remix & Download Free Pixel Art'
)

useCustomSeoMeta({
  title: seoTitle.value,
  description: 'Browse thousands of free pixel art creations. Discover sprites, 8-bit and 16-bit designs, characters, icons, and more — remix or download any piece for your game, NFT, or project.',
  keywords: 'pixel art gallery, pixel art collection, browse pixel art, free pixel art, pixel art download, 8-bit art, 16-bit art, pixel sprites, retro art, pixel art community',
  canonical: canonicalUrl.value,
  robots: page.value > 1 ? 'noindex, follow' : 'index, follow',
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
    <section class="arts-hero">
      <span class="arts-eyebrow">Gallery</span>
      <h1 class="page-title">Pixel Art Gallery</h1>
      <p class="text-muted arts-lede">
        Browse thousands of free pixel art creations — sprites, 8-bit and 16-bit designs, characters and icons.
        Remix any piece in the editor or download for your game, NFT, or project.
      </p>
      <div class="arts-actions">
        <nuxt-link to="/arts/new" class="btn">
          <span class="icon icon-rocket"/>
          <span>Newest</span>
        </nuxt-link>
        <nuxt-link to="/editor?new=true" class="btn primary">
          <span class="icon icon-brush"/>
          <span>Start drawing</span>
        </nuxt-link>
      </div>
    </section>

    <section v-if="tags.length" class="arts-tags" aria-label="Browse by tag">
      <header class="arts-tags-head">
        <span class="arts-tags-label">Browse by tag</span>
        <span class="arts-tags-count">{{ tagsRes?.count || tags.length }}</span>
      </header>
      <div class="arts-chip-strip no-scrollbar">
        <nuxt-link
            v-for="item in tags"
            :key="item.id"
            :to="`/arts/${item.id_string}`"
            class="arts-chip"
        >
          {{ item.title || item.name }}
        </nuxt-link>
      </div>
    </section>

    <item-list show-filter/>
  </div>
</template>

<style scoped>
.arts-hero {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-bottom: 0.25rem;
}

.arts-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--primary);
}

.arts-lede {
  max-width: 65ch;
  line-height: 1.625;
}

.arts-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.arts-tags {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.arts-tags-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.arts-tags-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.arts-tags-count {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
}

.arts-chip-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
}

.arts-chip {
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
  .arts-chip:hover {
    background: var(--primary);
    color: var(--primary-foreground);
    border-color: var(--primary);
    transform: translateY(-1px);
  }
}
</style>
