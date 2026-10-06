<script setup lang="ts">
const artImage = useArtImage()
import type {APIResponse, SharedPage} from '~/types'
import {daysLeftUntil} from '~/helper/utils'

interface Entry {
  id: number
  id_string: string
  name: string
  username: string | null
  votes: number
}

interface ChallengeDetail {
  id_string: string
  name: string
  desc: string | null
  starts: string
  ends: string
  state: 'active' | 'ended' | 'upcoming'
  entries_count: number
  top?: Entry[]
  winners?: Entry[]
  palette?: { id_string: string; name: string; colors: string[] } | null
}

const route = useRoute()
const {t, locale} = useI18n()
const auth = useAuthStore()
const loginModal = useLoginModal()
const slug = computed(() => route.params.id_string?.toString() || '')

const {data: challenge, error} = await useAuthFetch<ChallengeDetail>(
    `/coloring/challenges/${slug.value}/`, {key: `challenge-${slug.value}`},
)

if ((error.value || !challenge.value) && import.meta.server) {
  setResponseStatus(useRequestEvent()!, 404)
}

const {data: entriesRes, refresh: refreshEntries} = await useAuthFetch<APIResponse<SharedPage>>(
    '/coloring/shared-pages/',
    {
      params: {challenge: slug.value, status: 'public', page_size: 48, is_tile: false},
      key: `challenge-entries-${slug.value}`,
    },
)

const entries = computed(() => entriesRes.value?.results || [])
const winners = computed(() => challenge.value?.winners || [])
// Entries with at least one like, best first: likes on an entry's page are
// the votes.
const leaders = computed(() => (challenge.value?.top || []).filter(e => e.votes > 0))
const shareMeta = computed(() => ({
  title: challenge.value ? t('p_challenges_id_string.shareTitle', {name: challenge.value.name}) : t('p_challenges_id_string.shareTitleFallback'),
  desc: challenge.value?.desc || t('p_challenges_id_string.shareDesc'),
}))
const showSubmit = ref(false)

function daysLeft(): number {
  return daysLeftUntil(challenge.value?.ends)
}

function fmtRange(): string {
  if (!challenge.value) return ''
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale.value, {month: 'short', day: 'numeric'})
  return `${f(challenge.value.starts)} – ${f(challenge.value.ends)}`
}

function thumb(e: Entry): string {
  return artImage(e)
}

const medals = ['🥇', '🥈', '🥉']


useCustomSeoMeta({
  untranslated: true,
  title: () => challenge.value
      ? `${challenge.value.name} — Pixel Art Challenge`
      : 'Challenge not found',
  description: () => challenge.value
      ? `“${challenge.value.name}” pixel art challenge, ${challenge.value.starts} to ${challenge.value.ends}. ${challenge.value.desc || 'Draw your take and submit it for community votes.'}`.slice(0, 158)
      : 'Weekly pixel art challenge on SimplePixelArt.',
  canonical: () => `https://simplepixelart.com/challenges/${slug.value}`,
  robots: () => (challenge.value ? 'index, follow' : 'noindex, follow'),
})
</script>

