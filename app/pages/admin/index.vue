<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Admin - Simple Pixel Art',
  description: 'Staff dashboard.',
  canonical: 'https://simplepixelart.com/admin',
  robots: 'noindex, nofollow',
})

interface DayRow { date: string; users: number; arts: number; tokens_granted: number; tokens_spent: number }
interface MonthRow { month: string; users: number; arts: number; tokens_granted: number; tokens_spent: number }
interface Stats {
  totals: Record<string, number>
  daily: DayRow[]
  monthly: MonthRow[]
}
interface Mission {
  code: string; title: string; period: string; reward: number
  check: string; enabled?: boolean
}

const isStaff = computed(() => !!(auth.logged as any)?.is_staff)
const stats = ref<Stats | null>(null)
const config = ref<any>(null)
const checks = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)

async function load() {
  if (!isStaff.value) return
  loading.value = true
  try {
    const [s, e] = await Promise.all([
      useNativeFetch<Stats>('/coloring/admin/stats/'),
      useNativeFetch<{ config: any; checks: string[] }>('/coloring/admin/economy/'),
    ])
    stats.value = s
    config.value = e.config
    checks.value = e.checks
    if (!Array.isArray(config.value.missions)) config.value.missions = []
    config.value.missions.forEach((m: Mission) => { m.enabled = m.enabled !== false })
    if (!config.value.referral) config.value.referral = {signup_reward: 1, purchase_rate: 0.1}
    if (!config.value.ai) config.value.ai = {enabled: true}
    if (config.value.ai.image_enabled === undefined) config.value.ai.image_enabled = false
    if (!config.value.actions) config.value.actions = {}
  } catch {
    toast.error('Could not load dashboard')
  } finally {
    loading.value = false
  }
}

const missions = computed<Mission[]>(() => config.value?.missions || [])

function chargedCost(spec: { usd?: number; tokens?: number }): number {
  if (spec.tokens != null && spec.tokens !== ('' as any)) return Math.max(1, Math.floor(spec.tokens))
  const base = Number(config.value?.base_usd_per_token) || 0.0005
  const margin = Number(config.value?.margin) || 1
  return Math.max(1, Math.ceil((spec.usd || 0) * margin / base))
}

function addMission() {
  config.value.missions.push({
    code: '', title: '', period: 'daily', reward: 5,
    check: checks.value[0] || '', enabled: true,
  })
}

function removeMission(i: number) {
  config.value.missions.splice(i, 1)
}

async function saveConfig() {
  if (saving.value) return
  const bad = missions.value.find(m => !m.code || !m.check)
  if (bad) { toast.error('Every mission needs a code and a check'); return }
  saving.value = true
  try {
    const res = await useNativeFetch<{ config: any }>('/coloring/admin/economy/', {
      method: 'PUT', body: {config: config.value},
    })
    config.value = res.config
    toast.success('Config saved — live immediately')
  } catch {
    toast.error('Could not save config')
  } finally {
    saving.value = false
  }
}

function bars(rows: DayRow[], key: keyof DayRow) {
  const vals = rows.map(r => Number(r[key]) || 0)
  const max = Math.max(1, ...vals)
  return rows.map((r, i) => ({
    h: Math.round((vals[i] / max) * 100),
    title: `${r.date} · ${vals[i]}`,
  }))
}

const CHARTS: { key: keyof DayRow; label: string }[] = [
  {key: 'users', label: 'New users'},
  {key: 'arts', label: 'New arts'},
  {key: 'tokens_granted', label: 'Tokens granted'},
  {key: 'tokens_spent', label: 'Tokens spent'},
]

onMounted(load)
watch(isStaff, (v) => { if (v) load() })
</script>

