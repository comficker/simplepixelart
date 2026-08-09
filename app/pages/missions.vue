<script setup lang="ts">
import {toast} from 'vue-sonner'

// Missions screen — definitions come from backend config (/coloring/economy/),
// so new missions appear here without a frontend deploy.
const auth = useAuthStore()

interface Mission {
  code: string
  title: string
  period: string
  reward: number
  done: boolean
  claimed: boolean
}

interface Summary {
  daily_grant: number
  ai_enabled?: boolean
  balance?: number
  daily_claimed?: boolean
  missions?: Mission[]
  referral?: {
    signup_reward: number
    purchase_rate: number
    invited?: number
    earned?: number
  }
}

useCustomSeoMeta({
  title: 'Missions - Simple Pixel Art',
  description: 'Earn credits by creating and sharing pixel art.',
  canonical: 'https://simplepixelart.com/missions',
  robots: 'noindex, follow',
})

const sum = ref<Summary | null>(null)
const loading = ref(false)
const claiming = ref('')

async function load() {
  // Public endpoint — guests get pricing/ai_enabled (drives the Soon ribbons),
  // signed-in users additionally get balance/missions/referral.
  loading.value = true
  try {
    sum.value = await useNativeFetch<Summary>('/coloring/economy/')
  } catch {
    toast.error('Could not load missions')
  } finally {
    loading.value = false
  }
}

async function claimDaily() {
  if (claiming.value || sum.value?.daily_claimed) return
  claiming.value = 'daily'
  try {
    const res = await useNativeFetch<{ granted: number; balance: number }>(
        '/coloring/economy/daily/', {method: 'POST'})
    if (sum.value) {
      sum.value.balance = res.balance
      sum.value.daily_claimed = true
    }
    toast.success(`+${res.granted} credits`)
  } catch {
    toast.error('Already claimed today')
    if (sum.value) sum.value.daily_claimed = true
  } finally {
    claiming.value = ''
  }
}

async function claimMission(m: Mission) {
  if (claiming.value || !m.done || m.claimed) return
  claiming.value = m.code
  try {
    const res = await useNativeFetch<{ granted: number; balance: number }>(
        '/coloring/economy/missions/claim/', {method: 'POST', body: {code: m.code}})
    if (sum.value) sum.value.balance = res.balance
    m.claimed = true
    toast.success(`+${res.granted} credits`)
  } catch {
    toast.error('Could not claim — refresh and try again')
  } finally {
    claiming.value = ''
  }
}

// Referral invite link — carries the username (readable, shareable); the
// backend also accepts the numeric id from older links.
const inviteLink = computed(() => {
  if (!auth.logged?.username || import.meta.server) return ''
  return `${location.origin}/?ref=${encodeURIComponent(auth.logged.username)}`
})

async function copyInvite() {
  if (!inviteLink.value) return
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    toast.success('Invite link copied')
  } catch {
    toast.error('Could not copy — select the link manually')
  }
}

onMounted(async () => {
  // A pending ?ref may still be waiting if sign-in happened elsewhere.
  await attachPendingReferral()
  load()
})
watch(() => auth.isLogged, (v) => {
  if (v) load()
  else sum.value = null
})
</script>

