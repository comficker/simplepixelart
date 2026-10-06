<script setup lang="ts">
const localHtml = useLocalHtml()
const {t, locale} = useI18n()
import type {APIResponse, EditorData, SharedPage} from "~/types";
import {daysLeftUntil, getStorageItem} from "~/helper/utils";
import {tileImageUrl} from "~/helper/tilemap";

type WorkItem = (SharedPage | EditorData) & {
  id: string | number
  id_string?: string
  name?: string
  width?: number
  height?: number
  has_image?: boolean
}

const auth = useAuthStore()

const userWorks = ref<WorkItem[]>([])

const {hasWork, workCount, setWorkCount} = useHasWork()
const {rowSize} = useResultsCols()

const studioLimit = computed(() => rowSize(5, 1))

const hasWorks = computed(() => userWorks.value.length > 0)
const studioWorks = computed(() => userWorks.value.slice(0, studioLimit.value))
const studioSkeletons = computed(() => Math.min(workCount.value, studioLimit.value) + 1)
const showStudio = computed(() => hasWork.value || hasWorks.value)

function isCloudWork(item: WorkItem): boolean {
  return typeof item.id === 'number' && !!item.id_string
}

const failedThumb = reactive<Record<string | number, boolean>>({})

const artImage = useArtImage()

function workThumbUrl(item: WorkItem): string {
  return artImage(item as any)
}

async function loadUserWorks() {
  try {
    if (auth.logged?.id) {
      const res = await useNativeFetch<APIResponse<SharedPage>>('/coloring/shared-pages/', {
        params: {
          user: auth.logged.username,
          page_size: studioLimit.value,
          is_template: true,
          ordering: '-updated',
        },
      })
      userWorks.value = res.results as WorkItem[]
    } else {
      const ws = Object.values(getStorageItem('workspaces')) as EditorData[]
      userWorks.value = (ws
          .filter(w => w && w.id)
          .sort((a: any, b: any) => (b.updated || 0) - (a.updated || 0))
          .slice(0, studioLimit.value)) as WorkItem[]
    }
  } finally {
    setWorkCount(userWorks.value.length)
  }
}

const sizes = ["8x8", "10x10", "12x12", "13x13", "15x15", "16x16", "18x18", "20x20", "24x24", "32x32"];

const faq = computed(() => [
  {q: t('p_index.faq0q'), a: t('p_index.faq0a')},
  {q: t('p_index.faq1q'), a: t('p_index.faq1a')},
  {q: t('p_index.faq2q'), a: t('p_index.faq2a')},
  {q: t('p_index.faq3q'), a: t('p_index.faq3a')},
  {q: t('p_index.faq4q'), a: t('p_index.faq4a')},
  {q: t('p_index.faq5q'), a: t('p_index.faq5a')},
  {q: t('p_index.faq6q'), a: t('p_index.faq6a')},
  {q: t('p_index.faq7q'), a: t('p_index.faq7a')},
])

// Start the artwork list now rather than after the lookups below resolve.
// item-list further down calls useArtListFetch with the same key, so it joins
// this in-flight request instead of opening a second round trip — on a
// client-side navigation each round trip costs about a second of latency.
useArtListFetch({limit: 32, ordering: '-updated'})

/* Up to this many rows. Placeholders pad the list only while it loads; once
   loaded, a short list shows just its real rows -- a permanent skeleton reads
   as something still loading. */
const CREATOR_ROWS = 3

// Awaited together: these three are independent, and awaiting them one after
// the other made the server wait out both round trips before the artwork list
// (fetched by item-list further down) could even start.
const [{data: topCreators, pending: topCreatorsPending}, {data: homeChallenges}, {data: newCreators}] = await Promise.all([
  useAuthFetch<any>('/coloring/creators/top/', {
    key: 'home-top-creators',
    query: {limit: CREATOR_ROWS},
    transform: (s: any) => s?.results || [],
    default: () => [],
  }),
  // This week's theme, then the two before it. Each row leads with its best
  // piece so far (top entry while live, winner once ended).
  useAuthFetch<any>('/coloring/challenges/', {
    key: 'home-challenges',
    transform: (s: any) => [s?.current, ...(s?.past || [])].filter(Boolean).slice(0, 3).map((c: any) => ({
      id_string: c.id_string,
      name: c.name,
      starts: c.starts,
      ends: c.ends,
      active: c.state === 'active',
      days: daysLeftUntil(c.ends),
      art: (c.state === 'active' ? c.top : c.winners)?.[0] || null,
    })),
    default: () => [],
  }),
  useAuthFetch<any>('/coloring/creators/new/', {
    key: 'home-new-creators',
    query: {limit: CREATOR_ROWS},
    transform: (s: any) => s?.results || [],
    default: () => [],
  }),
])
const apiBase = useRuntimeConfig().public.api as string

