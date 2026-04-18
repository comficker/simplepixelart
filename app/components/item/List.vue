<script setup lang="ts">
import type {ResponseSharedPage} from "~/types";
import CustomLink from "~/components/CustomLink.vue";
import {debounce} from "~/helper/utils";

const {limit, showFilter, status} = defineProps({
  limit: {
    type: Number,
    default: 18
  },
  showFilter: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    default: 'public'
  }
});

const route = useRoute()

const search = ref('')

// /arts/new → newest public + pending works (whole gallery)
// /creator/<username> → that creator's public + pending works
// /art/<id_string> → detail page; related section filters by id_string
const isNewView = computed(() => route.path === '/arts/new')
const isCreatorView = computed(() => route.path.startsWith('/creator/'))
const isDetailView = computed(() => route.path.startsWith('/art/'))
const showPending = computed(() => isNewView.value || isCreatorView.value)
const relatedId = computed(() => isDetailView.value ? route.params.id_string?.toString() : undefined)

const params = computed(() => ({
  status: showPending.value ? 'public,pending' : status,
  slug: isNewView.value ? '/arts' : route.path,
  page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
  page_size: limit,
  search: search.value,
  ordering: showPending.value ? '-updated' : undefined,
  related: relatedId.value,
}));

const {data} = await useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
  query: params,
  key: route.fullPath
})

const pagination = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  const prevPage = page - 1
  return {
    n: data.value?.links?.next ? `${route.path}?page=${page + 1}` : null,
    p: data.value?.links?.previous
        ? (prevPage <= 1 ? route.path : `${route.path}?page=${prevPage}`)
        : null
  }
})

const meta = computed(() => ({
  title: data.value?.meta.title || "Pixel Art Gallery - Discover Amazing Creations",
  desc: data.value?.meta.desc || "Explore thousands of pixel art creations from artists worldwide. Browse by size, style, and tags. Updated daily with new pixel art."
}))

const canonicalUrl = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  const base = `https://simplepixelart.com${route.path}`
  return page > 1 ? `${base}?page=${page}` : base
})

const structuredData = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "Pixel Art Gallery",
  description: "Explore thousands of pixel art creations from artists worldwide",
  url: "https://simplepixelart.com/arts",
  mainEntity: {
    "@type": "ItemList",
    name: "Pixel Art Collection",
    description: "Curated collection of pixel art from various creators",
    numberOfItems: "1000+"
  },
  publisher: {
    "@type": "Organization",
    name: "SimplePixelArt.com",
    url: "https://simplepixelart.com/"
  }
};

if (limit > 6) {
  useCustomSeoMeta({
    title: meta.value.title,
    description: meta.value.desc,
    keywords: "pixel art gallery, pixel art collection, pixel art showcase, discover pixel art, pixel art community",
    canonical: canonicalUrl.value,
    script: [
      {
        type: 'application/ld+json',
        innerHTML: JSON.stringify({...structuredData, url: canonicalUrl.value})
      }
    ]
  });
}

const handleInput = debounce((event: { target: { value: string; }; }) => {
  search.value = event.target.value
}, 800)
</script>

<template>
  <div class="page">
    <section v-if="limit > 6">
      <h1 class="h-center">
        <span class="icon icon-angle-right"/>
        <span>{{ meta.title }}</span>
      </h1>
      <div class="h-center">
        <p class="text-xs text-gray-400">{{ meta.desc }}</p>
      </div>
    </section>
    <div v-if="showFilter" class="flex gap-4">
      <nuxt-link to="/editor" class="btn primary">PX Editor</nuxt-link>
      <input type="text" :value="search" class="w-1/3" placeholder="Search..." @input="handleInput"/>
      <!--<div v-if="limit > 6" class="ml-auto px-2 py-2 border">Order</div>-->
    </div>
    <div v-if="data" class="results">
      <ItemCard v-for="(item, i) in data.results" :key="item.id" :value="item" :priority="i < 3"/>
    </div>
    <div v-if="limit > 6 && data?.results.length" class="paginator">
      <CustomLink :to="pagination.p">
        <span class="icon icon-angle-left"/>
        <span>Previous</span>
      </CustomLink>
      <div>{{ route.query.page?.toString() || 1 }}/{{ data.num_pages }}</div>
      <CustomLink :to="pagination.n">
        <span>Next</span>
        <span class="icon icon-angle-right"/>
      </CustomLink>
    </div>
  </div>
</template>