<template>
  <div class="page">
    <section class="readme msn-panel">
      <div class="readme-head msn-head">
        <h1 class="msn-title">
          <span class="icon icon-flag"/>
          <span>Missions</span>
        </h1>
        <div v-if="sum" class="msn-balance">
          <span class="icon icon-coin"/>
          <span>{{ sum.balance ?? 0 }}</span>
        </div>
      </div>

      <div class="msn-body">
        <p class="msn-lead">
          Credits are SimplePixelArt's token — earn them free every day,
          spend them on AI tools that help you make art and content,
          or gift them to artists you love.
        </p>

        <!-- What credits power — shown to everyone, guests included -->
        <div class="msn-uses">
          <div class="msn-use">
            <span class="msn-soon">Soon</span>
            <span class="icon icon-auto-fix"/>
            <div class="msn-use-main">
              <div class="msn-use-title">Generate art with AI</div>
              <p class="msn-use-desc text-xs">Turn a prompt into pixel art, straight onto your canvas.</p>
            </div>
          </div>
          <div class="msn-use">
            <span v-if="!sum?.ai_enabled" class="msn-soon">Soon</span>
            <span class="icon icon-pencil"/>
            <div class="msn-use-main">
              <div class="msn-use-title">AI content assistant</div>
              <p class="msn-use-desc text-xs">Writes titles, descriptions and tags for your art when you publish.</p>
            </div>
          </div>
          <div class="msn-use">
            <span class="msn-soon">Soon</span>
            <span class="icon icon-gift"/>
            <div class="msn-use-main">
              <div class="msn-use-title">Tip artists</div>
              <p class="msn-use-desc text-xs">Gift credits to creators to show love for their art.</p>
            </div>
          </div>
        </div>

        <!-- Guests: the economy starts at sign-in -->
        <div v-if="!auth.isLogged" class="msn-empty">
          <span class="icon icon-coin empty-icon"/>
          <h2 class="msn-empty-title">Sign in to earn credits</h2>
          <p class="text-xs">Daily bonus, missions and invites reward you for creating and sharing pixel art.</p>
          <nuxt-link to="/auth" class="btn primary">Sign in</nuxt-link>
        </div>

        <div v-else-if="loading && !sum" class="msn-list" aria-busy="true">
          <div v-for="i in 4" :key="i" class="skeleton msn-skel"/>
        </div>

        <template v-else-if="sum">
          <h2 class="msn-section-title">Earn credits</h2>
          <div class="msn-list">
            <!-- Daily bonus is just the first "mission" of the day -->
            <div class="msn-row">
              <div class="msn-row-main">
                <div class="msn-row-title">Daily bonus</div>
                <div class="msn-row-sub text-xs">Come back every day for free credits</div>
              </div>
              <span class="msn-chip">Daily</span>
              <span class="msn-reward"><span class="icon icon-coin"/>{{ sum.daily_grant }}</span>
              <button
                  class="btn msn-claim"
                  :class="{primary: !sum.daily_claimed}"
                  :disabled="sum.daily_claimed || claiming === 'daily'"
                  @click="claimDaily"
              >
                <template v-if="sum.daily_claimed"><span class="icon icon-check"/><span>Claimed</span></template>
                <template v-else>Claim</template>
              </button>
            </div>

            <div v-for="m in sum.missions" :key="m.code" class="msn-row">
              <div class="msn-row-main">
                <div class="msn-row-title">{{ m.title }}</div>
              </div>
              <span class="msn-chip">{{ m.period === 'once' ? 'Once' : 'Daily' }}</span>
              <span class="msn-reward"><span class="icon icon-coin"/>{{ m.reward }}</span>
              <button
                  class="btn msn-claim"
                  :class="{primary: m.done && !m.claimed}"
                  :disabled="m.claimed || !m.done || claiming === m.code"
                  :title="m.claimed ? 'Claimed' : m.done ? 'Claim reward' : 'Not completed yet'"
                  @click="claimMission(m)"
              >
                <template v-if="m.claimed"><span class="icon icon-check"/><span>Claimed</span></template>
                <template v-else>Claim</template>
              </button>
            </div>
          </div>

          <!-- Referral: the only unbounded earner — the loudest card on the page -->
          <div v-if="sum.referral?.signup_reward" class="msn-invite">
            <div class="msn-invite-head">
              <span class="icon icon-gift msn-invite-ic"/>
              <div class="msn-row-main">
                <div class="msn-invite-title">Invite friends, earn forever</div>
                <div class="msn-invite-sub">
                  <strong>+{{ sum.referral.signup_reward }}</strong> per friend who joins<template v-if="sum.referral.purchase_rate">
                  · <strong>{{ Math.round(sum.referral.purchase_rate * 100) }}%</strong> of every credit pack they buy</template>
                </div>
              </div>
            </div>
            <div class="msn-invite-bar">
              <input class="msn-invite-link" :value="inviteLink" readonly @focus="($event.target as HTMLInputElement).select()">
              <button class="btn primary" @click="copyInvite">
                <span class="icon icon-link"/><span>Copy link</span>
              </button>
            </div>
            <p v-if="sum.referral.invited" class="msn-invite-stats text-xs">
              <span class="icon icon-check"/>
              {{ sum.referral.invited }} friend{{ sum.referral.invited === 1 ? '' : 's' }} joined
              · {{ sum.referral.earned }} credits earned
            </p>
          </div>

          <p class="msn-hint text-xs text-muted">
            Daily missions reset at midnight UTC.
          </p>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.msn-panel {
  max-width: 640px;
  margin-inline: auto;
}