const creatorRows = computed(() => {
  const rows = topCreators.value || []
  if (!topCreatorsPending.value) return rows
  return Array.from({length: CREATOR_ROWS}, (_, i) => rows[i] || null)
})

function challengeRange(c: { starts: string, ends: string }): string {
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale.value, {month: 'short', day: 'numeric'})
  return `${f(c.starts)} – ${f(c.ends)}`
}

onMounted(() => {
  if (hasWork.value) loadUserWorks()
})

useCustomSeoMeta({
  // The maker wording belongs to /editor, which already carries it. Leaving it
  // here too had the two pages competing for the same query while the terms the
  // home page should own -- simple pixel art, easy pixel art -- went unclaimed.
  title: () => t('seo.home.title'),
  description: () => t('seo.home.description'),
  keywords: () => t('seo.home.keywords'),
  canonical: "https://simplepixelart.com",
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            name: "Simple Pixel Art",
            alternateName: "SimplePixelArt.com",
            description: "Free online pixel art maker and community — create, convert, remix, and share pixel art in seconds.",
            url: "https://simplepixelart.com/",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: "https://simplepixelart.com/arts?search={search_term_string}"
              },
              "query-input": "required name=search_term_string"
            },
            publisher: {
              "@type": "Organization",
              name: "Simple Pixel Art",
              url: "https://simplepixelart.com/",
              logo: "https://simplepixelart.com/favicon.png"
            }
          },
          {
            "@type": "WebApplication",
            name: "Simple Pixel Art Editor",
            applicationCategory: "GraphicsApplication",
            operatingSystem: "Any (browser-based)",
            url: "https://simplepixelart.com/editor",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD"
            }
          },
          {
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "What is Simple Pixel Art?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Simple Pixel Art is a free online pixel art maker. You can draw from scratch, convert any photo to pixel art, remix community templates, and share your work — all in your browser with no signup."
                }
              },
              {
                "@type": "Question",
                name: "Is Simple Pixel Art free?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "Yes, Simple Pixel Art is completely free. No account, no watermark, no downloads required. Everything runs in the browser."
                }
              },
              {
                "@type": "Question",
                name: "Do I need any design skill to use Simple Pixel Art?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "No. Pick a template and remix it, or convert a photo into pixel art with one click. You can publish your first pixel art in under a minute."
                }
              }
            ]
          }
        ]
      })
    }
  ]
});
</script>

