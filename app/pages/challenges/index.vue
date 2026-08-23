<script setup lang="ts">
interface Entry {
  id: number
  id_string: string
  name: string
  username: string | null
  votes: number
}

interface ChallengeItem {
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

const auth = useAuthStore()
const config = useRuntimeConfig()

const {data, refresh} = await useAuthFetch<{ current: ChallengeItem | null; past: ChallengeItem[] }>(
    '/coloring/challenges/', {key: 'challenges-list'},
)

const current = computed(() => data.value?.current || null)
const past = computed(() => data.value?.past || [])
const showSubmit = ref(false)

function daysLeft(c: ChallengeItem): number {
  const end = new Date(`${c.ends}T23:59:59`)
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
}

function thumb(e: Entry): string {
  return `${config.public.api}/coloring/files/art-original/${e.id_string}.png`
}

function fmtRange(c: ChallengeItem): string {
  const f = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
  return `${f(c.starts)} – ${f(c.ends)}`
}

useCustomSeoMeta({
  title: 'Weekly Pixel Art Challenges — Draw, Submit, Get Voted',
  description: 'A new pixel art theme every week. Draw your take in the free editor, submit it, and the community votes the winners. Browse past challenges and winning sprites.',
  canonical: 'https://simplepixelart.com/challenges',
})
</script>

<template>
  <div class="page">
    <section class="page-hero">
      <h1 class="page-title">Weekly challenges</h1>
      <p class="text-muted">One theme a week. Draw it your way, submit, and the community votes the winners.</p>
    </section>

    <section v-if="current" class="chal-current">
      <div class="chal-card">
        <div class="chal-head">
          <span class="chal-live">This week</span>
          <span class="chal-dates">{{ fmtRange(current) }} · {{ daysLeft(current) }} {{ daysLeft(current) === 1 ? 'day' : 'days' }} left</span>
        </div>
        <h2 class="chal-name">{{ current.name }}</h2>
        <p v-if="current.desc" class="chal-desc">{{ current.desc }}</p>
        <div class="chal-actions">
          <nuxt-link to="/editor?new=true" class="btn primary">
            <span class="icon icon-pencil"/><span>Draw your entry</span>
          </nuxt-link>
          <button v-if="auth.isLogged" class="btn" @click="showSubmit = true">
            <span class="icon icon-flag"/><span>Submit an art</span>
          </button>
          <button v-else class="btn" @click="auth.authOAUTH()">
            <span class="icon icon-flag"/><span>Log in to submit</span>
          </button>
          <nuxt-link :to="`/challenges/${current.id_string}`" class="section-link chal-view">
            {{ current.entries_count }} {{ current.entries_count === 1 ? 'entry' : 'entries' }} →
          </nuxt-link>
        </div>
        <div v-if="current.top?.length" class="chal-thumbs">
          <nuxt-link v-for="e in current.top" :key="e.id" :to="`/art/${e.id_string}`" class="chal-thumb" :title="e.name">
            <img :src="thumb(e)" :alt="e.name" loading="lazy" decoding="async">
          </nuxt-link>
        </div>
      </div>
    </section>

    <section v-if="past.length" class="chal-past">
      <h2 class="section-title">Past challenges</h2>
      <div class="chal-grid">
        <nuxt-link
            v-for="c in past"
            :key="c.id_string"
            :to="`/challenges/${c.id_string}`"
            class="chal-past-card"
        >
          <div class="chal-past-thumbs">
            <template v-if="c.winners?.length">
              <img
                  v-for="e in c.winners.slice(0, 3)"
                  :key="e.id"
                  :src="thumb(e)"
                  :alt="e.name"
                  loading="lazy"
                  decoding="async"
              >
            </template>
            <span v-else class="chal-past-empty"><span class="icon icon-image"/></span>
          </div>
          <div class="chal-past-meta">
            <div class="chal-past-name">{{ c.name }}</div>
            <div class="chal-past-sub">{{ fmtRange(c) }} · {{ c.entries_count }} {{ c.entries_count === 1 ? 'entry' : 'entries' }}</div>
          </div>
        </nuxt-link>
      </div>
    </section>

    <ChallengeSubmitModal
        v-if="showSubmit && current"
        :challenge="current.id_string"
        @close="showSubmit = false"
        @submitted="refresh()"
    />
  </div>
</template>

<style scoped>
.chal-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.chal-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.chal-live {
  display: inline-flex;
  padding: 2px 8px;
  font-size: var(--text-2xs);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary-foreground);
  background: var(--primary);
  border-radius: 999px;
}

.chal-dates {
  font-size: var(--text-xs);
  color: var(--muted);
}

.chal-name {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.1;
}

.chal-desc {
  color: var(--muted);
  max-width: 60ch;
}

.chal-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.chal-view {
  margin-left: auto;
}

.chal-thumbs {
  display: flex;
  gap: var(--space-2);
}

.chal-thumb {
  width: 72px;
  height: 72px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  image-rendering: pixelated;
}

.chal-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.chal-past {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.chal-grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 640px) {
  .chal-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .chal-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.chal-past-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: box-shadow var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .chal-past-card:hover {
    box-shadow: var(--shadow-hover);
  }
}

.chal-past-thumbs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  aspect-ratio: 3 / 1;
  background: var(--surface-2);
  image-rendering: pixelated;
}

.chal-past-thumbs img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.chal-past-empty {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in oklab, var(--muted) 45%, transparent);
}

.chal-past-meta {
  padding: 0.375rem 0.5rem;
  border-top: 1px solid var(--border);
}

.chal-past-name {
  font-weight: 700;
  font-size: var(--text-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chal-past-sub {
  font-size: var(--text-2xs);
  color: var(--muted);
}
</style>
