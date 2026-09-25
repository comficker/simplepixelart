<script setup lang="ts">
const {t} = useI18n()
const EASY_SIZES = computed(() => [
  {slug: '8x8', label: '8×8', note: t('p_easy-pixel-art.sizeNote0')},
  {slug: '10x10', label: '10×10', note: t('p_easy-pixel-art.sizeNote1')},
  {slug: '12x12', label: '12×12', note: t('p_easy-pixel-art.sizeNote2')},
  {slug: '13x13', label: '13×13', note: t('p_easy-pixel-art.sizeNote3')},
  {slug: '15x15', label: '15×15', note: t('p_easy-pixel-art.sizeNote4')},
  {slug: '16x16', label: '16×16', note: t('p_easy-pixel-art.sizeNote5')},
])

const steps = computed(() => [
  {
    h: t('p_easy-pixel-art.step0h'),
    p: t('p_easy-pixel-art.step0p'),
  },
  {
    h: t('p_easy-pixel-art.step1h'),
    p: t('p_easy-pixel-art.step1p'),
  },
  {
    h: t('p_easy-pixel-art.step2h'),
    p: t('p_easy-pixel-art.step2p'),
  },
  {
    h: t('p_easy-pixel-art.step3h'),
    p: t('p_easy-pixel-art.step3p'),
  },
])

const faq = computed(() => [
  {q: t('p_easy-pixel-art.faq0q'), a: t('p_easy-pixel-art.faq0a')},
  {q: t('p_easy-pixel-art.faq1q'), a: t('p_easy-pixel-art.faq1a')},
  {q: t('p_easy-pixel-art.faq2q'), a: t('p_easy-pixel-art.faq2a')},
  {q: t('p_easy-pixel-art.faq3q'), a: t('p_easy-pixel-art.faq3a')},
])

useCustomSeoMeta({
  title: 'Easy Pixel Art for Beginners',
  description: 'Easy pixel art for beginners: start on an 8×8 grid with three colors. A step-by-step method, the easiest canvas sizes and a free online editor.',
  keywords: 'easy pixel art, pixel art easy, simple pixel art, pixel art for beginners, easy pixel art ideas, small pixel art, 8x8 pixel art, easy pixel art grid, beginner pixel art',
  canonical: 'https://simplepixelart.com/easy-pixel-art',
  ogType: 'article',
  script: [
    {
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'HowTo',
          name: 'How to make easy pixel art',
          description: 'Draw readable pixel art on a small grid with a limited palette.',
          totalTime: 'PT10M',
          tool: [{'@type': 'HowToTool', name: 'SimplePixelArt editor (free, browser-based)'}],
          step: steps.value.map((s, i) => ({
            '@type': 'HowToStep',
            position: i + 1,
            name: s.h,
            text: s.p,
          })),
        },
        {
          '@type': 'FAQPage',
          mainEntity: faq.value.map(f => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: {'@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '')},
          })),
        },
      ],
    }),
    },
  ],
})
</script>

<template>
  <div class="page prose">
        <p class="page-meta">{{ $t('p_easy-pixel-art.beginnerGuide') }}</p>
    <h1>{{ $t('p_easy-pixel-art.easyPixelArt') }}</h1>
    <p v-html="$t('p_easy-pixel-art.pixelArtGetsEasyTheMoment')"/>
    <p>
      <NuxtLinkLocale to="/editor?new=true" class="btn">{{ $t('p_easy-pixel-art.openTheEditor') }}</NuxtLinkLocale>
    </p>

    <h2>{{ $t('p_easy-pixel-art.theEasiestCanvasSizes') }}</h2>
    <p v-html="$t('p_easy-pixel-art.eachOfTheseHasRealPieces')"/>
    <ul>
      <li v-for="s in EASY_SIZES" :key="s.slug">
        <NuxtLinkLocale :to="`/arts/size-${s.slug}`"><strong>{{ $t('p_easy-pixel-art.labelPixelArt', {label: s.label}) }}</strong></NuxtLinkLocale>
        — {{ s.note }}
      </li>
    </ul>
    <p>
      {{ $t('p_easy-pixel-art.biggerGridsOnceTheseFeelSmall') }}
      <NuxtLinkLocale to="/arts/size-20x20">20×20</NuxtLinkLocale> ·
      <NuxtLinkLocale to="/arts/size-24x24">24×24</NuxtLinkLocale> ·
      <NuxtLinkLocale to="/arts/size-32x32">32×32</NuxtLinkLocale>.
    </p>
    

    <h2>{{ $t('p_easy-pixel-art.fourStepsThatDoMostOf') }}</h2>
    <ol>
      <li v-for="s in steps" :key="s.h">
        <strong>{{ s.h }}</strong> — {{ s.p }}
      </li>
    </ol>
    

    <h2>{{ $t('p_easy-pixel-art.whereToGoNext') }}</h2>
    <ul>
      <li>
        <NuxtLinkLocale to="/editor"><strong>{{ $t('p_easy-pixel-art.pixelArtEditor') }}</strong></NuxtLinkLocale> {{ $t('p_easy-pixel-art.brushesFillLayersMirrorModeAnd') }} </li>
      <li>
        <NuxtLinkLocale to="/palettes"><strong>{{ $t('p_easy-pixel-art.colorPalettes') }}</strong></NuxtLinkLocale> {{ $t('p_easy-pixel-art.readyMade38ColorSets') }} </li>
      <li>
        <NuxtLinkLocale to="/converter"><strong>{{ $t('common.photoToPixelArt') }}</strong></NuxtLinkLocale> {{ $t('p_easy-pixel-art.convertAnImageThenCleanIt') }} </li>
      <li>
        <NuxtLinkLocale to="/arts"><strong>{{ $t('p_easy-pixel-art.browseTheGallery') }}</strong></NuxtLinkLocale> {{ $t('p_easy-pixel-art.everyPieceOpensInTheEditor') }} </li>
    </ul>
    

    <ToolReadme :toc="false">
    <QnA :title="$t('common.questionsAmpAnswers')" :items="faq"/>
    </ToolReadme>
  </div>
</template>
