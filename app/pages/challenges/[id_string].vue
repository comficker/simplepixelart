<script setup lang="ts">
import type {APIResponse, SharedPage} from '~/types'

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
const config = useRuntimeConfig()
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
  if (!challenge.value) return 0
  const end = new Date(`${challenge.value.ends}T23:59:59`)
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
}

function fmtRange(): string {
  if (!challenge.value) return ''
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
  return `${f(challenge.value.starts)} – ${f(challenge.value.ends)}`
}

function thumb(e: Entry): string {
  return `${config.public.api}/coloring/files/art-original/${e.id_string}.png`
}

const medals = ['🥇', '🥈', '🥉']

useCustomSeoMeta({
  title: () => challenge.value
      ? `${challenge.value.name} — Weekly Pixel Art Challenge`
      : 'Pixel Art Challenge',
  description: () => challenge.value
      ? `“${challenge.value.name}” pixel art challenge (${challenge.value.starts} to ${challenge.value.ends}). ${challenge.value.desc || ''} Draw your take and submit it for community votes.`
      : 'Weekly pixel art challenge on SimplePixelArt.',
  canonical: () => `https://simplepixelart.com/challenges/${slug.value}`,
  robots: () => (challenge.value ? 'index, follow' : 'noindex, follow'),
})
</script>

<template>
  <div class="page">
    <template v-if="challenge">
      <section class="page-hero">
        <p class="chal-bc">
          <nuxt-link to="/challenges" class="section-link">← All challenges</nuxt-link>
        </p>
        <h1 class="page-title">{{ challenge.name }}</h1>
        <p v-if="challenge.desc" class="text-muted">{{ challenge.desc }}</p>
        <p class="chal-meta text-muted">
          <template v-if="challenge.state === 'active'">
            <strong>Live now</strong> · {{ fmtRange() }} · {{ daysLeft() }} {{ daysLeft() === 1 ? 'day' : 'days' }} left
            · {{ challenge.entries_count }} {{ challenge.entries_count === 1 ? 'entry' : 'entries' }}
          </template>
          <template v-else-if="challenge.state === 'ended'">
            Ended · {{ fmtRange() }} · {{ challenge.entries_count }} {{ challenge.entries_count === 1 ? 'entry' : 'entries' }}
          </template>
          <template v-else>Starts {{ fmtRange() }}</template>
        </p>
        <div v-if="challenge.state === 'active'" class="chal-actions">
          <nuxt-link to="/editor?new=true" class="btn primary">
            <span class="icon icon-pencil"/><span>Draw your entry</span>
          </nuxt-link>
          <button v-if="auth.isLogged" class="btn" @click="showSubmit = true">
            <span class="icon icon-flag"/><span>Submit an art</span>
          </button>
          <button v-else class="btn" @click="auth.authOAUTH()">
            <span class="icon icon-flag"/><span>Log in to submit</span>
          </button>
        </div>
      </section>

      <section v-if="challenge.state === 'ended' && winners.length" class="chal-winners">
        <h2 class="section-title">Winners</h2>
        <div class="chal-winner-row">
          <nuxt-link
              v-for="(e, i) in winners"
              :key="e.id"
              :to="`/art/${e.id_string}`"
              class="chal-winner"
          >
            <span class="chal-medal">{{ medals[i] || '·' }}</span>
            <img :src="thumb(e)" :alt="e.name" loading="lazy" decoding="async">
            <span class="chal-winner-name">{{ e.name }}</span>
            <span class="chal-winner-sub">@{{ e.username }} · {{ e.votes }} {{ e.votes === 1 ? 'vote' : 'votes' }}</span>
          </nuxt-link>
        </div>
      </section>

      <section class="chal-entries">
        <h2 class="section-title">Entries</h2>
        <div v-if="entries.length" class="grid-arts">
          <ItemCard v-for="p in entries" :key="p.id" :value="p"/>
        </div>
        <p v-else class="text-muted text-xs">
          No public entries yet{{ challenge.state === 'active' ? ' — be the first!' : '.' }}
        </p>
      </section>

      <ChallengeSubmitModal
          v-if="showSubmit"
          :challenge="challenge.id_string"
          @close="showSubmit = false"
          @submitted="refreshEntries()"
      />
    </template>

    <template v-else>
      <section class="page-hero">
        <h1 class="page-title">Challenge not found</h1>
        <p class="text-muted">
          It may have been removed. <nuxt-link to="/challenges" class="section-link">See all challenges →</nuxt-link>
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.chal-bc {
  font-size: var(--text-xs);
}

.chal-meta {
  font-size: var(--text-xs);
}

.chal-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.chal-winners,
.chal-entries {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
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

.grid-arts {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 640px) {
  .grid-arts {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid-arts {
    grid-template-columns: repeat(6, 1fr);
  }
}
</style>
