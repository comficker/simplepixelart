<script setup lang="ts">
import type {TagSchema} from "~/types";

const route = useRoute()
const idString = computed(() => route.params.id_string?.toString() || '')

const {data: tag} = await useAuthFetch<TagSchema>(`/coloring/tags/${idString.value}/`, {
  key: `tag-${idString.value}`
})

const tagTitle = computed(() => tag.value?.title || tag.value?.name || idString.value.replace(/-/g, ' '))
const tagDesc = computed(() => tag.value?.desc || '')

const page = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const canonicalUrl = computed(() => {
  const base = `https://simplepixelart.com/arts/${idString.value}`
  return page.value > 1 ? `${base}?page=${page.value}` : base
})

const seoTitle = computed(() =>
    page.value > 1
        ? `${tagTitle.value} Pixel Art — Page ${page.value} | SimplePixelArt`
        : `${tagTitle.value} Pixel Art — Designs, Sprites & Gallery`
)

const seoDesc = computed(() => {
  const base = tagDesc.value
      ? `${tagDesc.value} `
      : ''
  return `${base}Browse ${tagTitle.value} pixel art on SimplePixelArt.com. Free to view, remix, and download — 8-bit and 16-bit creations from the community.`.trim()
})

const seoKeywords = computed(() => [
  tagTitle.value,
  `${tagTitle.value} pixel art`,
  `${tagTitle.value} sprite`,
  `${tagTitle.value} 8-bit`,
  `${tagTitle.value} 16-bit`,
  `pixel art ${tagTitle.value}`,
  `${tagTitle.value} pixel art maker`,
  `${tagTitle.value} pixel art gallery`,
  'pixel art community'
].join(', '))

const structuredData = computed(() => ({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: seoTitle.value,
  description: seoDesc.value,
  url: canonicalUrl.value,
  about: {
    "@type": "Thing",
    name: tagTitle.value,
    ...(tagDesc.value ? {description: tagDesc.value} : {})
  },
  isPartOf: {
    "@type": "WebSite",
    name: "SimplePixelArt.com",
    url: "https://simplepixelart.com/"
  },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      {"@type": "ListItem", position: 1, name: "Home", item: "https://simplepixelart.com/"},
      {"@type": "ListItem", position: 2, name: "Gallery", item: "https://simplepixelart.com/arts"},
      {"@type": "ListItem", position: 3, name: tagTitle.value, item: `https://simplepixelart.com/arts/${idString.value}`}
    ]
  }
}))

useCustomSeoMeta({
  title: seoTitle.value,
  description: seoDesc.value,
  keywords: seoKeywords.value,
  canonical: canonicalUrl.value,
  robots: page.value > 1 ? 'noindex, follow' : 'index, follow',
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(structuredData.value)
    }
  ]
})
</script>

<template>
  <div class="page">
    <section class="tag-hero">
      <h1 class="h-center">
        <span class="icon icon-angle-right"/>
        <span>{{ tagTitle }} Pixel Art</span>
      </h1>
      <p v-if="tagDesc" class="text-xs text-gray-400 tag-desc">{{ tagDesc }}</p>
    </section>
    <item-list show-filter no-seo/>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.tag-hero {
  @apply space-y-1;
}

.tag-desc {
  @apply leading-relaxed;
}
</style>
