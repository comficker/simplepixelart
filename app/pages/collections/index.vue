<script setup lang="ts">
import type {APIResponse} from '~/types'

const {t} = useI18n()
const route = useRoute()

interface CollectionRow {
  id: number
  id_string: string
  name: string
  desc?: string
  items?: number[]
}

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const {data} = await useAuthFetch<APIResponse<CollectionRow>>('/coloring/collections/', {
  query: computed(() => ({page: currentPage.value, page_size: 24})),
  key: computed(() => `collections|${currentPage.value}`),
})

const collections = computed(() => data.value?.results || [])

const {covers, coverFailed, loadCovers} = useCollectionCovers(() => collections.value)

/* Immediate rather than onMounted as well: on a client-side navigation the
   fetch can resolve after mount, and both would have fired. */
watch(collections, loadCovers, {immediate: true})

const {page, prevTo, nextTo} = usePageLinks(data)

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/collections'
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

useCustomSeoMeta({
  title: computed(() => currentPage.value > 1
      ? `${t('seo.collections.title')} — ${currentPage.value}`
      : t('seo.collections.title')),
  description: () => t('seo.collections.description'),
  keywords: () => t('seo.collections.keywords'),
  canonical: canonicalUrl,
  robots: () => currentPage.value > 1 ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <BrowseLayout
        :title="$t('p_collections.pixelArtCollections')"
        :desc="$t('p_collections.setsOfPixelArtPutTogether')"
    >
      <div v-if="collections.length" class="results">
        <ItemCollectionTile
            v-for="c in collections"
            :key="c.id"
            :value="c"
            :cover="covers[c.id]"
            :failed="coverFailed[c.id]"
            @error="coverFailed[c.id] = true"
        />
      </div>

      <div v-else class="empty-state">
        <span class="empty-state-icon icon icon-rhombus" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_collections.noCollectionsYet') }}</div>
        <p class="empty-state-body">{{ $t('p_collections.nobodyHasPublishedASetYet') }}</p>
        <div class="empty-state-actions">
          <NuxtLinkLocale to="/arts" class="btn primary">{{ $t('common.browseGallery') }}</NuxtLinkLocale>
        </div>
      </div>

      <template v-if="collections.length" #foot>
        <span class="browse-foot-start">
          {{ $t('p_collections.collectionCount', data?.count || collections.length, {count: data?.count || collections.length}) }}
        </span>
        <span class="browse-foot-end">
          <Paginator
              :page="page"
              :pages="data?.num_pages || 1"
              :prev-to="prevTo"
              :next-to="nextTo"
          />
        </span>
      </template>
    </BrowseLayout>
  </div>
</template>
