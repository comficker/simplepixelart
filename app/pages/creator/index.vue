<script setup lang="ts">
const route = useRoute()
const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const hasFilterQuery = computed(() =>
    !!(route.query.width || route.query.height || route.query.is_iso || route.query.search),
)

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/creator'
  if (hasFilterQuery.value) return base
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `Pixel Art Creators — Page ${page.value} | SimplePixelArt`
        : "Pixel Art Creators - Community Artists",
)

useCustomSeoMeta({
  title: seoTitle,
  description: "Discover talented pixel art creators on SimplePixelArt.com. Browse creator profiles and explore their pixel art portfolios.",
  keywords: "pixel art creators, pixel art artists, pixel art community, creator profiles",
  canonical: canonicalUrl,
  robots: () => (page.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">Pixel Art Creators</h1>
      <p class="text-muted">Discover artists from the SimplePixelArt.com community. Browse their portfolios and explore their pixel art creations.</p>
    </section>
    <item-list show-filter/>
  </div>
</template>
