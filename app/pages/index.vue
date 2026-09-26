<script setup lang="ts">
const localePath = useLocalePath()
const {t} = useI18n()
import type {APIResponse, EditorData, SharedPage} from "~/types";
import {daysLeftUntil, getStorageItem} from "~/helper/utils";

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
const loadingWorks = ref(false)

const {hasWork, workCount, setWorkCount} = useHasWork()
const {rowSize} = useResultsCols()

const studioLimit = computed(() => rowSize(5, 1))

const mounted = ref(false)

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
  loadingWorks.value = true
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
    loadingWorks.value = false


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
useArtListFetch({limit: 32, ordering: '-updated', hideIp: true})

/* A fixed number of rows so the hero keeps its height while the site is
   young and only a couple of creators qualify: the short list is padded with
   placeholders rather than leaving a gap. */
const CREATOR_ROWS = 3

// Awaited together: these two are independent, and awaiting them one after
// the other made the server wait out both round trips before the artwork list
// (fetched by item-list further down) could even start.
const [{data: aiEnabled}, {data: topCreators}, {data: homeChallenge}] = await Promise.all([
  useAuthFetch<boolean>('/coloring/economy/', {
    key: 'home-ai-image-enabled',
    transform: (s: any) => !!s?.ai_image_enabled,
    default: () => false,
  }),
  useAuthFetch<any>('/coloring/creators/top/', {
    key: 'home-top-creators',
    query: {limit: CREATOR_ROWS},
    transform: (s: any) => s?.results || [],
    default: () => [],
  }),
  useAuthFetch<any>('/coloring/challenges/', {
    key: 'home-weekly-challenge',
    transform: (s: any) => s?.current
        ? {
          id_string: s.current.id_string,
          name: s.current.name,
          ends: s.current.ends,
          entries: s.current.entries_count,
        }
        : null,
    default: () => null,
  }),
])

const creatorRows = computed(() => {
  const rows = topCreators.value || []
  return Array.from({length: CREATOR_ROWS}, (_, i) => rows[i] || null)
})

const challengeDaysLeft = computed(() => daysLeftUntil(homeChallenge.value?.ends))
const aiPrompt = ref('')

function goGenerate() {
  const p = aiPrompt.value.trim()
  if (p.length < 3) return
  navigateTo(localePath(`/generate?prompt=${encodeURIComponent(p.slice(0, 300))}`))
}

