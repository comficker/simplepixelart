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
}

const route = useRoute()
const auth = useAuthStore()
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
const showSubmit = ref(false)

function daysLeft(): number {
  return daysLeftUntil(challenge.value?.ends)
}

function fmtRange(): string {
  if (!challenge.value) return ''
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
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
      : 'Pixel Art Challenge',
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
            <strong>{{ $t('p_challenges_id_string.liveNow') }}</strong> · {{ fmtRange() }} · {{ daysLeft() }} {{ daysLeft() === 1 ? 'day' : 'days' }} left
            · {{ challenge.entries_count }} {{ challenge.entries_count === 1 ? 'entry' : 'entries' }}
          </template>
          <template v-else-if="challenge.state === 'ended'">
            Ended · {{ fmtRange() }} · {{ challenge.entries_count }} {{ challenge.entries_count === 1 ? 'entry' : 'entries' }}
          </template>
            <template v-else>Starts {{ fmtRange() }}</template>
          </p>
        </div>
        <div v-if="challenge.state === 'active'" class="screen-actions">
          <NuxtLinkLocale to="/editor?new=true" class="btn primary">
            <span class="icon icon-pencil"/><span>{{ $t('common.drawYourEntry') }}</span>
          </NuxtLinkLocale>
          <button v-if="auth.isLogged" class="btn" @click="showSubmit = true">
            <span class="icon icon-flag"/><span>{{ $t('common.submitAnArt') }}</span>
          </button>
          <button v-else class="btn" @click="auth.authOAUTH()">
            <span class="icon icon-flag"/><span>{{ $t('common.logInToSubmit') }}</span>
          </button>
        </div>
      </div>

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
            <span class="chal-winner-sub">@{{ e.username }} · {{ e.votes }} {{ e.votes === 1 ? 'vote' : 'votes' }}</span>
          </NuxtLinkLocale>
        </div>
      </Widget>

      <Widget :title="$t('p_challenges_id_string.entries')">
        <div v-if="entries.length" class="results">
          <ItemCard v-for="p in entries" :key="p.id" :value="p"/>
        </div>
        <p v-else class="text-muted text-xs">
          No public entries yet{{ challenge.state === 'active' ? ' — be the first!' : '.' }}
        </p>
      </Widget>

      <ChallengeSubmitModal
          v-if="showSubmit"
          :challenge="challenge.id_string"
          @close="showSubmit = false"
          @submitted="refreshEntries()"
      />
    </template>

    <template v-else>
      <div class="screen-head">
        <div class="screen-head-text">
          <h1 class="screen-title">{{ $t('p_challenges_id_string.challengeNotFound') }}</h1>
          <p class="screen-desc">
            {{ $t('p_challenges_id_string.itMayHaveBeenRemoved') }} <NuxtLinkLocale to="/challenges" class="section-link">{{ $t('p_challenges_id_string.seeAllChallenges') }}</NuxtLinkLocale>
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
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
</style>