<template>
  <div class="page">
    <section class="readme adm-panel">
      <div class="readme-head adm-head">
        <h1 class="adm-title"><span class="icon icon-adjust"/><span>Admin</span></h1>
        <div class="adm-head-actions">
          <NuxtLink v-if="isStaff" to="/admin/users" class="btn">
            <span class="icon icon-user"/><span>Users</span>
          </NuxtLink>
          <button v-if="isStaff" class="btn" :disabled="loading" @click="load">
            <span class="icon icon-refresh"/><span>Refresh</span>
          </button>
        </div>
      </div>

      <div class="adm-body">
        <div v-if="!isStaff" class="adm-empty">
          <p class="text-xs text-muted">Staff only.</p>
        </div>

        <template v-else-if="stats">

          <div class="adm-cards">
            <div class="adm-card">
              <div class="adm-card-n">{{ stats.totals.users }}</div>
              <div class="adm-card-l">Users</div>
            </div>
            <div class="adm-card">
              <div class="adm-card-n">{{ stats.totals.arts_public }}<span class="adm-card-sub">/ {{ stats.totals.arts }}</span></div>
              <div class="adm-card-l">Public / all arts</div>
            </div>
            <div class="adm-card">
              <div class="adm-card-n">{{ stats.totals.tokens_circulating }}</div>
              <div class="adm-card-l">Tokens circulating</div>
            </div>
            <div class="adm-card">
              <div class="adm-card-n">{{ stats.totals.tokens_minted }}<span class="adm-card-sub">− {{ stats.totals.tokens_spent }}</span></div>
              <div class="adm-card-l">Minted − spent</div>
            </div>
            <div class="adm-card">
              <div class="adm-card-n">{{ stats.totals.tilesets }}<span class="adm-card-sub">+ {{ stats.totals.worlds }}</span></div>
              <div class="adm-card-l">Tilesets + worlds</div>
            </div>
          </div>

          <h2 class="adm-section-title">Last 30 days</h2>
          <div class="adm-charts">
            <div v-for="c in CHARTS" :key="c.key" class="adm-chart">
              <div class="adm-chart-label">{{ c.label }}</div>
              <div class="adm-chart-bars">
                <span
                    v-for="(b, i) in bars(stats.daily, c.key)"
                    :key="i"
                    class="adm-bar"
                    :style="{height: `${Math.max(2, b.h)}%`}"
                    :title="b.title"
                />
              </div>
            </div>
          </div>

          <h2 class="adm-section-title">Monthly</h2>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Month</th><th>Users</th><th>Arts</th><th>Granted</th><th>Spent</th></tr>
              </thead>
              <tbody>
              <tr v-for="m in [...stats.monthly].reverse()" :key="m.month">
                <td>{{ m.month }}</td>
                <td>{{ m.users }}</td>
                <td>{{ m.arts }}</td>
                <td>{{ m.tokens_granted }}</td>
                <td>{{ m.tokens_spent }}</td>
              </tr>
              </tbody>
            </table>
          </div>

          <template v-if="config">
            <h2 class="adm-section-title">Economy</h2>
            <div class="adm-knobs">
              <label class="adm-knob">
                <span>Daily grant</span>
                <input v-model.number="config.daily_grant" type="number" min="0" class="adm-input">
              </label>
              <label class="adm-knob">
                <span>Referral signup</span>
                <input v-model.number="config.referral.signup_reward" type="number" min="0" class="adm-input">
              </label>
              <label class="adm-knob">
                <span>Purchase rate</span>
                <input v-model.number="config.referral.purchase_rate" type="number" min="0" max="1" step="0.01" class="adm-input">
              </label>
              <label class="adm-knob">
                <span>USD / token</span>
                <input v-model.number="config.base_usd_per_token" type="number" min="0" step="0.0001" class="adm-input">
              </label>
              <label class="adm-knob">
                <span>Margin ×</span>
                <input v-model.number="config.margin" type="number" min="1" step="0.5" class="adm-input">
              </label>

              <label class="adm-knob adm-knob-check" title="Kill switch — hides every AI button even with an API key set">
                <span>AI enabled</span>
                <input v-model="config.ai.enabled" type="checkbox">
              </label>
              <label class="adm-knob adm-knob-check" title="Image generation needs a BILLING-enabled Gemini key (free tier has zero image quota) — turn on only after billing is set up">
                <span>AI image gen</span>
                <input v-model="config.ai.image_enabled" type="checkbox">
              </label>
            </div>

            <h2 class="adm-section-title">Action pricing</h2>
            <div class="adm-table-wrap">
              <table class="adm-table">
                <thead>
                <tr><th>Action</th><th>API cost (USD)</th><th>Tokens override</th><th>Charged</th></tr>
                </thead>
                <tbody>
                <tr v-for="(spec, code) in config.actions" :key="code">
                  <td>{{ code }}</td>
                  <td><input v-model.number="spec.usd" type="number" min="0" step="0.001" class="adm-input adm-input-n"></td>
                  <td>

                    <input
                        :value="spec.tokens"
                        type="number" min="1" placeholder="auto"
                        class="adm-input adm-input-n"
                        @input="e => { const v = (e.target as HTMLInputElement).value; v === '' ? delete spec.tokens : spec.tokens = Number(v) }"
                    >
                  </td>
                  <td class="adm-charged">🪙{{ chargedCost(spec) }}</td>
                </tr>
                </tbody>
              </table>
            </div>

            <h2 class="adm-section-title">Missions</h2>
            <div class="adm-table-wrap">
              <table class="adm-table adm-missions">
                <thead>
                <tr><th>On</th><th>Code</th><th>Title</th><th>Period</th><th>Check</th><th>Reward</th><th/></tr>
                </thead>
                <tbody>
                <tr v-for="(m, i) in missions" :key="i">
                  <td><input v-model="m.enabled" type="checkbox" :true-value="true" :false-value="false"></td>
                  <td><input v-model="m.code" class="adm-input" placeholder="code"></td>
                  <td><input v-model="m.title" class="adm-input" placeholder="Shown to users"></td>
                  <td>
                    <select v-model="m.period" class="adm-input">
                      <option value="daily">daily</option>
                      <option value="once">once</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="m.check" class="adm-input">
                      <option v-for="c in checks" :key="c" :value="c">{{ c }}</option>
                    </select>
                  </td>
                  <td><input v-model.number="m.reward" type="number" min="0" class="adm-input adm-input-n"></td>
                  <td>
                    <button class="btn adm-ic" title="Remove mission" @click="removeMission(i)">
                      <span class="icon icon-trash"/>
                    </button>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
            <div class="adm-actions">
              <button class="btn" @click="addMission"><span class="icon icon-plus"/><span>Add mission</span></button>
              <button class="btn primary" :disabled="saving" @click="saveConfig">
                {{ saving ? 'Saving…' : 'Save config' }}
              </button>
            </div>
          </template>
        </template>

        <div v-else-if="loading" class="adm-empty" aria-busy="true">
          <div v-for="i in 3" :key="i" class="skeleton adm-skel"/>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.adm-panel {
  max-width: 900px;
  margin-inline: auto;
}

