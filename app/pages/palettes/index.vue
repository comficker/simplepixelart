<script setup lang="ts">
const {t} = useI18n()
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
        ? `${t('seo.palettes.title')} — ${currentPage.value}`
        : t('seo.palettes.title'),
)

useCustomSeoMeta({
  title: seoTitle,
  description: () => t('seo.palettes.description'),
  keywords: () => t('seo.palettes.keywords'),
  canonical: canonicalUrl,
  robots: () => (currentPage.value > 1 || hasFilterQuery.value) ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <ItemPaletteList
      :title="$t('p_palettes.colorPalettes')"
      :desc="$t('p_palettes.browseFilterAndApplyReadyMade')"
  />
</template>
