<script setup lang="ts">
import {KEEP_THIN_SIZES, MIN_SIZE_ARTS} from '~/helper/thin-tags'

const {t, locale} = useI18n()
const localHtml = useLocalHtml()

// Every size gallery worth a visit, so they are one click from the footer
// rather than reachable only through the art pages.
const {data} = await useAuthFetch<{width: number, height: number, count: number}[]>('/coloring/shared-pages/sizes/', {
  key: 'art-sizes',
})
const sizes = computed(() => (data.value || [])
    .filter(s => s.width > 0 && s.height > 0
        && (s.count >= MIN_SIZE_ARTS || KEEP_THIN_SIZES.has(`size-${s.width}x${s.height}`))))
const square = computed(() => sizes.value.filter(s => s.width === s.height).sort((a, b) => a.width - b.width))
const other = computed(() => sizes.value.filter(s => s.width !== s.height).sort((a, b) => b.count - a.count))
const fmt = (n: number) => new Intl.NumberFormat(locale.value).format(n)

useCustomSeoMeta({
  title: () => t('p_arts_sizes.seoTitle'),
  description: () => t('p_arts_sizes.seoDescription'),
  canonical: 'https://simplepixelart.com/arts/sizes',
})
</script>

<template>
  <div class="page prose">
    <h1>{{ $t('p_arts_sizes.h1') }}</h1>
    <p v-html="localHtml($t('p_arts_sizes.intro'))"/>

    <h2>{{ $t('p_arts_sizes.squareH') }}</h2>
    <ul class="size-list">
      <li v-for="s in square" :key="`${s.width}x${s.height}`">
        <NuxtLinkLocale :to="`/arts/size-${s.width}x${s.height}`">{{ $t('p_easy-pixel-art.labelPixelArt', {label: `${s.width}×${s.height}`}) }}</NuxtLinkLocale>
        <span class="text-muted"> · {{ fmt(s.count) }}</span>
      </li>
    </ul>

    <template v-if="other.length">
      <h2>{{ $t('p_arts_sizes.otherH') }}</h2>
      <ul class="size-list">
        <li v-for="s in other" :key="`${s.width}x${s.height}`">
          <NuxtLinkLocale :to="`/arts/size-${s.width}x${s.height}`">{{ $t('p_easy-pixel-art.labelPixelArt', {label: `${s.width}×${s.height}`}) }}</NuxtLinkLocale>
          <span class="text-muted"> · {{ fmt(s.count) }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.prose > .size-list {
  columns: 2 12rem;
  column-gap: var(--space-6);
}
</style>