<template>
  <ToolLayout :title="$t('common.getStarted')">
    <template #head>
      <p class="home-facts text-xs text-muted">
        {{ $t('p_index.homeFacts') }}
      </p>
    </template>

    <div class="screen home-stack">
      <section class="page-hero">
        <div class="page-hero-main">
          <h1 class="page-hero-title">
            <span class="page-hero-title-main">{{ $t('p_index.findPixelArtYouLove') }}</span>
            <span class="page-hero-title-accent">{{ $t('p_index.thenMakeYourOwn') }}</span>
          </h1>
          <p class="page-hero-tagline">{{ $t('p_index.heroTagline') }}</p>
          <div class="page-hero-cta">
            <NuxtLinkLocale to="/arts" class="btn primary">
              <span class="icon icon-explore"/><span>{{ $t('p_index.browsePixelArt') }}</span>
            </NuxtLinkLocale>
            <NuxtLinkLocale to="/editor?new=true" class="btn">
              <span class="icon icon-pen"/><span>{{ $t('p_index.startDrawing') }}</span>
            </NuxtLinkLocale>
          </div>
          <div class="home-tools"><ToolPaths/></div>
        </div>
      </section>

      <Widget v-if="showStudio" :title="auth.logged ? $t('p_index.yourStudio') : $t('p_index.startAProject')">
        <template #ctl>
          <NuxtLinkLocale to="/work" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>

          <div v-if="hasWorks" class="studio-grid">
            <NuxtLinkLocale to="/editor?new=true" class="studio-new" :title="$t('p_index.newBlankCanvas')">
              <span class="icon icon-plus studio-new-icon"/>
              <span class="studio-new-label">{{ $t('common.new') }}</span>
            </NuxtLinkLocale>
            <NuxtLinkLocale
                v-for="item in studioWorks"
                :key="item.id as any"
                :to="`/editor?id=${item.id_string || item.id}`"
                class="studio-card"
                :title="item.name || $t('common.untitled')"
            >
              <div class="studio-canvas">
                <div class="square">
                  <div class="inside">
                    <img
                        v-if="isCloudWork(item) && item.has_image !== false && !failedThumb[item.id]"
                        :src="workThumbUrl(item)"
                        :alt="item.name || $t('p_index.pixelArtAlt')"
                        class="size-full"
                        loading="lazy"
                        decoding="async"
                        @error="failedThumb[item.id] = true"
                    />
                    <div v-else-if="isCloudWork(item)" class="studio-empty-thumb">
                      <span class="icon icon-image"/>
                    </div>
                    <Thumb v-else :data="item as EditorData"/>
                  </div>
                </div>
              </div>
            </NuxtLinkLocale>
          </div>

          <div v-else class="studio-grid" aria-busy="true">
            <div v-for="i in studioSkeletons" :key="i" class="studio-card">
              <div class="studio-canvas">
                <div class="square">
                  <div class="inside"><span class="skeleton size-full"/></div>
                </div>
              </div>
            </div>
          </div>
      </Widget>

      <!-- Who is new, who leads, what to draw this week: one row, above the
           gallery, out of the hero so the hero can carry the scene. -->
      <div class="screen-row home-row">
        <Widget v-if="newCreators?.length" :title="$t('p_index.newCreators')">
          <template #ctl>
            <NuxtLinkLocale to="/creator" class="widget-ctl-btn">
              <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
            </NuxtLinkLocale>
          </template>
          <ol class="rank-list">
            <li v-for="c in newCreators" :key="c.username">
              <NuxtLinkLocale :to="`/creator/${c.username}`" class="rank-row" :title="`@${c.username}`">
                <span class="rank-avatar">
                  <img v-if="c.avatar" :src="c.avatar" :alt="c.username" loading="lazy">
                  <span v-else>{{ c.username.slice(0, 1).toUpperCase() }}</span>
                </span>
                <span class="rank-name">{{ c.username }}</span>
                <img class="rank-art" :src="tileImageUrl(apiBase, c.art.id_string)" :alt="c.art.name" loading="lazy">
              </NuxtLinkLocale>
            </li>
          </ol>
        </Widget>
        <Widget v-if="topCreators?.length" :title="$t('p_index.topCreators')">
          <template #ctl>
            <NuxtLinkLocale to="/creator" class="widget-ctl-btn">
              <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
            </NuxtLinkLocale>
          </template>
          <ol class="rank-list">
            <li v-for="(c, i) in creatorRows" :key="c ? c.username : `slot-${i}`">
              <NuxtLinkLocale v-if="c" :to="`/creator/${c.username}`" class="rank-row">
                <span class="rank-avatar">
                  <img v-if="c.avatar" :src="c.avatar" :alt="c.username" loading="lazy">
                  <span v-else>{{ c.username.slice(0, 1).toUpperCase() }}</span>
                </span>
                <span class="rank-name">{{ c.username }}</span>
                <span v-if="c.is_bot" class="rank-bot">{{ $t('common.bot') }}</span>
                <span class="rank-count">{{ c.arts }}</span>
              </NuxtLinkLocale>
              <span v-else class="rank-row" aria-hidden="true">
                <span class="skeleton rank-skeleton-avatar"/>
                <span class="skeleton skeleton-line-sm rank-skeleton-name"/>
              </span>
            </li>
          </ol>
        </Widget>
        <Widget v-if="homeChallenges?.length" :title="$t('p_index.weeklyChallenge')">
          <template #ctl>
            <NuxtLinkLocale to="/challenges" class="widget-ctl-btn">
              <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
            </NuxtLinkLocale>
          </template>
          <ol class="rank-list">
            <li v-for="c in homeChallenges" :key="c.id_string">
              <NuxtLinkLocale :to="`/challenges/${c.id_string}`" class="rank-row">
                <img v-if="c.art" class="rank-art" :src="tileImageUrl(apiBase, c.art.id_string)" :alt="c.art.name" loading="lazy">
                <span v-else class="rank-art home-chal-empty"><span class="icon icon-trophy"/></span>
                <span class="rank-name">{{ c.name }}</span>
                <span v-if="c.active" class="rank-count home-chal-live">{{ $t('p_index.daysLeft', c.days, {count: c.days}) }}</span>
                <span v-else class="rank-count">{{ challengeRange(c) }}</span>
              </NuxtLinkLocale>
            </li>
          </ol>
        </Widget>
      </div>

      <Widget :title="$t('p_index.whatSNew')" class="home-library">
        <template #ctl>
          <NuxtLinkLocale to="/arts/new" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>
        <item-list :limit="32" hide-paginator ordering="-updated"/>
      </Widget>

      <!-- SPA_728_90 where the main column clears 728px (measured 736px at
           768, 760 at 1024, 716 at 1280 with the doc rail, 876 at 1440), the
           responsive unit everywhere else, phones included. Only the visible
           one goes live: AdSlot skips a unit whose box is hidden. -->
      <Widget class="home-leaderboard" :title="$t('c_AdSlot.advertisement')">
        <div class="home-ad-fixed"><AdSlot slot="8090404628" :width="728" :height="90" bare/></div>
        <div class="home-ad-fluid"><AdSlot slot="7838948172" size="small" bare/></div>
      </Widget>
    </div>

    <template #status>
      <PartialFooterBar/>
    </template>

    <template #doc>
      <h2>{{ $t('common.simplePixelArt') }}</h2>
      <div class="readme-badges">
        <span class="badge"><span>{{ $t('p_index.price') }}</span><span class="v ok">{{ $t('p_index.free') }}</span></span>
        <span class="badge"><span>{{ $t('p_index.signup') }}</span><span class="v">{{ $t('p_index.none') }}</span></span>
        <span class="badge"><span>{{ $t('p_index.runsIn') }}</span><span class="v">{{ $t('p_index.browser') }}</span></span>
        <span class="badge"><span>{{ $t('p_index.export') }}</span><span class="v">{{ $t('common.png') }}</span></span>
      </div>

      <p v-html="$t('p_index.strongSimplePixelArtStrongIs')"/>

      <blockquote class="gh-alert gh-tip">
        <p class="gh-alert-title"><span class="icon icon-rocket"/>{{ $t('common.tip') }}</p>
        <p v-html="$t('p_index.newHereOpenAnyArtworkFrom')"/>
      </blockquote>

      <h2>{{ $t('p_index.threeWaysToStart') }}</h2>
      <ol>
        <li v-html="localHtml($t('p_index.strongDrawFromScratchStrongOpen'))"/>
        <li v-html="localHtml($t('p_index.strongConvertAPhotoStrongDrop'))"/>
        <li v-html="localHtml($t('p_index.strongRemixATemplateStrongBrowse'))"/>
        <li v-html="localHtml($t('p_index.strongStartFromAPaletteStrong'))"/>
      </ol>

      <h2>{{ $t('p_index.builtForGameDevelopers') }}</h2>
      <p v-html="$t('p_index.theWholeGameAssetPipelineLives')"/>
      <ol>
        <li v-html="localHtml($t('p_index.strongDrawSpritesStrongInThe'))"/>
        <li v-html="localHtml($t('p_index.strongBuildTilesetsStrongAHref'))"/>
        <li v-html="localHtml($t('p_index.strongPaintTilemapsStrongGridOr'))"/>
        <li v-html="$t('p_index.strongExportGameReadyStrongSprite')"/>
      </ol>

      <h2>{{ $t('p_index.whatSInside') }}</h2>
      <ul>
        <li v-html="$t('p_index.strongFullEditorStrongBrushEraser')"/>
        <li v-html="$t('p_index.strongAnimationStrongFrameByFrame')"/>
        <li v-html="$t('p_index.strongMirrorDrawingStrongDrawSymme')"/>
        <li v-html="localHtml($t('p_index.strongPaletteManagerStrongBuildSav'))"/>
        <li v-html="$t('p_index.strongPhotoToPixelArtStrong')"/>
        <li v-html="$t('p_index.strongTilesetsTilemapsStrongAutoti')"/>
        <li><strong>{{ $t('common.weeklyChallenges') }}</strong> {{ $t('p_index.aFresh') }} <NuxtLinkLocale to="/challenges">{{ $t('p_index.themeEveryWeek') }}</NuxtLinkLocale>{{ $t('p_index.communityVotedWinners') }}</li>
        <li v-html="$t('p_index.strongExportAnywhereStrongCleanPng')"/>
      </ul>

      <h2>{{ $t('p_index.popularCanvasSizes') }}</h2>
      <p>
        {{ $t('p_index.startFromAPreset') }}
        <template v-for="(s, i) in sizes" :key="s"><NuxtLinkLocale :to="`/arts/size-${s}`">{{ s }}</NuxtLinkLocale><span v-if="i < sizes.length - 1" aria-hidden="true"> · </span></template>.
      </p>

      <h2>{{ $t('p_index.newToPixelArt') }}</h2>
      <p>
        {{ $t('p_index.startWith') }} <NuxtLinkLocale to="/easy-pixel-art">{{ $t('p_index.easyPixelArt') }}</NuxtLinkLocale> {{ $t('p_index.smallGridsThreeColorsAndA') }} <NuxtLinkLocale to="/editor">{{ $t('p_index.pixelArtEditor') }}</NuxtLinkLocale> {{ $t('p_index.toMakePixelArtOnlineFor') }} </p>

      <QnA :title="$t('common.questionsAmpAnswers')" :items="faq"/>
    </template>
  </ToolLayout>
