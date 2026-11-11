<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Admin',
  description: 'Staff dashboard.',
  canonical: 'https://simplepixelart.com/admin',
  robots: 'noindex, nofollow',
})

interface DayRow { date: string; users: number; arts: number; tokens_granted: number; tokens_spent: number }
interface MonthRow { month: string; users: number; arts: number; tokens_granted: number; tokens_spent: number }
interface CreatorWeek { week: string; drew: number; published: number; first_published: number; pieces: number }
interface Stats {
  totals: Record<string, number>
  daily: DayRow[]
  monthly: MonthRow[]
  creators?: { weeks: CreatorWeek[]; creators_total: number }
  generated_at?: string
}
interface Mission {
  code: string; title: string; period: string; reward: number
  check: string; enabled?: boolean
}

const isStaff = computed(() => !!(auth.logged as any)?.is_staff)
const stats = ref<Stats | null>(null)
/* The backend echoes whatever it stored, so a config saved before a knob
   existed comes back without it and the v-model would read through null. */
function normalizeConfig() {
  const c = config.value
  if (!c) return
  if (!c.bots) c.bots = {in_leaderboard: true, auto_boost: true}
  if (c.bots.auto_boost === undefined) c.bots.auto_boost = true
}

const config = ref<any>(null)
const checks = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)

/* Stats are cached for five minutes server-side; the Refresh button asks
   for a fresh count, the first paint takes whatever is cached. */
async function load(fresh = false) {
  if (!isStaff.value) return
  loading.value = true
  try {
    const [s, e] = await Promise.all([
      useNativeFetch<Stats>(`/coloring/admin/stats/${fresh ? '?fresh=1' : ''}`),
      useNativeFetch<{ config: any; checks: string[] }>('/coloring/admin/economy/'),
    ])
    stats.value = s
    config.value = e.config
    loadCoupons()
    checks.value = e.checks
    if (!Array.isArray(config.value.missions)) config.value.missions = []
    config.value.missions.forEach((m: Mission) => { m.enabled = m.enabled !== false })
    if (!config.value.referral) config.value.referral = {signup_reward: 1, purchase_rate: 0.1}
    if (!config.value.ai) config.value.ai = {enabled: true}
    if (config.value.ai.image_enabled === undefined) config.value.ai.image_enabled = false
    if (!config.value.actions) config.value.actions = {}
    normalizeConfig()
  } catch {
    toast.error('Could not load dashboard')
  } finally {
    loading.value = false
  }
}

const missions = computed<Mission[]>(() => config.value?.missions || [])

interface Coupon {
  id: number
  code: string
  amount: number
  max_uses: number
  expires_at: string | null
  note: string
  used: number
  expired: boolean
}

const coupons = ref<Coupon[]>([])
const draft = reactive({code: '', amount: 50, max_uses: 0, expires_at: '', note: ''})
const couponBusy = ref(false)

const COUPON_ERRORS: Record<string, string> = {
  CODE_BLANK: 'A coupon needs a code',
  CODE_INVALID: 'Letters, numbers and . _ - only, 3-40 characters',
  CODE_DUPLICATE: 'That code already exists',
  AMOUNT_INVALID: 'Amount must be between 1 and 100000',
  MAX_USES_INVALID: 'Max uses cannot be negative',
  EXPIRES_AT_INVALID: 'That expiry date is not valid',
}

function couponError(e: any, fallback: string) {
  const code = e?.response?._data?.[0] || e?.data?.[0]
  toast.error(COUPON_ERRORS[code] || fallback)
}

async function loadCoupons() {
  if (!isStaff.value) return
  try {
    const res = await useNativeFetch<{ results: Coupon[] }>('/coloring/admin/coupons/')
    coupons.value = res.results
  } catch {
    toast.error('Could not load coupons')
  }
}

async function addCoupon() {
  if (couponBusy.value) return
  couponBusy.value = true
  try {
    const made = await useNativeFetch<Coupon>('/coloring/admin/coupons/', {
      method: 'POST',
      body: {
        code: draft.code,
        amount: draft.amount,
        max_uses: draft.max_uses,
        // <input type=datetime-local> has no zone; send the browser's.
        expires_at: draft.expires_at ? new Date(draft.expires_at).toISOString() : null,
        note: draft.note,
      },
    })
    coupons.value.unshift(made)
    draft.code = ''
    draft.note = ''
    draft.expires_at = ''
    toast.success(`${made.code} is live`)
  } catch (e: any) {
    couponError(e, 'Could not create the coupon')
  } finally {
    couponBusy.value = false
  }
}

