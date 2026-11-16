<script setup lang="ts">
import type {ResponseSharedPage} from '~/types'
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

const faq = computed(() => [0, 1, 2, 3, 4, 5].map(i => ({
  q: t(`p_easy-pixel-art.faq${i}q`),
  a: t(`p_easy-pixel-art.faq${i}a`),
})))

// The page ranks for "easy pixel art" but showed two pictures; searchers came
// for pieces to copy. Small grids, most liked first.
const {data: ideas} = await useAuthFetch<ResponseSharedPage>('/coloring/shared-pages/', {
  key: 'easy-pixel-art-ideas',
  query: {status: 'public', width__lt: 17, height__lt: 17, ordering: '-score,-id', page_size: 24},
})
const artAlt = useArtAlt()
const artImage = useArtImage()

useCustomSeoMeta({
  title: () => t('p_easy-pixel-art.seoTitle'),
  description: () => t('p_easy-pixel-art.seoDescription'),
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

    <template v-if="ideas?.results?.length">
      <h2>{{ $t('p_easy-pixel-art.ideasH') }}</h2>
      <p>{{ $t('p_easy-pixel-art.ideasP') }}</p>
      <ul class="results easy-ideas">
        <li v-for="a in ideas.results" :key="a.id">
          <NuxtLinkLocale :to="`/art/${a.id_string}`" class="card easy-idea">
            <img
                :src="artImage(a)"
                :alt="artAlt(a.name, $t('c_Card.pixelArtArtwork'), a)"
                width="120" height="120" loading="lazy" decoding="async"
            >
          </NuxtLinkLocale>
          <NuxtLinkLocale :to="`/editor?id=${a.id_string}`" rel="nofollow" class="easy-draw text-xs">
            {{ $t('p_easy-pixel-art.drawThis') }}
          </NuxtLinkLocale>
        </li>
      </ul>
    </template>

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
      <li v-html="$t('p_easy-pixel-art.graphPaper')"/>
    </ul>
    

    <ToolReadme :toc="false">
    <QnA :title="$t('common.questionsAmpAnswers')" :items="faq"/>
    </ToolReadme>
  </div>
</template>

<style scoped>
.prose > .easy-ideas {
  max-width: none;
  padding: 0;
  list-style: none;
}

.easy-ideas li {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

.easy-idea {
  aspect-ratio: 1;
  padding: var(--space-2);
  image-rendering: pixelated;
}

.easy-idea img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.easy-draw {
  text-align: center;
}
</style>
