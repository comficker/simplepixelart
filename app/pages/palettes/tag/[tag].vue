<script setup lang="ts">
import type {ResponsePalette} from "~/types";

const route = useRoute()
const tag = computed(() => (route.params.tag?.toString() || '').toLowerCase())
const label = computed(() => tag.value ? tag.value.charAt(0).toUpperCase() + tag.value.slice(1) : '')

const params = computed(() => ({
  taxonomies__id_string: tag.value,
  page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
  page_size: 24,
  ordering: '-score',
}))

const {data, pending} = await useAuthFetch<ResponsePalette>(`/coloring/palettes/`, {
  query: params,
  key: computed(() => `palette-tag-${tag.value}-${params.value.page}`),
})

const results = computed(() => data.value?.results || [])
const isLoading = computed(() => pending.value && !results.value.length)
const isEmpty = computed(() => !pending.value && data.value && results.value.length === 0)

const {page, prevTo, nextTo} = usePageLinks(data)


useCustomSeoMeta({
  title: computed(() => page.value > 1
      ? `${label.value} Color Palettes — Page ${page.value} | Pixel Art`
      : `${label.value} Color Palettes — Pixel Art`),
  description: computed(() =>
      `Browse ${label.value.toLowerCase()} pixel art color palettes. Copy the hex codes or open any palette directly in the editor.`),
  canonical: computed(() => {
    const base = `https://simplepixelart.com/palettes/tag/${tag.value}`
    return page.value > 1 ? `${base}?page=${page.value}` : base
  }),
  robots: computed(() => page.value > 1 ? 'noindex, follow' : 'index, follow'),
})
</script>

<template>
  <div class="page">
    <nav class="ptag-crumb">
      <nuxt-link to="/palettes">Palettes</nuxt-link>
      <span class="ptag-sep">/</span>
      <span>{{ label }}</span>
    </nav>
    <h1 class="ptag-title">{{ label }} palettes</h1>
    <p class="ptag-sub">{{ data?.count || 0 }} pixel art palettes tagged “{{ label.toLowerCase() }}”.</p>

    <div v-if="isLoading" class="pal-grid">
      <div v-for="i in 12" :key="`sk-${i}`" class="skeleton" style="height: 132px; border-radius: var(--radius-sm);"/>
    </div>
    <div v-else-if="isEmpty" class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <div class="empty-state-title">No “{{ label }}” palettes yet</div>
      <div class="empty-state-actions">
        <nuxt-link to="/palettes" class="btn">All palettes</nuxt-link>
        <nuxt-link to="/palettes/color-palette-from-image" class="btn primary">Create one</nuxt-link>
      </div>
    </div>
    <div v-else class="pal-grid">
      <ItemPaletteCard v-for="p in results" :key="p.id" :value="p"/>
    </div>

    <Paginator
        v-if="results.length"
        :page="page"
        :pages="data?.num_pages || 1"
        :prev-to="prevTo"
        :next-to="nextTo"
    />
  </div>
</template>

<style scoped>
.ptag-crumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--muted);
  margin-bottom: 0.5rem;
}

.ptag-crumb a {
  display: inline-flex;
  align-items: center;
  color: var(--primary);
  font-weight: 600;
}

@media (pointer: coarse) {
  .ptag-crumb a {
    min-height: 32px;
  }
}
.ptag-sep { opacity: 0.5; }

.ptag-title {
  font-size: var(--text-2xl);
  line-height: var(--text-2xl-lh);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.ptag-sub {
  color: var(--muted);
  font-size: var(--text-sm);
  margin: 0.25rem 0 1rem;
}
</style>
