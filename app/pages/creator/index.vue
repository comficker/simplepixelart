<script setup lang="ts">
const {t} = useI18n()
const route = useRoute()
const router = useRouter()

interface RankedCreator {
  rank: number
  username: string
  avatar: string | null
  arts: number
  is_bot?: boolean
}

/* Rolling windows, which is what the API counts: a calendar period empties
   the board every time it turns over. */
const PERIODS = [
  {key: '', label: t('p_creator.allTime')},
  {key: 'day', label: t('p_creator.today')},
  {key: 'week', label: t('p_creator.thisWeek')},
  {key: 'month', label: t('p_creator.thisMonth')},
  {key: 'quarter', label: t('p_creator.thisQuarter')},
] as const

const period = computed(() => {
  const q = (route.query.period as string) || ''
  return PERIODS.some(p => p.key === q) ? q : ''
})
const currentPage = computed(() => route.query.page ? Number.parseInt(route.query.page.toString()) : 1)

const params = computed(() => ({
  period: period.value || 'all',
  page: currentPage.value,
  page_size: 30,
}))

const {data, pending} = await useAuthFetch<{
  count: number
  num_pages: number
  results: RankedCreator[]
  links: { next: string | null; previous: string | null }
}>('/coloring/creators/ranking/', {
  query: params,
  key: computed(() => `creator-ranking|${params.value.period}|${params.value.page}`),
})

const results = computed(() => data.value?.results || [])
const isLoading = computed(() => pending.value && !results.value.length)
const isEmpty = computed(() => !pending.value && !!data.value && results.value.length === 0)

function setPeriod(key: string) {
  const q: Record<string, any> = {...route.query, period: key || undefined}
  delete q.page
  Object.keys(q).forEach(k => { if (q[k] === undefined) delete q[k] })
  router.push({query: q})
}

/* The podium reads by colour alone; every row stays the same size. */
function rankClass(rank: number) {
  return rank <= 3 ? `top top-${rank}` : ''
}

const {page, prevTo, nextTo} = usePageLinks(data)

const hasQuery = computed(() => !!period.value || currentPage.value > 1)

const canonicalUrl = computed(() => {
  const base = 'https://simplepixelart.com/creator'
  if (period.value) return base
  return currentPage.value > 1 ? `${base}?page=${currentPage.value}` : base
})

const seoTitle = computed(() =>
    currentPage.value > 1
        ? `${t('seo.creators.title')} — ${currentPage.value}`
        : t('seo.creators.title'),
)

useCustomSeoMeta({
  title: seoTitle,
  description: () => t('seo.creators.description'),
  keywords: "pixel art creators, pixel art artists, pixel art community, creator profiles",
  canonical: canonicalUrl,
  robots: () => hasQuery.value ? 'noindex, follow' : 'index, follow',
})
</script>

<template>
  <div class="page">
    <section class="readme rank-panel">
      <div class="readme-head rank-head">
        <h1 class="rank-title">
          <span class="icon icon-trophy"/>
          <span>{{ $t('p_creator.pixelArtCreators') }}</span>
        </h1>
        <span v-if="data?.count" class="rank-total">
          {{ $t('p_creator.creatorCount', data.count, {count: data.count}) }}
        </span>
      </div>

      <p class="rank-lead">{{ $t('p_creator.rankedByThePublicWorkThey') }}</p>

      <nav class="rank-periods" :aria-label="$t('p_creator.ranking')">
        <button
            v-for="p in PERIODS"
            :key="p.key || 'all'"
            type="button"
            class="btn"
            :class="{primary: period === p.key}"
            :aria-pressed="period === p.key"
            @click="setPeriod(p.key)"
        >
          {{ p.label }}
        </button>
      </nav>

      <ol v-if="isLoading" class="rank-list lg">
        <li v-for="i in 10" :key="`sk-${i}`">
          <span class="rank-row" :class="rankClass(i)" aria-hidden="true">
            <span class="rank-n">{{ i }}</span>
            <span class="skeleton rank-skeleton-avatar"/>
            <span class="skeleton skeleton-line-sm rank-skeleton-name"/>
          </span>
        </li>
      </ol>

      <div v-else-if="isEmpty" class="empty-state rank-empty">
        <span class="empty-state-icon icon icon-trophy" aria-hidden="true"/>
        <div class="empty-state-title">{{ $t('p_creator.noCreatorsYet') }}</div>
        <p class="empty-state-body">{{ $t('p_creator.nobodyPublishedInThisPeriod') }}</p>
        <div class="empty-state-actions">
          <button v-if="period" class="btn" @click="setPeriod('')">{{ $t('p_creator.allTime') }}</button>
          <NuxtLinkLocale to="/editor?new=true" class="btn primary">{{ $t('common.new') }}</NuxtLinkLocale>
        </div>
      </div>

      <ol v-else class="rank-list lg">
        <li v-for="c in results" :key="c.username">
          <NuxtLinkLocale :to="`/creator/${c.username}`" class="rank-row" :class="rankClass(c.rank)">
            <span class="rank-n">{{ c.rank }}</span>
            <span class="rank-avatar">
              <img v-if="c.avatar" :src="c.avatar" :alt="c.username" loading="lazy">
              <span v-else>{{ c.username.slice(0, 1).toUpperCase() }}</span>
            </span>
            <span class="rank-name">{{ c.username }}</span>
            <span v-if="c.is_bot" class="rank-bot">{{ $t('common.bot') }}</span>
            <span class="rank-count">{{ $t('p_creator.artCount', c.arts, {count: c.arts}) }}</span>
          </NuxtLinkLocale>
        </li>
      </ol>

      <div v-if="(data?.num_pages || 1) > 1" class="rank-foot">
        <Paginator
            :page="page"
            :pages="data?.num_pages || 1"
            :prev-to="prevTo"
            :next-to="nextTo"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.rank-panel {
  max-width: 640px;
  margin-inline: auto;
}

/* The head pads to the same 16px the rows do, so the title sits on the same
   line as the names under it. */
.rank-head {
  padding-inline: var(--space-4);
}

.rank-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
}

.rank-title .icon {
  color: var(--primary);
}

.rank-total {
  color: var(--muted);
  white-space: nowrap;
}

.rank-lead {
  padding: var(--space-3) var(--space-4) 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.rank-periods {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.rank-empty {
  margin: var(--space-4);
}

.rank-foot {
  display: flex;
  justify-content: flex-end;
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
}
</style>
