<script setup lang="ts">
import {toast} from 'vue-sonner'

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
const dd = ref<{ close: (o?: { restoreFocus?: boolean }) => void } | null>(null)

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

const claimableCount = computed(() =>
    (sum.value?.missions || []).filter(m => m.done && !m.claimed).length
    + (sum.value && !sum.value.daily_claimed ? 1 : 0))

onMounted(load)
watch(() => auth.isLogged, (v) => {
  if (v) load()
  else sum.value = null
})
</script>

<template>
  <ui-dropdown-menu v-if="auth.isLogged && sum" ref="dd" class="wallet" label="Credits wallet" @click="load">
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
        <div class="file-menu-sep"/>
        <nuxt-link class="file-menu-item wallet-row" to="/missions" @click="dd?.close({restoreFocus: false})">
          <span class="wallet-row-title">
            <span class="icon icon-flag"/>
            <span>Missions</span>
          </span>
          <span v-if="claimableCount" class="wallet-badge">{{ claimableCount }}</span>
        </nuxt-link>
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

.wallet-row-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.wallet-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: var(--text-2xs);
  font-weight: 700;
}
</style>
