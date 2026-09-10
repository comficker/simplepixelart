<script setup lang="ts">
const route = useRoute()

const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)
const hasFilterQuery = computed(() => !!(route.query.q || route.query.size || route.query.sort))

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/palettes'
  if (hasFilterQuery.value) return base
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

const seoTitle = computed(() =>
    currentPage.value > 1
        ? `Pixel Art Color Palettes — Page ${currentPage.value}`
        : "Pixel Art Color Palettes",
)

useCustomSeoMeta({
  title: seoTitle,
  description: "Browse a library of pixel art color palettes. Filter by size, sort by popularity, and apply any palette to your art in one click.",
  keywords: "pixel art palette, color palette, lospec palette, pixel colors, palette library",
  canonical: canonicalUrl,
  robots: () => (currentPage.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <ItemPaletteList
      title="Color Palettes"
      desc="Browse, filter, and apply ready-made palettes — or create your own."
  />
</template>
