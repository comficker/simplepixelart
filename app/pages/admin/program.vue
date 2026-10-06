<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Creator Program - Admin',
  description: 'Staff review of Creator Program applications.',
  canonical: 'https://simplepixelart.com/admin/program',
  robots: 'noindex, nofollow',
})

interface Row {
  id: number; username: string; avatar: string | null; track: string
  links: string[]; note: string; applied_at: string | null; arts: number
}
interface Page { results: Row[]; founding: number; limit: number }

const STATUSES = ['applied', 'founding', 'declined'] as const
const isStaff = computed(() => !!(auth.logged as any)?.is_staff)
const status = ref<typeof STATUSES[number]>('applied')
const data = ref<Page | null>(null)
const loading = ref(false)
const busy = ref<number | null>(null)

async function load() {
  if (!isStaff.value) return
  loading.value = true
  try {
    data.value = await useNativeFetch<Page>('/coloring/admin/creator-program/', {params: {status: status.value}})
  } catch {
    toast.error('Could not load applications')
  } finally {
    loading.value = false
  }
}

async function decide(row: Row, decision: 'approve' | 'decline') {
  if (busy.value) return
  busy.value = row.id
  try {
    await useNativeFetch(`/coloring/admin/creator-program/${row.id}/`, {method: 'POST', body: {decision}})
    toast.success(decision === 'approve' ? `@${row.username} is a Founding Creator` : `Declined @${row.username}`)
    await load()
  } catch (e: any) {
    const code = Array.isArray(e?.data) ? e.data[0] : ''
    toast.error(code === 'PROGRAM_FULL' ? 'All founding spots are taken' : 'Could not save the decision')
  } finally {
    busy.value = null
  }
}

watch(status, load)
onMounted(load)
watch(isStaff, (v) => { if (v) load() })
</script>

<template>
  <div class="page">
    <section class="readme adm-panel">
      <div class="adm-head">
        <h1 class="adm-title"><span class="icon icon-trophy"/><span>Creator Program</span></h1>
        <div class="adm-head-actions">
          <span v-if="data" class="text-xs text-muted">{{ data.founding }} / {{ data.limit }} founding</span>
          <NuxtLinkLocale to="/admin/users" class="btn"><span class="icon icon-user"/><span>Users</span></NuxtLinkLocale>
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
          <div class="prg-tabs">
            <button
                v-for="s in STATUSES"
                :key="s"
                type="button"
                class="btn"
                :class="{primary: status === s}"
                @click="status = s"
            >{{ s }}</button>
          </div>

          <div v-if="data" class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>Artist</th><th>Links</th><th>Note</th><th>Arts</th><th>Applied</th><th/></tr>
              </thead>
              <tbody>
              <tr v-for="r in data.results" :key="r.id">
                <td>
                  <NuxtLinkLocale :to="`/creator/${r.username}`" class="prg-link">@{{ r.username }}</NuxtLinkLocale>
                </td>
                <td>
                  <a v-for="l in r.links" :key="l" :href="l" target="_blank" rel="noopener noreferrer" class="prg-out">{{ l.replace(/^https?:\/\//, '') }}</a>
                </td>
                <td class="prg-note">{{ r.note || '—' }}</td>
                <td>{{ r.arts }}</td>
                <td>{{ r.applied_at ? r.applied_at.slice(0, 10) : '—' }}</td>
                <td>
                  <div v-if="status === 'applied'" class="prg-actions">
                    <button class="btn primary" :disabled="busy === r.id" @click="decide(r, 'approve')">Approve</button>
                    <button class="btn" :disabled="busy === r.id" @click="decide(r, 'decline')">Decline</button>
                  </div>
                </td>
              </tr>
              <tr v-if="!data.results.length">
                <td colspan="6" class="adm-empty">Nothing here.</td>
              </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.adm-panel {
  max-width: 1100px;
  margin-inline: auto;
}

.adm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}

.adm-head-actions {
  display: flex;
  align-items: center;
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
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.adm-empty { padding: var(--space-6) 0; text-align: center; }

.adm-table-wrap { overflow-x: auto; }

.adm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
}

.adm-table th {
  text-align: left;
  font-weight: 600;
  color: var(--muted);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.adm-table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

.prg-tabs,
.prg-actions {
  display: flex;
  gap: var(--space-2);
}

.prg-link { font-weight: 600; color: var(--foreground); }
.prg-out { display: block; color: var(--primary); white-space: nowrap; }
.prg-note { max-width: 280px; color: var(--muted); }
</style>