interface Redemption {
  user_id: number
  username: string
  amount: number
  created: string
}

const openCoupon = ref<number | null>(null)
const redemptions = ref<Record<number, {
  count: number; total: number; page: number; results: Redemption[]
}>>({})
const loadingRedemptions = ref<number | null>(null)

async function fetchRedemptions(c: Coupon, page = 1) {
  loadingRedemptions.value = c.id
  try {
    const res = await useNativeFetch<{
      count: number; total: number; page: number; results: Redemption[]
    }>(`/coloring/admin/coupons/${c.id}/redemptions/?page=${page}`)
    const held = redemptions.value[c.id]
    redemptions.value[c.id] = page > 1 && held
        ? {...res, results: [...held.results, ...res.results]}
        : res
  } catch {
    toast.error('Could not load redemptions')
  } finally {
    loadingRedemptions.value = null
  }
}

function toggleRedemptions(c: Coupon) {
  if (openCoupon.value === c.id) { openCoupon.value = null; return }
  openCoupon.value = c.id
  // Re-fetch on open: the count moves while the dashboard is sitting there.
  fetchRedemptions(c)
}

async function retireCoupon(c: Coupon) {
  if (couponBusy.value) return
  if (!confirm(`Retire ${c.code}? Credits already redeemed are kept.`)) return
  couponBusy.value = true
  try {
    await useNativeFetch(`/coloring/admin/coupons/${c.id}/`, {method: 'DELETE'})
    coupons.value = coupons.value.filter(x => x.id !== c.id)
    toast.success(`${c.code} retired`)
  } catch (e: any) {
    couponError(e, 'Could not retire the coupon')
  } finally {
    couponBusy.value = false
  }
}

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
    normalizeConfig()
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

const asOf = computed(() => stats.value?.generated_at
    ? new Date(stats.value.generated_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})
    : '')

const sum = (rows: DayRow[], key: keyof DayRow) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0)

const TOGGLES = [
  {path: ['ai', 'enabled'], label: 'AI enabled', hint: 'Kill switch: hides every AI button even with an API key set.'},
  {path: ['ai', 'image_enabled'], label: 'AI image generation', hint: 'Needs a billing-enabled Gemini key; the free tier has no image quota.'},
  {path: ['bots', 'in_leaderboard'], label: 'Bots in leaderboard', hint: 'Automated accounts show in the creator ranking, still labelled as bots.'},
  {path: ['bots', 'auto_boost'], label: 'Auto bot activity', hint: 'New public pages pick up bot likes and their creators bot followers over a few hours.'},
] as const

const CHARTS: { key: keyof DayRow; label: string }[] = [
  {key: 'users', label: 'New users'},
  {key: 'arts', label: 'New arts'},
  {key: 'tokens_granted', label: 'Tokens granted'},
  {key: 'tokens_spent', label: 'Tokens spent'},
]

onMounted(() => load())
watch(isStaff, (v) => { if (v) load() })
</script>

