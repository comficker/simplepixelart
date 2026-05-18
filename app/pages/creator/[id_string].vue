<script setup lang="ts">
import type {APIResponse, Collection, SharedPage} from "~/types";

const route = useRoute()
const config = useRuntimeConfig()
const username = computed(() => route.params.id_string?.toString() || '')
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

interface CreatorCollection extends Collection {
  status: string
  items: SharedPage[] | number[]
}

const {data: collectionsRes} = await useAuthFetch<APIResponse<CreatorCollection>>(
    '/coloring/collections/',
    {
      params: {
        owners__username: username.value,
        status: 'public',
        page_size: 12,
        ordering: '-updated',
      },
    },
)

const collections = computed(() => collectionsRes.value?.results || [])

function coverUrl(c: CreatorCollection): string | null {
  if (Array.isArray(c.items) && c.items.length > 0) {
    const first = c.items[0]
    if (typeof first === 'object' && first?.id_string) {
      return `${config.public.api}/coloring/files/art-original/${first.id_string}.png`
    }
  }
  return null
}

function itemCount(c: CreatorCollection): number {
  return Array.isArray(c.items) ? c.items.length : 0
}

const canonicalUrl = computed(() => {
  const base = `https://simplepixelart.com/creator/${username.value}`
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `Pixel art by @${username.value} — Page ${page.value} | SimplePixelArt`
        : `Pixel art by @${username.value} — Sprites, Designs & Creations`
)

useCustomSeoMeta({
  title: seoTitle.value,
  description: `Browse pixel art by @${username.value} on SimplePixelArt.com. Discover their sprites, 8-bit characters, and pixel designs — remix or follow for new releases.`,
  keywords: `${username.value} pixel art, @${username.value}, ${username.value} sprites, pixel art creator, ${username.value} 8-bit art, ${username.value} pixel designs`,
  canonical: canonicalUrl.value,
  robots: page.value > 1 ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: `@${username.value}`,
        url: canonicalUrl.value,
        mainEntity: {
          '@type': 'Person',
          name: `@${username.value}`,
          url: `https://simplepixelart.com/creator/${username.value}`
        },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
            {'@type': 'ListItem', position: 2, name: 'Creators', item: 'https://simplepixelart.com/creator'},
            {'@type': 'ListItem', position: 3, name: `@${username.value}`, item: canonicalUrl.value}
          ]
        }
      })
    }
  ]
})
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">@{{ username }}</h1>
      <p class="text-muted">Pixel art by @{{ username }} on SimplePixelArt — browse their sprites, 8-bit characters, and designs. Remix any piece in the editor.</p>
    </section>

    <section v-if="collections.length" class="creator-collections">
      <h2 class="section-title">Collections</h2>
      <div class="creator-coll-grid">
        <nuxt-link
            v-for="c in collections"
            :key="c.id"
            :to="`/collections/${c.id_string}`"
            class="creator-coll-card"
        >
          <div class="square">
            <div class="inside">
              <img
                  v-if="coverUrl(c)"
                  :src="coverUrl(c)!"
                  :alt="c.title"
                  class="size-full"
                  loading="lazy"
                  decoding="async"
              />
              <div v-else class="creator-coll-placeholder">
                <span class="icon icon-rhombus"/>
              </div>
            </div>
          </div>
          <div class="creator-coll-meta">
            <div class="creator-coll-title">{{ c.title }}</div>
            <div class="creator-coll-count">{{ itemCount(c) }} {{ itemCount(c) === 1 ? 'piece' : 'pieces' }}</div>
          </div>
        </nuxt-link>
      </div>
    </section>

    <item-list show-filter/>
  </div>
</template>

<style scoped>
.creator-collections {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.creator-coll-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 480px) {
  .creator-coll-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 768px) {
  .creator-coll-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.creator-coll-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
  image-rendering: pixelated;
}

@media (hover: hover) and (pointer: fine) {
  .creator-coll-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
    border-color: var(--primary);
  }
}

.creator-coll-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 32px;
}

.creator-coll-meta {
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.creator-coll-title {
  font-weight: 700;
  color: var(--foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.creator-coll-count {
  color: var(--muted);
  font-size: 11px;
}
</style>
