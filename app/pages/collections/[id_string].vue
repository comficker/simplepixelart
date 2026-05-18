<script setup lang="ts">
import type {Collection, SharedPage} from "~/types";

interface CollectionDetail extends Collection {
  status: string
  type: string
  items: SharedPage[]
  owners?: number[]
}

const route = useRoute()
const config = useRuntimeConfig()
const auth = useAuthStore()

const {data, error} = await useAuthFetch<CollectionDetail>(
    `/coloring/collections/${route.params.id_string}/`,
)

const title = computed(() => data.value?.title || data.value?.name || 'Untitled collection')
const desc = computed(() => data.value?.desc || '')
const items = computed<SharedPage[]>(() => Array.isArray(data.value?.items) ? data.value!.items : [])
const itemCount = computed(() => items.value.length)

const isOwner = computed(() => {
  if (!auth.logged?.id || !data.value?.owners) return false
  return data.value.owners.includes(auth.logged.id)
})

const canonicalUrl = computed(() =>
    `${config.public.siteUrl}/collections/${route.params.id_string}`,
)

useCustomSeoMeta({
  title: `${title.value} — Collection on SimplePixelArt`,
  description: desc.value
      ? `${desc.value} Browse ${itemCount.value} pixel art ${itemCount.value === 1 ? 'piece' : 'pieces'} curated on SimplePixelArt.`
      : `A pixel art collection on SimplePixelArt featuring ${itemCount.value} ${itemCount.value === 1 ? 'piece' : 'pieces'}.`,
  canonical: canonicalUrl.value,
  robots: data.value?.status === 'public' ? 'index, follow' : 'noindex, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => data.value ? JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title.value,
        description: desc.value,
        url: canonicalUrl.value,
        numberOfItems: itemCount.value,
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: `${config.public.siteUrl}/`},
            {'@type': 'ListItem', position: 2, name: 'Collections', item: `${config.public.siteUrl}/arts`},
            {'@type': 'ListItem', position: 3, name: title.value, item: canonicalUrl.value},
          ],
        },
      }) : '',
    },
  ],
})

const shareMeta = computed(() => ({
  url: canonicalUrl.value,
  title: title.value,
  desc: desc.value || title.value,
}))
</script>

<template>
  <div class="page">
    <div v-if="error" class="cl-detail-error">
      <h1 class="page-title">Collection not found</h1>
      <p class="text-xs text-muted">This collection may be private or no longer exists.</p>
      <nuxt-link to="/arts" class="btn primary">Browse public pixel art</nuxt-link>
    </div>

    <template v-else-if="data">
      <section class="cl-detail-hero">
        <div class="cl-detail-head">
          <span class="cl-detail-eyebrow">Collection</span>
          <h1 class="page-title">{{ title }}</h1>
          <p v-if="desc" class="cl-detail-desc">{{ desc }}</p>
          <div class="cl-detail-meta">
            <span class="cl-detail-pill">{{ itemCount }} {{ itemCount === 1 ? 'piece' : 'pieces' }}</span>
            <span v-if="data.status !== 'public'" class="cl-detail-pill cl-detail-pill-private">
              <span class="icon icon-eye-cross"/> Private
            </span>
          </div>
        </div>
        <div class="cl-detail-actions">
          <SocialSharing :meta="shareMeta"/>
          <nuxt-link v-if="isOwner" to="/work?tab=collections" class="btn">
            <span class="icon icon-brush"/>
            <span>Manage</span>
          </nuxt-link>
        </div>
      </section>

      <section v-if="items.length" class="cl-detail-grid-wrap">
        <div class="cl-detail-grid">
          <ItemCard
              v-for="(item, i) in items"
              :key="item.id"
              :value="item"
              :priority="i < 4"
          />
        </div>
      </section>

      <section v-else class="cl-detail-empty">
        <span class="icon icon-rhombus empty-icon"/>
        <h2 class="empty-title">Empty collection</h2>
        <p class="text-xs text-muted">No pixel art has been added yet.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cl-detail-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.cl-detail-head {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
  flex: 1 1 280px;
}

.cl-detail-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--primary);
}

.cl-detail-desc {
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
  color: var(--muted);
  max-width: 60ch;
}

.cl-detail-meta {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-top: 0.25rem;
}

.cl-detail-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 2px 0.5rem;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border);
}

.cl-detail-pill-private {
  background: color-mix(in oklab, var(--primary) 14%, var(--surface));
  color: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 40%, transparent);
}

.cl-detail-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-shrink: 0;
}

.cl-detail-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 480px) {
  .cl-detail-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 768px) {
  .cl-detail-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.cl-detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.5rem;
  padding-top: 3rem;
  padding-bottom: 3rem;
}

.cl-detail-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.75rem;
  padding-top: 4rem;
  padding-bottom: 4rem;
}
</style>