<template>
  <div class="page screen">
    <template v-if="challenge">
      <div class="screen-head">
        <div class="screen-head-text">
          <p class="chal-bc">
            <NuxtLinkLocale to="/challenges" class="section-link">{{ $t('p_challenges_id_string.allChallenges') }}</NuxtLinkLocale>
          </p>
          <h1 class="screen-title">{{ challenge.name }}</h1>
          <p v-if="challenge.desc" class="screen-desc">{{ challenge.desc }}</p>
          <p class="chal-meta">
          <template v-if="challenge.state === 'active'">
            <strong>{{ $t('p_challenges_id_string.liveNow') }}</strong> · {{ fmtRange() }} · {{ $t('p_challenges_id_string.daysLeft', daysLeft(), {count: daysLeft()}) }}
            · <template v-if="challenge.entries_count">{{ $t('p_challenges_id_string.entryCount', challenge.entries_count, {count: challenge.entries_count}) }}</template>
            <template v-else>{{ $t('common.beTheFirstToEnter') }}</template>
          </template>
          <template v-else-if="challenge.state === 'ended'">
            {{ $t('p_challenges_id_string.endedRange', {range: fmtRange()}) }}<template v-if="challenge.entries_count"> · {{ $t('p_challenges_id_string.entryCount', challenge.entries_count, {count: challenge.entries_count}) }}</template>
          </template>
            <template v-else>{{ $t('p_challenges_id_string.startsRange', {range: fmtRange()}) }}</template>
          </p>
          <div v-if="challenge.palette" class="chal-palette">
            <NuxtLinkLocale :to="`/palettes/${challenge.palette.id_string}`" class="chal-palette-strip" :title="challenge.palette.name">
              <span v-for="c in challenge.palette.colors" :key="c" :style="{background: c}"/>
            </NuxtLinkLocale>
            <span class="chal-palette-note">{{ $t('p_challenges_id_string.drawWithThisPalette', {n: challenge.palette.colors.length}) }}</span>
          </div>
        </div>
        <div v-if="challenge.state === 'active'" class="screen-actions">
          <NuxtLinkLocale :to="challenge.palette ? `/editor?new=true&palette=${challenge.palette.id_string}` : '/editor?new=true'" class="btn primary">
            <span class="icon icon-pencil"/><span>{{ $t('common.drawYourEntry') }}</span>
          </NuxtLinkLocale>
          <button v-if="auth.isLogged" class="btn" @click="showSubmit = true">
            <span class="icon icon-flag"/><span>{{ $t('common.submitAnArt') }}</span>
          </button>
          <button v-else class="btn" @click="loginModal.show(() => showSubmit = true)">
            <span class="icon icon-flag"/><span>{{ $t('common.logInToSubmit') }}</span>
          </button>
          <SocialSharing :meta="shareMeta" position="right"/>
        </div>
        <div v-else class="screen-actions">
          <SocialSharing :meta="shareMeta" position="right"/>
        </div>
      </div>

      <Widget v-if="challenge.state === 'active' && leaders.length" :title="$t('p_challenges_id_string.leaderboard')">
        <ol class="rank-list chal-leaders">
          <li v-for="(e, i) in leaders" :key="e.id">
            <NuxtLinkLocale :to="`/art/${e.id_string}`" class="rank-row">
              <span class="rank-n">{{ i + 1 }}</span>
              <img :src="thumb(e)" :alt="e.name" class="chal-leader-thumb" loading="lazy">
              <span class="rank-name">{{ e.name }}</span>
              <span v-if="e.username" class="text-muted">@{{ e.username }}</span>
              <span class="rank-count">{{ e.votes }} <span class="icon icon-heart"/></span>
            </NuxtLinkLocale>
          </li>
        </ol>
      </Widget>

      <Widget v-if="challenge.state === 'ended' && winners.length" :title="$t('p_challenges_id_string.winners')">
        <div class="chal-winner-row">
          <NuxtLinkLocale
              v-for="(e, i) in winners"
              :key="e.id"
              :to="`/art/${e.id_string}`"
              class="chal-winner"
          >
            <span class="chal-medal">{{ medals[i] || '·' }}</span>
            <img :src="thumb(e)" :alt="e.name" loading="lazy" decoding="async">
            <span class="chal-winner-name">{{ e.name }}</span>
            <span class="chal-winner-sub"><template v-if="e.username">@{{ e.username }} · </template>{{ $t('p_challenges_id_string.voteCount', e.votes, {count: e.votes}) }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget :title="$t('p_challenges_id_string.entries')">
        <div v-if="entries.length" class="results">
          <ItemCard v-for="p in entries" :key="p.id" :value="p"/>
        </div>
        <p v-else class="text-muted text-xs">
          {{ challenge.state === 'active' ? $t('p_challenges_id_string.noEntriesYetActive') : $t('p_challenges_id_string.noEntriesYet') }}
        </p>
      </Widget>

      <ChallengeSubmitModal
          v-if="showSubmit"
          :challenge="challenge.id_string"
          @close="showSubmit = false"
          @submitted="refreshEntries()"
      />
    </template>

    <div v-else class="empty-state">
      <span class="empty-state-icon icon icon-search" aria-hidden="true"/>
      <h1 class="empty-state-title chal-not-found-title">{{ $t('p_challenges_id_string.challengeNotFound') }}</h1>
      <p class="empty-state-body">{{ $t('p_challenges_id_string.itMayHaveBeenRemoved') }}</p>
      <NuxtLinkLocale to="/challenges" class="btn primary empty-state-action">{{ $t('p_challenges_id_string.seeAllChallenges') }}</NuxtLinkLocale>
    </div>
  </div>
</template>

<style scoped>
/* An h1 for the outline, still drawn like every other empty-state title. */
.chal-not-found-title {
  font-family: inherit;
  font-variation-settings: normal;
}

.chal-leader-thumb {
  width: var(--space-6);
  height: var(--space-6);
  flex-shrink: 0;
  object-fit: contain;
  image-rendering: pixelated;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.chal-leaders .rank-count {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.chal-bc {
  font-size: var(--text-xs);
}

.chal-meta {
  font-size: var(--text-xs);
  color: var(--muted);
}

.chal-winner-row {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(3, 1fr);
  max-width: 560px;
}

.chal-winner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-align: center;
}

.chal-medal {
  font-size: var(--text-lg);
  line-height: 1;
}

.chal-winner img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  image-rendering: pixelated;
}

.chal-winner-name {
  font-size: var(--text-xs);
  font-weight: 700;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chal-winner-sub {
  font-size: var(--text-2xs);
  color: var(--muted);
}

.chal-palette {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.chal-palette-strip {
  display: flex;
  height: var(--space-6);
  overflow: hidden;
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 1px var(--border);
}

.chal-palette-strip span {
  width: var(--space-5);
}

.chal-palette-note {
  font-size: var(--text-xs);
  color: var(--muted);
}
</style>