onMounted(() => {
  mounted.value = true

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
        {{ $t('p_index.spritesTilesMapsGodotUnityPhaser') }}
      </p>
    </template>

    <div class="screen home-stack">
      <section class="home-hero">
        <div class="home-hero-main">
          <span class="home-hero-eyebrow">{{ $t('p_index.freeNoSignupRunsInYour') }}</span>
          <h1 class="home-hero-title">
            <span class="home-hero-title-main">{{ $t('p_index.makePixelArt') }}</span>
            <span class="home-hero-title-accent">{{ $t('p_index.inSeconds') }}</span>
          </h1>
          <p class="home-hero-tagline">{{ $t('p_index.heroTagline') }}</p>
          <form v-if="aiEnabled" class="home-ai" @submit.prevent="goGenerate">
            <input
                v-model="aiPrompt"
                class="home-ai-input"
                type="text"
                maxlength="300"
                :placeholder="$t('p_index.describeASpriteASleepingOrange')"
                :aria-label="$t('p_index.describeThePixelArtToGenerate')"
            >
            <button type="submit" class="btn primary home-ai-btn" :disabled="aiPrompt.trim().length < 3">
              <span class="icon icon-auto-fix"/><span>{{ $t('common.generate') }}</span>
            </button>
          </form>
          <div class="home-tools"><ToolPaths exclude="ai"/></div>
        </div>

        <div class="home-hero-aside">
          <section v-if="topCreators?.length" class="home-aside-sec">
            <div class="home-aside-cap">
              <span>{{ $t('p_index.topCreators') }}</span>
              <NuxtLinkLocale to="/creator" class="home-aside-more">{{ $t('p_index.viewAll') }}</NuxtLinkLocale>
            </div>
            <ol class="home-creators">
              <li v-for="(c, i) in creatorRows" :key="c ? c.username : `slot-${i}`">
                <NuxtLinkLocale v-if="c" :to="`/creator/${c.username}`" class="home-creator">
                  <span class="home-creator-rank">{{ i + 1 }}</span>
                  <span class="home-creator-avatar">
                    <img v-if="c.avatar" :src="c.avatar" :alt="c.username" loading="lazy">
                    <span v-else>{{ c.username.slice(0, 1).toUpperCase() }}</span>
                  </span>
                  <span class="home-creator-name">{{ c.username }}</span>
                  <span class="home-creator-n">{{ c.arts }}</span>
                </NuxtLinkLocale>
                <span v-else class="home-creator" aria-hidden="true">
                  <span class="home-creator-rank">{{ i + 1 }}</span>
                  <span class="skeleton home-creator-slot-avatar"/>
                  <span class="skeleton skeleton-line-sm home-creator-slot-name"/>
                </span>
              </li>
            </ol>
          </section>

          <section v-if="homeChallenge" class="home-aside-sec">
            <div class="home-aside-cap">
              <span>{{ $t('p_index.weeklyChallenge') }}</span>
              <NuxtLinkLocale to="/challenges" class="home-aside-more">{{ $t('p_index.viewAll') }}</NuxtLinkLocale>
            </div>
            <NuxtLinkLocale :to="`/challenges/${homeChallenge.id_string}`" class="home-challenge-link">
              <span class="home-challenge-name">{{ homeChallenge.name }}</span>
              <span class="home-challenge-sub">
                {{ challengeDaysLeft }} {{ challengeDaysLeft === 1 ? 'day' : 'days' }} left ·
                {{ homeChallenge.entries }} {{ homeChallenge.entries === 1 ? 'entry' : 'entries' }} · {{ $t('p_index.joinChallenge') }} →
              </span>
            </NuxtLinkLocale>
          </section>
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
                :title="item.name || 'Untitled'"
            >
              <div class="studio-canvas">
                <div class="square">
                  <div class="inside">
                    <img
                        v-if="isCloudWork(item) && item.has_image !== false && !failedThumb[item.id]"
                        :src="workThumbUrl(item)"
                        :alt="item.name || 'Pixel art'"
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

      <!-- SPA_728_90. A fixed 728px unit, so it only renders where the main
           column actually clears it: measured 736px at 768, 760 at 1024, 716
           at 1280 (the doc rail takes its share), 876 at 1440. -->
      <Widget class="home-leaderboard" :title="$t('c_AdSlot.advertisement')">
        <AdSlot slot="8090404628" :width="728" :height="90" bare/>
      </Widget>

      <Widget :title="$t('p_index.whatSNew')" class="home-library">
        <template #ctl>
          <NuxtLinkLocale to="/arts/new" class="widget-ctl-btn">
            <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
          </NuxtLinkLocale>
        </template>
        <item-list :limit="32" hide-ip hide-paginator ordering="-updated"/>
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
        <li v-html="$t('p_index.strongDrawFromScratchStrongOpen')"/>
        <li v-html="$t('p_index.strongConvertAPhotoStrongDrop')"/>
        <li v-html="$t('p_index.strongRemixATemplateStrongBrowse')"/>
        <li v-html="$t('p_index.strongStartFromAPaletteStrong')"/>
      </ol>

      <h2>{{ $t('p_index.builtForGameDevelopers') }}</h2>
      <p v-html="$t('p_index.theWholeGameAssetPipelineLives')"/>
      <ol>
        <li v-html="$t('p_index.strongDrawSpritesStrongInThe')"/>
        <li v-html="$t('p_index.strongBuildTilesetsStrongAHref')"/>
        <li v-html="$t('p_index.strongPaintTilemapsStrongGridOr')"/>
        <li v-html="$t('p_index.strongExportGameReadyStrongSprite')"/>
      </ol>

      <h2>{{ $t('p_index.whatSInside') }}</h2>
      <ul>
        <li v-html="$t('p_index.strongFullEditorStrongBrushEraser')"/>
        <li v-html="$t('p_index.strongAnimationStrongFrameByFrame')"/>
        <li v-html="$t('p_index.strongMirrorDrawingStrongDrawSymme')"/>
        <li v-html="$t('p_index.strongPaletteManagerStrongBuildSav')"/>
        <li v-html="$t('p_index.strongPhotoToPixelArtStrong')"/>
        <li v-html="$t('p_index.strongTilesetsTilemapsStrongAutoti')"/>
        <li><strong>{{ $t('common.weeklyChallenges') }}</strong> {{ $t('p_index.aFresh') }} <a href="/challenges">{{ $t('p_index.themeEveryWeek') }}</a>{{ $t('p_index.communityVotedWinners') }}</li>
        <li v-html="$t('p_index.strongExportAnywhereStrongCleanPng')"/>
      </ul>

      <h2>{{ $t('p_index.popularCanvasSizes') }}</h2>
      <p>
        {{ $t('p_index.startFromAPreset') }}
        <template v-for="(s, i) in sizes" :key="s"><a :href="`/arts/size-${s}`">{{ s }}</a><span v-if="i < sizes.length - 1" aria-hidden="true"> · </span></template>.
      </p>

      <h2>{{ $t('p_index.newToPixelArt') }}</h2>
      <p>
        {{ $t('p_index.startWith') }} <NuxtLinkLocale to="/easy-pixel-art">{{ $t('p_index.easyPixelArt') }}</NuxtLinkLocale> {{ $t('p_index.smallGridsThreeColorsAndA') }} <NuxtLinkLocale to="/editor">{{ $t('p_index.pixelArtEditor') }}</NuxtLinkLocale> {{ $t('p_index.toMakePixelArtOnlineFor') }} </p>

      <QnA :title="$t('common.questionsAmpAnswers')" :items="faq"/>
    </template>
  </ToolLayout>
</template>

<style scoped>
/* No flat gap: each element sets its own top margin, so the eyebrow reads as a
   label on the title and the AI form gets real separation from the copy. */
.home-leaderboard {
  display: none;
}

@media (min-width: 768px) and (max-width: 1199px), (min-width: 1360px) {
  .home-leaderboard {
    display: block;
  }
}

/* No padding and no gap on the frame itself: every divider inside runs edge
   to edge, and each block carries its own padding instead. */
.home-hero {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 0;
  background:
    radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, var(--surface-2) 85%, transparent), transparent 62%),
    var(--surface);
}

