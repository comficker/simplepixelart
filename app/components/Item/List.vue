<script setup lang="ts">
import type {ResponseSharedPage} from "~/types";
import CustomLink from "~/components/CustomLink.vue";
import {debounce} from "~/helper/utils";

const {limit, showFilter} = defineProps({
  limit: {
    type: Number,
    default: 18
  },
  showFilter: {
    type: Boolean,
    default: false
  }
});

const route = useRoute()

const search = ref('')

const params = computed(() => ({
  status: 'public',
  slug: route.path,
  page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
  page_size: limit,
  search: search.value,
}));

const {data} = await useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
  query: params,
  key: route.fullPath
})

const pagination = computed(() => {
  const page = route.query.page ? Number.parseInt(route.query.page.toString()) : 1
  return {
    n: data.value?.links?.next ? `${route.path}?page=${page + 1}` : null,
    p: data.value?.links?.previous ? `${route.path}?page=${page - 1}` : null
  }
})

const meta = computed(() => ({
  title: data.value?.meta.title,
  desc: data.value?.meta.desc
}))

if (limit > 6) {
  useHead({
    title: meta.value.title,
    meta: [{name: "description", content: meta.value.desc}]
  })
}

const handleInput = debounce((event: { target: { value: string; }; }) => {
  search.value = event.target.value
}, 800)
</script>

<template>
  <div class="page">
    <section v-if="meta.title" class="">
      <h1 class="h-center">
        <span class="icon icon-angle-right"/>
        <span>{{ meta.title }}</span>
      </h1>
      <div class="h-center">
        <p class="text-xs text-gray-400">{{ meta.desc }}</p>
      </div>
    </section>
    <div v-if="showFilter" class="flex gap-4">
      <nuxt-link to="/editor" class="btn primary">Create</nuxt-link>
      <input
          :value="search"
          class="w-1/3"
          placeholder="Search..."
          @input="handleInput"
      />
      <!--<div v-if="limit > 6" class="ml-auto px-2 py-2 border">Order</div>-->
    </div>
    <div v-if="data" class="results">
      <ItemCard v-for="item in data.results" :key="item.id" :value="item"/>
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
