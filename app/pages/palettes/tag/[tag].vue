<script setup lang="ts">
const route = useRoute()
const tag = computed(() => (route.params.tag?.toString() || '').toLowerCase())
const label = computed(() => tag.value ? tag.value.charAt(0).toUpperCase() + tag.value.slice(1) : '')

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)
const hasFilterQuery = computed(() => !!(route.query.q || route.query.size || route.query.sort))

useCustomSeoMeta({
  title: computed(() => currentPage.value > 1
      ? `${label.value} Color Palettes — Page ${currentPage.value} | Pixel Art`
      : `${label.value} Color Palettes — Pixel Art`),
  description: computed(() =>
      `Browse ${label.value.toLowerCase()} pixel art color palettes. Copy the hex codes or open any palette directly in the editor.`),
  canonical: computed(() => {
    const base = `https://simplepixelart.com/palettes/tag/${tag.value}`
    if (hasFilterQuery.value) return base
    return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
  }),
  robots: computed(() => (currentPage.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow'),
})
</script>

<template>
  <ItemPaletteList
      :title="`${label} palettes`"
      :desc="`Pixel art palettes tagged “${label.toLowerCase()}” — copy the hex codes or open any palette in the editor.`"
  />
</template>
