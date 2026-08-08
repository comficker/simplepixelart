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
  balance?: number
  daily_claimed?: boolean
  missions?: Mission[]
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
  if (!auth.isLogged) return
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

onMounted(load)
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
        <!-- Guests: the economy starts at sign-in -->
        <div v-if="!auth.isLogged" class="msn-empty">
          <span class="icon icon-coin empty-icon"/>
          <h2 class="msn-empty-title">Sign in to earn credits</h2>
          <p class="text-xs">Daily bonus and missions reward you for creating and sharing pixel art.</p>
          <nuxt-link to="/auth" class="btn primary">Sign in</nuxt-link>
        </div>

        <div v-else-if="loading && !sum" class="msn-list" aria-busy="true">
          <div v-for="i in 4" :key="i" class="skeleton msn-skel"/>
        </div>

        <template v-else-if="sum">
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

          <p class="msn-hint text-xs text-muted">
            Credits pay for upcoming AI tools. Daily missions reset at midnight UTC.
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
