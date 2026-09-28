<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Arts - Admin - Simple Pixel Art',
  description: 'Staff artwork manager.',
  canonical: 'https://simplepixelart.com/admin/arts',
  robots: 'noindex, nofollow',
})

interface Social {
  platform: string; channel: string; status: string; external_url: string; error: string
}
interface Row {
  id: number; id_string: string; name: string; status: string
  width: number; height: number; is_template: boolean
  username: string | null; updated: string | null; social: Social[]
}
interface ChannelInfo { platform: string; channel: string; name: string; mode: string }
interface Page {
  count: number; page: number; page_size: number; results: Row[]
  channels: ChannelInfo[]; app: string | null
}

const isStaff = computed(() => !!(auth.logged as any)?.is_staff)
const data = ref<Page | null>(null)
const q = ref('')
const statusFilter = ref('')
const socialFilter = ref('')
const page = ref(1)
const loading = ref(false)
const sending = ref<number | null>(null)

async function load() {
  if (!isStaff.value) return
  loading.value = true
  try {
    data.value = await useNativeFetch<Page>('/coloring/admin/arts/', {
      params: {
        q: q.value || undefined,
        status: statusFilter.value || undefined,
        social: socialFilter.value || undefined,
        page: page.value,
      },
    })
  } catch {
    toast.error('Could not load arts')
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 350)
})
watch([statusFilter, socialFilter], () => { page.value = 1; load() })
onBeforeUnmount(() => clearTimeout(searchTimer))

const pages = computed(() => data.value ? Math.max(1, Math.ceil(data.value.count / data.value.page_size)) : 1)
function go(p: number) {
  page.value = Math.min(Math.max(1, p), pages.value)
  load()
}

const channels = computed(() => data.value?.channels || [])
/* No channel configured means the two buttons cannot do anything, and the
   reason is in the dashboard rather than on this page. */
const noChannels = computed(() => !!data.value && channels.value.length === 0)

function socialFor(row: Row, platform: string) {
  return row.social.find(s => s.platform === platform) || null
}

async function syndicate(row: Row, republish: boolean) {
  if (sending.value) return
  sending.value = row.id
  try {
    const res = await useNativeFetch<{
      shared: string[]; queued: string[]
      failed: { platform: string; error: string }[]; social: Social[]
    }>('/coloring/admin/arts/syndicate/', {method: 'POST', body: {id: row.id, republish}})
    row.social = res.social
    if (res.shared.length) toast.success(`Posted to ${res.shared.join(', ')}`)
    if (res.queued.length) toast.info(`Queued — the cron sends ${res.queued.join(', ')}`)
    for (const f of res.failed) toast.error(`${f.platform}: ${f.error}`)
    if (!res.shared.length && !res.queued.length && !res.failed.length) {
      toast.info('Already on every channel — use Republish to post again')
    }
  } catch (e: any) {
    const code = e?.response?._data?.[0] || e?.data?.[0]
    const MSG: Record<string, string> = {
      ART_NOT_PUBLIC: 'Only a public piece can be sent',
      NO_CHANNELS: 'No channels configured yet',
      ART_NOT_FOUND: 'That piece is gone',
    }
    toast.error(MSG[code] || 'Could not send this one')
  } finally {
    sending.value = null
  }
}

onMounted(load)
watch(isStaff, (v) => { if (v) load() })
</script>