.msn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}

.msn-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  line-height: var(--text-base-lh);
  font-weight: 700;
}

.msn-balance {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.msn-balance .icon,
.msn-title .icon {
  color: var(--primary);
}

.msn-body {
  padding: var(--space-4);
}

.msn-lead {
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--muted);
  margin-bottom: var(--space-4);
}

/* What credits power — one card per use case */
.msn-uses {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-5, var(--space-4));
}

.msn-use {
  position: relative;
  overflow: hidden;   /* clips the corner ribbon */
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.msn-use > .icon {
  font-size: 22px;
  color: var(--primary);
}

.msn-use-title {
  font-size: var(--text-sm);
  font-weight: 700;
}

/* Diagonal "Soon" ribbon across the card's top-right corner. */
.msn-soon {
  position: absolute;
  top: 8px;
  right: -24px;
  width: 84px;
  transform: rotate(45deg);
  text-align: center;
  padding: 1px 0;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary-foreground);
  background: var(--primary);
  pointer-events: none;
}

.msn-use-desc {
  color: var(--muted);
}

.msn-section-title {
  font-size: var(--text-sm);
  font-weight: 700;
  margin-bottom: var(--space-1);
}

@media (max-width: 640px) {
  .msn-uses {
    grid-template-columns: 1fr;
  }
}

.msn-list {
  display: flex;
  flex-direction: column;
}

.msn-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
}

.msn-row + .msn-row {
  border-top: 1px solid var(--border);
}

.msn-row-main {
  flex: 1;
  min-width: 0;
}

.msn-row-title {
  font-weight: 600;
}

.msn-row-sub {
  color: var(--muted);
}

.msn-chip {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  padding: 2px 8px;
  flex-shrink: 0;
}

.msn-reward {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--primary);
  flex-shrink: 0;
  min-width: 52px;
  justify-content: flex-end;
}

.msn-claim {
  min-width: 96px;
  justify-content: center;
  gap: var(--space-1);
  flex-shrink: 0;
}

.msn-skel {
  height: 56px;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
}

.msn-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: 3rem 1rem;
}

.msn-empty .empty-icon {
  font-size: 48px;
  color: var(--primary);
}

.msn-empty-title {
  font-size: var(--text-base);
  font-weight: 700;
}

.msn-hint {
  margin-top: var(--space-4);
}

/* Invite friends — the one accent card on the page: primary-tinted face so it
   reads as the headline earner, not another list row. */
.msn-invite {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding: var(--space-4);
  border: 1px solid color-mix(in oklab, var(--primary) 35%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--primary) 6%, transparent);
}

.msn-invite-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.msn-invite-ic {
  font-size: 26px;
  color: var(--primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.msn-invite-title {
  font-size: var(--text-base);
  line-height: var(--text-base-lh);
  font-weight: 800;
}

.msn-invite-sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.msn-invite-sub strong {
  color: var(--primary);
  font-weight: 800;
}

.msn-invite-bar {
  display: flex;
  gap: var(--space-2);
}

.msn-invite-bar .btn {
  flex-shrink: 0;
}

.msn-invite-link {
  flex: 1;
  min-width: 0;
  padding: 0 var(--space-3);
  border: 1px solid color-mix(in oklab, var(--primary) 25%, var(--border));
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: var(--text-xs);
}

.msn-invite-stats {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--muted);
}

.msn-invite-stats .icon {
  width: 13px;
  height: 13px;
  color: var(--primary);
}

@media (max-width: 640px) {
  .msn-row {
    flex-wrap: wrap;
  }
  .msn-row-main {
    flex-basis: 100%;
  }
  .msn-reward {
    margin-left: auto;
  }
}
</style>