.home-hero-eyebrow {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--muted);
}

.home-hero-title {
  margin-top: var(--space-2);
  display: flex;
  flex-wrap: wrap;
  /* em, not rem: the word gap has to scale with the clamped title size */
  gap: 0 0.25em;
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.035em;
}

.home-hero-title-main {
  color: var(--foreground);
}

.home-hero-title-accent {
  color: var(--primary);
}

.home-hero-tagline {
  margin-top: var(--space-3);
  color: var(--muted);
  font-size: var(--text-sm);
  /* 64ch keeps the copy to three lines on desktop and sits closer to the
     title's width, so the block does not read as a narrow column. */
  max-width: 64ch;
}

.home-ai {
  margin-top: var(--space-5);
  display: flex;
  gap: var(--space-2);
  width: 100%;
  /* Matches the tagline measure so the hero keeps one right-hand edge. */
  max-width: 560px;
}

.home-hero-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  padding: var(--space-4);
}

/* No frame and no padding of its own: the hero is one panel split by a
   single rule, and each section inside pads itself so that rule runs edge
   to edge. */
.home-hero-aside {
  display: flex;
  flex-direction: column;
  gap: 0;
  align-self: stretch;
  min-width: 0;
  border-top: 1px solid var(--border);
}

.home-aside-sec {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-4);
}

.home-aside-sec + .home-aside-sec {
  border-top: 1px solid var(--border);
}

/* Same caption as a widget head, without the box: uppercase, muted, small. */
.home-aside-cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  font-size: var(--text-2xs);
  font-weight: 700;
  font-variation-settings: "wght" 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.home-aside-more {
  color: var(--muted);
  transition: color var(--transition);
}

.home-hero .home-challenge-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}

.home-creators {
  display: flex;
  flex-direction: column;
  list-style: none;
  padding: 0;
}

.home-creator {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) 0;
  font-size: var(--text-xs);
}

.home-creator-rank {
  width: 1.25em;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

.home-creator-avatar,
.home-creator-slot-avatar {
  width: var(--space-6);
  height: var(--space-6);
  flex-shrink: 0;
  border-radius: var(--radius-sm);
}

.home-creator-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-weight: 800;
  font-size: var(--text-2xs);
  color: var(--primary-foreground);
  background: var(--primary);
}

.home-creator-slot-name {
  width: 40%;
}

.home-creator-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-creator-name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-creator-n {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .home-challenge-link:hover .home-challenge-name,
  .home-creator:hover .home-creator-name,
  .home-aside-more:hover {
    color: var(--primary);
  }
}

/* Two equal columns, split by one rule. Below this the hero is a single
   column and the same rule runs across the top of the aside instead. */
@media (min-width: 1360px) {
  /* Grid, not flex: two 1fr tracks stay exactly equal, where flex-basis 0
     would hand the aside its padding and divider on top of its share. */
  .home-hero {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
    gap: 0;
  }

  .home-hero-main,
  .home-hero-aside {
    min-width: 0;
  }

  .home-hero-aside {
    justify-content: center;
    border-top: 0;
    border-left: 1px solid var(--border);
  }
}

.home-hero .home-tools {
  margin-top: var(--space-4);
}

.home-ai-input {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--foreground);
  font-size: var(--text-sm);
}

.home-ai-input:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.home-ai-btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.home-challenge-link {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.home-challenge-name {
  font-weight: 800;
  color: var(--foreground);
}

.home-challenge-sub {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--muted);
  white-space: nowrap;
}

/* Phones: the row cannot hold all three parts, and the auto margin left the
   wrapped line pinned right. Lay it out as two rows instead. */
@media (max-width: 767px) {
  .home-challenge-link {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    row-gap: var(--space-1);
  }

  .home-challenge-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .home-challenge-sub {
    grid-column: 1 / -1;
    margin-left: 0;
    white-space: normal;
  }
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
    gap: var(--space-4);
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
  font-size: 28px;
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
  background: var(--surface);
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
    var(--surface) calc(50% + 1.75px)
  );
  border-left: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
  pointer-events: none;
  z-index: 1;
}

.studio-canvas {
  display: block;
  background: var(--surface);
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
  width: 28px;
  height: 28px;
}

</style>