<template>
  <AdminShell title="Overview" :busy="loading" @refresh="load(true)">
    <template #actions>
      <span v-if="asOf" class="adm-sub" title="Stats are cached for five minutes; Refresh recounts">as of {{ asOf }}</span>
    </template>

    <template v-if="stats">
      <div class="adm-cards">
        <div class="adm-card">
          <div class="adm-card-l">Users</div>
          <div class="adm-card-n">{{ stats.totals.users.toLocaleString() }}</div>
          <div class="adm-sub">+{{ sum(stats.daily, 'users') }} in 30 days</div>
        </div>
        <div class="adm-card">
          <div class="adm-card-l">Public arts</div>
          <div class="adm-card-n">{{ stats.totals.arts_public.toLocaleString() }}</div>
          <div class="adm-sub">of {{ stats.totals.arts.toLocaleString() }} · +{{ sum(stats.daily, 'arts') }} in 30 days</div>
        </div>
        <div class="adm-card">
          <div class="adm-card-l">Tokens circulating</div>
          <div class="adm-card-n">{{ stats.totals.tokens_circulating.toLocaleString() }}</div>
          <div class="adm-sub">{{ stats.totals.tokens_minted.toLocaleString() }} minted · {{ stats.totals.tokens_spent.toLocaleString() }} spent</div>
        </div>
        <div class="adm-card">
          <div class="adm-card-l">Tilesets · worlds</div>
          <div class="adm-card-n">{{ stats.totals.tilesets }} · {{ stats.totals.worlds }}</div>
        </div>
      </div>

      <section class="adm-section">
        <h2 class="adm-section-title">Last 30 days</h2>
        <div class="adm-charts">
          <div v-for="c in CHARTS" :key="c.key" class="adm-chart">
            <div class="adm-chart-head">
              <span class="adm-card-l">{{ c.label }}</span>
              <span class="adm-chart-total">{{ sum(stats.daily, c.key).toLocaleString() }}</span>
            </div>
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
      </section>

      <div class="adm-split">
        <section v-if="stats.creators" class="adm-section">
          <h2 class="adm-section-title">Creators <span class="adm-sub">{{ stats.creators.creators_total }} have published</span></h2>
          <p class="adm-note">People only: no staff, bots or throwaway accounts. The gap between drew and published is what onboarding has to close.</p>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Week of</th><th class="is-num">Drew</th><th class="is-num">Published</th><th class="is-num">First time</th><th class="is-num">Pieces</th></tr>
              </thead>
              <tbody>
              <tr v-for="w in [...stats.creators.weeks].reverse()" :key="w.week">
                <td>{{ w.week }}</td>
                <td class="is-num">{{ w.drew }}</td>
                <td class="is-num">{{ w.published }}</td>
                <td class="is-num">{{ w.first_published }}</td>
                <td class="is-num">{{ w.pieces.toLocaleString() }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="adm-section">
          <h2 class="adm-section-title">Monthly</h2>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Month</th><th class="is-num">Users</th><th class="is-num">Arts</th><th class="is-num">Granted</th><th class="is-num">Spent</th></tr>
              </thead>
              <tbody>
              <tr v-for="m in [...stats.monthly].reverse()" :key="m.month">
                <td>{{ m.month }}</td>
                <td class="is-num">{{ m.users.toLocaleString() }}</td>
                <td class="is-num">{{ m.arts.toLocaleString() }}</td>
                <td class="is-num">{{ m.tokens_granted.toLocaleString() }}</td>
                <td class="is-num">{{ m.tokens_spent.toLocaleString() }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <template v-if="config">
        <section class="adm-section">
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
          </div>
          <div class="adm-toggles">
            <div v-for="t in TOGGLES" :key="t.label" class="adm-toggle">
              <div>
                <div class="adm-toggle-label">{{ t.label }}</div>
                <div class="adm-sub">{{ t.hint }}</div>
              </div>
              <UiSwitch v-model="config[t.path[0]][t.path[1]]" size="sm" :aria-label="t.label"/>
            </div>
          </div>
        </section>

        <section class="adm-section">
          <h2 class="adm-section-title">Action pricing</h2>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Action</th><th>API cost (USD)</th><th>Tokens override</th><th class="is-num">Charged</th></tr>
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
                <td class="is-num adm-charged">🪙{{ chargedCost(spec) }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="adm-section">
          <h2 class="adm-section-title">Missions</h2>
          <div class="adm-table-wrap">
            <table class="adm-table adm-missions">
              <thead>
              <tr><th>On</th><th>Code</th><th>Title</th><th>Period</th><th>Check</th><th>Reward</th><th/></tr>
              </thead>
              <tbody>
              <tr v-for="(m, i) in missions" :key="i">
                <td><UiSwitch v-model="m.enabled" size="sm" :aria-label="`Mission ${m.code} on`"/></td>
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
                  <div class="adm-row-actions">
                    <button class="btn adm-ic" title="Remove mission" aria-label="Remove mission" @click="removeMission(i)">
                      <span class="icon icon-trash"/>
                    </button>
                  </div>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
          <div>
            <button class="btn" @click="addMission"><span class="icon icon-plus"/><span>Add mission</span></button>
          </div>
        </section>

        <!-- Economy, pricing and missions are one config; one save for all. -->
        <div class="adm-savebar">
          <span class="adm-sub">Economy, pricing and missions save together and go live at once.</span>
          <button class="btn primary" :disabled="saving" @click="saveConfig">
            <span class="icon icon-check"/><span>{{ saving ? 'Saving…' : 'Save config' }}</span>
          </button>
        </div>

        <section class="adm-section">
          <h2 class="adm-section-title">Coupons</h2>
          <div class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Code</th><th>Credits</th><th>Used</th><th>Expires</th><th>Note</th><th/></tr>
              </thead>
              <tbody>
              <template v-for="c in coupons" :key="c.id">
                <tr>
                  <td>{{ c.code }}</td>
                  <td>{{ c.amount }}</td>
                  <td>{{ c.used }}<span v-if="c.max_uses"> / {{ c.max_uses }}</span></td>
                  <td>
                    <template v-if="c.expires_at">
                      {{ new Date(c.expires_at).toLocaleDateString() }}
                      <span v-if="c.expired"> · expired</span>
                    </template>
                    <template v-else>never</template>
                  </td>
                  <td>{{ c.note }}</td>
                  <td>
                    <div class="adm-row-actions">
                      <button
                          class="btn adm-ic"
                          :title="openCoupon === c.id ? 'Hide who claimed it' : 'Who claimed it'"
                          :disabled="!c.used"
                          @click="toggleRedemptions(c)"
                      >
                        <span class="icon" :class="openCoupon === c.id ? 'icon-eye-cross' : 'icon-eye'"/>
                      </button>
                      <button class="btn adm-ic" title="Retire coupon" @click="retireCoupon(c)">
                        <span class="icon icon-trash"/>
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="openCoupon === c.id">
                  <td colspan="6">
                    <template v-if="redemptions[c.id]">
                      <div class="adm-toolbar">
                        <span>
                          {{ redemptions[c.id].count }} claim{{ redemptions[c.id].count === 1 ? '' : 's' }}
                          · {{ redemptions[c.id].total }} credits given
                        </span>
                        <button
                            v-if="redemptions[c.id].results.length < redemptions[c.id].count"
                            class="btn"
                            :disabled="loadingRedemptions === c.id"
                            @click="fetchRedemptions(c, redemptions[c.id].page + 1)"
                        >Load more</button>
                      </div>
                      <table class="adm-table">
                        <thead>
                        <tr><th>Who</th><th>Credits</th><th>When</th></tr>
                        </thead>
                        <tbody>
                        <tr v-for="r in redemptions[c.id].results" :key="r.user_id">
                          <td>{{ r.username }}</td>
                          <td>{{ r.amount }}</td>
                          <td>{{ new Date(r.created).toLocaleString() }}</td>
                        </tr>
                        </tbody>
                      </table>
                    </template>
                    <span v-else>Loading…</span>
                  </td>
                </tr>
              </template>
              <tr v-if="!coupons.length">
                <td colspan="6">No coupons yet.</td>
              </tr>
              <tr>
                <td><input v-model="draft.code" class="adm-input" placeholder="SPRING24"></td>
                <td><input v-model.number="draft.amount" type="number" min="1" class="adm-input adm-input-n"></td>
                <td><input v-model.number="draft.max_uses" type="number" min="0" class="adm-input adm-input-n" title="0 = unlimited"></td>
                <td><input v-model="draft.expires_at" type="datetime-local" class="adm-input"></td>
                <td><input v-model="draft.note" class="adm-input" placeholder="What it is for"></td>
                <td>
                  <button class="btn adm-ic" title="Create coupon" :disabled="couponBusy" @click="addCoupon">
                    <span class="icon icon-plus"/>
                  </button>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>

    <div v-else-if="loading" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton adm-skel"/>
    </div>
  </AdminShell>
</template>

<style scoped>
.adm-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.adm-card,
.adm-chart {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.adm-card-n {
  font-size: var(--text-xl);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.adm-card-l {
  font-size: var(--text-2xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.adm-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}

.adm-section-title {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.adm-split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.adm-split .adm-section-title { border-top: 0; padding-top: 0; }
.adm-split { border-top: 1px solid var(--border); padding-top: var(--space-4); }

.adm-charts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.adm-chart-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}

.adm-chart-total {
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.adm-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 56px;
  margin-top: var(--space-2);
}

.adm-bar {
  flex: 1;
  min-width: 0;
  background: var(--primary);
  opacity: 0.7;
}

.adm-bar:hover { opacity: 1; }

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

.adm-toggles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--border);
  border-left: 1px solid var(--border);
}

.adm-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.adm-toggle-label { font-size: var(--text-xs); font-weight: 600; }

.adm-input-n { max-width: 88px; }
.adm-missions td { padding: var(--space-1); }
.adm-charged { font-weight: 700; white-space: nowrap; }
.adm-ic { padding: var(--space-2); }

.adm-savebar {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-inline: calc(var(--space-4) * -1);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

@media (max-width: 767px) {
  .adm-cards, .adm-charts, .adm-knobs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .adm-split, .adm-toggles { grid-template-columns: 1fr; }
  .adm-savebar .adm-sub { display: none; }
}
</style>