<template>
  <div class="page">
    <section class="readme adm-panel">
      <div class="adm-head">
        <h1 class="adm-title"><span class="icon icon-image"/><span>Arts</span></h1>
        <div class="adm-head-actions">
          <NuxtLinkLocale to="/admin" class="btn"><span class="icon icon-adjust"/><span>Overview</span></NuxtLinkLocale>
          <button v-if="isStaff" class="btn" :disabled="loading" @click="load">
            <span class="icon icon-refresh"/><span>Refresh</span>
          </button>
        </div>
      </div>

      <div class="adm-body">
        <div v-if="!isStaff" class="adm-empty">
          <p class="text-xs text-muted">Staff only.</p>
        </div>

        <template v-else>
          <div class="art-filters">
            <div class="art-search">
              <span class="icon icon-search"/>
              <input v-model="q" class="adm-input" placeholder="Search name or slug…">
            </div>
            <select v-model="statusFilter" class="adm-input art-select">
              <option value="">Any status</option>
              <option value="public">Public</option>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
            </select>
            <select v-model="socialFilter" class="adm-input art-select" :disabled="noChannels">
              <option value="">Any channel state</option>
              <option value="done">On every channel</option>
              <option value="pending">Not everywhere yet</option>
            </select>
          </div>

          <p v-if="noChannels" class="art-note">
            No social channels configured for this site yet — add one in the
            Ninosaur dashboard, then Publish will have somewhere to send to.
          </p>

          <div v-if="data" class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr>
                <th>Art</th>
                <th>Status</th>
                <th v-for="c in channels" :key="c.channel">{{ c.name }}</th>
                <th/>
              </tr>
              </thead>
              <tbody>
              <tr v-for="r in data.results" :key="r.id">
                <td>
                  <div class="art-name">
                    <NuxtLinkLocale :to="`/art/${r.id_string}`" class="art-link">{{ r.name }}</NuxtLinkLocale>
                    <span v-if="r.is_template" class="art-badge">original</span>
                  </div>
                  <div class="art-sub">
                    {{ r.width }}×{{ r.height }}
                    <template v-if="r.username"> · @{{ r.username }}</template>
                  </div>
                </td>
                <td><span class="art-status" :class="`is-${r.status}`">{{ r.status }}</span></td>
                <td v-for="c in channels" :key="c.channel">
                  <template v-if="socialFor(r, c.platform) as Social | null">
                    <a
                        v-if="socialFor(r, c.platform)!.external_url"
                        :href="socialFor(r, c.platform)!.external_url"
                        target="_blank" rel="noopener"
                        class="art-chip is-shared"
                    >shared</a>
                    <span
                        v-else
                        class="art-chip"
                        :class="`is-${socialFor(r, c.platform)!.status}`"
                        :title="socialFor(r, c.platform)!.error || undefined"
                    >{{ socialFor(r, c.platform)!.status === 'none' ? '—' : socialFor(r, c.platform)!.status }}</span>
                  </template>
                </td>
                <td>
                  <div class="art-actions">
                    <button
                        class="btn"
                        :disabled="r.status !== 'public' || noChannels || sending === r.id"
                        title="Send to the channels it has not reached"
                        @click="syndicate(r, false)"
                    >
                      <span class="icon icon-social"/><span>Publish</span>
                    </button>
                    <button
                        class="btn"
                        :disabled="r.status !== 'public' || noChannels || sending === r.id"
                        title="Post again everywhere, including where it already went"
                        @click="syndicate(r, true)"
                    >
                      <span class="icon icon-sync"/>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!data.results.length">
                <td :colspan="3 + channels.length" class="adm-empty">No arts match.</td>
              </tr>
              </tbody>
            </table>
          </div>

          <div v-if="data && pages > 1" class="art-pager">
            <button class="btn" :disabled="page <= 1 || loading" @click="go(page - 1)">
              <span class="icon icon-angle-left"/>
            </button>
            <span class="art-pager-label">{{ page }} / {{ pages }} · {{ data.count }} arts</span>
            <button class="btn" :disabled="page >= pages || loading" @click="go(page + 1)">
              <span class="icon icon-angle-right"/>
            </button>
          </div>

          <div v-if="loading && !data" class="adm-empty" aria-busy="true">
            <div v-for="i in 3" :key="i" class="skeleton adm-skel"/>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Same panel chrome the other admin screens use. */
.adm-panel {
  max-width: 1040px;
  margin-inline: auto;
}

.adm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border);
}

.adm-head-actions {
  display: flex;
  gap: var(--space-2);
}

.adm-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
}

.adm-title .icon { color: var(--primary); }

.adm-body {
  padding: var(--space-4);
}

.adm-empty { padding: 2rem 0; text-align: center; }
.adm-skel { height: 72px; border-radius: var(--radius-sm); margin-bottom: var(--space-2); }

.adm-table-wrap { overflow-x: auto; }

.adm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}

.adm-table th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
}

.adm-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
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

.art-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.art-search {
  position: relative;
  flex: 1 1 14rem;
  min-width: 0;
}

.art-search .icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
}

.art-search .adm-input { padding-left: 28px; }

.art-select { flex: 0 0 auto; width: auto; }

.art-note {
  margin: 0 0 var(--space-3);
  color: var(--muted);
  font-size: var(--text-xs);
}

.art-name {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.art-link { color: var(--foreground); }
.art-link:hover { color: var(--primary); }

.art-badge,
.art-chip,
.art-status {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-2xs);
  color: var(--muted);
  white-space: nowrap;
}

.art-sub {
  color: var(--muted);
  font-size: var(--text-2xs);
}

.art-status.is-public { color: var(--primary); border-color: var(--primary); }
.art-status.is-pending { color: var(--warning, #b7791f); }

.art-chip.is-shared { color: var(--primary); border-color: var(--primary); }
.art-chip.is-failed { color: var(--danger-foreground, #b00); border-color: currentColor; }
.art-chip.is-none { border-color: transparent; }

.art-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}

.art-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.art-pager-label {
  color: var(--muted);
  font-size: var(--text-xs);
}
</style>