</template>

<style scoped>
.home-ad-fixed {
  display: none;
}

@media (min-width: 768px) and (max-width: 1199px), (min-width: 1360px) {
  .home-ad-fixed {
    display: block;
  }

  .home-ad-fluid {
    display: none;
  }
}

/* The creator's latest piece, beside their name: a first piece is the
   thing this list exists to show. */
.home-row .rank-art {
  width: var(--space-6);
  height: var(--space-6);
  flex-shrink: 0;
  object-fit: contain;
  image-rendering: pixelated;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

/* A theme nobody has entered yet: the trophy stands in for the piece. */
.home-chal-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

.home-chal-empty .icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.home-chal-live {
  font-weight: 600;
  color: var(--primary);
}

.page-hero .home-tools {
  margin-top: var(--space-4);
}

.home-library {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
}

.home-library :deep(.widget-body) {
  flex: 1 0 auto;
}

.studio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .studio-grid > :nth-child(n+4) {
    display: none;
  }
}

@media (min-width: 768px) {
  .studio-grid {
    grid-template-columns: repeat(var(--results-cols, 6), minmax(0, 1fr));
  }
}

.studio-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  text-align: center;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  aspect-ratio: 1;
  transition: border-color var(--transition), color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .studio-new:hover {
    color: var(--primary);
    border-style: solid;
    background: var(--surface-2);
  }
}

.studio-new-icon {
  width: var(--icon-lg); height: var(--icon-lg);
}

.studio-new-label {
  font-size: var(--text-sm);
  font-weight: 600;
}

.studio-card {
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition);

  --fold-size: 14px;
  transition: --fold-size 220ms cubic-bezier(.22,.61,.36,1);
  -webkit-mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
  mask: linear-gradient(225deg, transparent calc(var(--fold-size) * 0.7071 - 0.25px), #000 calc(var(--fold-size) * 0.7071 + 0.25px));
}

@media (hover: hover) and (pointer: fine) {
  .studio-card:hover {
    --fold-size: 28px;
  }
}

.studio-card .square {
  border-radius: calc(var(--radius-sm) - 1px);
  overflow: hidden;
}

.studio-card::after {
  content: "";
  position: absolute;
  top: -1px;
  right: -1px;
  width: var(--fold-size);
  height: var(--fold-size);
  background: linear-gradient(
    225deg,
    var(--border) calc(50% + 1.25px),
    var(--surface-2) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.studio-canvas {
  display: block;
  background: var(--card);
  image-rendering: pixelated;
}

.studio-canvas img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.studio-empty-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.studio-empty-thumb .icon {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

</style>
