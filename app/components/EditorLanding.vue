<script setup lang="ts">
// The full pixel art editor under a page of its own for one search intent
// ("sprite maker", "pixel art animation maker"): the tool first, the guide
// below it. Written in English only, so other locales point Google back to
// the English page.
const props = defineProps<{
  path: string
  title: string
  description: string
  keywords: string
  appName: string
  features: string[]
  steps: { name: string, text: string }[]
  faq: { q: string, a: string }[]
}>()

const store = useEditor()
const {locale, defaultLocale} = useI18n()
const url = `https://simplepixelart.com${props.path}`

useCustomSeoMeta({
  title: props.title,
  description: props.description,
  keywords: props.keywords,
  canonical: url,
  robots: () => locale.value === defaultLocale ? 'index, follow' : 'noindex, follow',
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebApplication',
          name: props.appName,
          description: props.description,
          url,
          applicationCategory: 'GraphicsApplication',
          operatingSystem: 'Any (browser-based)',
          offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
          featureList: props.features,
          publisher: {'@type': 'Organization', name: 'SimplePixelArt.com', url: 'https://simplepixelart.com/'},
        },
        {
          '@type': 'HowTo',
          name: `How to use the ${props.appName.toLowerCase()}`,
          step: props.steps.map(s => ({'@type': 'HowToStep', name: s.name, text: s.text})),
        },
        {
          '@type': 'FAQPage',
          mainEntity: props.faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
            {'@type': 'ListItem', position: 2, name: props.appName, item: url},
          ],
        },
      ],
    }),
  }],
})
</script>

<template>
  <ToolLayout :title="appName" agent>
    <PXEditor/>
    <template #status>
      <p class="text-xs text-muted">
        {{ store.editorData.width }}×{{ store.editorData.height }}px ·
        {{ $t('common.nColors', {count: store.editorData.colors.length}) }}<template v-if="store.isAnimated"> ·
          {{ $t('p_editor.nFrames', {count: store.frameCount}) }}</template>
      </p>
    </template>

    <template #doc>
      <slot/>
      <h2>How to use it</h2>
      <ol>
        <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}.</strong> {{ s.text }}</li>
      </ol>
      <h2>Features</h2>
      <ul>
        <li v-for="f in features" :key="f">{{ f }}</li>
      </ul>
      <QnA :items="faq"/>
      <h2>More pixel art tools</h2>
      <ul>
        <li><NuxtLink to="/editor">Pixel art editor</NuxtLink></li>
        <li v-if="path !== '/sprite-maker'"><NuxtLink to="/sprite-maker">Sprite maker</NuxtLink></li>
        <li v-if="path !== '/pixel-art-animation-maker'"><NuxtLink to="/pixel-art-animation-maker">Pixel art animation maker</NuxtLink></li>
        <li><NuxtLink to="/converter">Image to pixel art converter</NuxtLink></li>
        <li><NuxtLink to="/tilesets/editor">Tileset editor</NuxtLink></li>
      </ul>
    </template>
  </ToolLayout>
</template>