.adm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}

.adm-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
}

.adm-title .icon { color: var(--primary); }

.adm-head-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.adm-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.adm-empty { padding: 2rem 0; text-align: center; }
.adm-skel { height: 72px; border-radius: var(--radius-sm); margin-bottom: var(--space-2); }

.adm-section-title {
  font-size: var(--text-sm);
  font-weight: 700;
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
}

.adm-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
}

.adm-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}

.adm-card-n {
  font-size: var(--text-lg);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.adm-card-sub {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  margin-left: 4px;
}

.adm-card-l {
  font-size: var(--text-2xs);
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-top: 2px;
}

.adm-charts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.adm-chart {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
}

.adm-chart-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  margin-bottom: var(--space-2);
}

.adm-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 72px;
}

.adm-bar {
  flex: 1;
  min-width: 0;
  background: var(--primary);
  opacity: 0.75;
  border-radius: 1px;
}

.adm-table-wrap { overflow-x: auto; }

.adm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.adm-table th {
  text-align: left;
  font-weight: 600;
  color: var(--muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.adm-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
}

.adm-knobs {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
}

.adm-knob {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.adm-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--background);
  color: var(--foreground);
  font-size: var(--text-xs);
}

.adm-input-n { max-width: 72px; }

.adm-knob-check input {
  width: 16px;
  height: 16px;
  margin-top: 8px;
}

.adm-missions td { padding: 4px 4px; }

.adm-charged { font-weight: 700; white-space: nowrap; }

.adm-ic { padding: 6px; }

.adm-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .adm-cards, .adm-knobs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .adm-charts { grid-template-columns: 1fr; }
}
</style>
