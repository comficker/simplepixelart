<script setup lang="ts">
import {toast} from 'vue-sonner'

// Header wallet: credit balance + daily grant + missions, backed by
// /coloring/economy/. Renders nothing for guests — the economy is a
// signed-in feature.
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
  token: string
  daily_grant: number
  actions: Record<string, number>
  balance?: number
  daily_claimed?: boolean
  missions?: Mission[]
}

const sum = ref<Summary | null>(null)
const claiming = ref('')

async function load() {
  if (!auth.isLogged) return
  try {
    sum.value = await useNativeFetch<Summary>('/coloring/economy/')
  } catch { /* header widget — fail quiet, chip just hides */ }
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
  <ui-dropdown-menu v-if="auth.isLogged && sum" class="wallet" label="Credits wallet" @click="load">
    <button type="button" class="wallet-chip" title="Credits — daily bonus & missions">
      <span class="icon icon-coin"/>
      <span class="wallet-n">{{ sum.balance ?? 0 }}</span>
    </button>
    <template #menu>
      <div class="file-menu wallet-panel">
        <div class="wallet-balance">
          <span class="icon icon-coin"/>
          <span class="wallet-balance-n">{{ sum.balance ?? 0 }}</span>
          <span class="wallet-balance-label">credits</span>
        </div>
        <div class="file-menu-sep"/>
        <button
            class="file-menu-item wallet-row"
            :disabled="sum.daily_claimed || claiming === 'daily'"
            @click="claimDaily"
        >
          <span class="wallet-row-title">Daily bonus</span>
          <span class="wallet-row-side" :class="{claimed: sum.daily_claimed}">
            <template v-if="sum.daily_claimed"><span class="icon icon-check"/></template>
            <template v-else>+{{ sum.daily_grant }}</template>
          </span>
        </button>
        <template v-if="sum.missions?.length">
          <div class="file-menu-sep"/>
          <div class="file-menu-item file-menu-heading">Missions</div>
          <button
              v-for="m in sum.missions"
              :key="m.code"
              class="file-menu-item wallet-row"
              :disabled="m.claimed || !m.done || claiming === m.code"
              :title="m.claimed ? 'Claimed' : m.done ? 'Claim reward' : 'Not completed yet'"
              @click="claimMission(m)"
          >
            <span class="wallet-row-title" :class="{muted: !m.done && !m.claimed}">{{ m.title }}</span>
            <span class="wallet-row-side" :class="{claimed: m.claimed, ready: m.done && !m.claimed}">
              <template v-if="m.claimed"><span class="icon icon-check"/></template>
              <template v-else>+{{ m.reward }}</template>
            </span>
          </button>
        </template>
      </div>
    </template>
  </ui-dropdown-menu>
</template>

<style scoped>
.wallet-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 7px 10px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease;
}

.wallet-chip:hover {
  color: var(--foreground);
  background: color-mix(in oklab, var(--surface) 60%, transparent);
}

.wallet-chip .icon {
  font-size: 0.95em;
  color: var(--primary);
}

.wallet-panel {
  min-width: 240px;
}

.wallet-balance {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}

.wallet-balance .icon {
  color: var(--primary);
  align-self: center;
}

.wallet-balance-n {
  font-size: var(--text-lg);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.wallet-balance-label {
  font-size: var(--text-xs);
  color: var(--muted);
}

.wallet-row {
  justify-content: space-between;
  gap: var(--space-3);
}

.wallet-row:disabled {
  cursor: default;
}

.wallet-row-title.muted {
  color: var(--muted);
}

.wallet-row-side {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--primary);
}

.wallet-row-side.claimed {
  color: var(--muted);
}

.wallet-row-side .icon {
  width: 13px;
  height: 13px;
}
</style>
