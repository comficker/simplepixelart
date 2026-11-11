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
  <AdminShell title="Creator Program" :busy="loading" @refresh="load">
    <template #actions>
      <span v-if="data" class="adm-badge">{{ data.founding }} / {{ data.limit }} founding</span>
    </template>
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
        <tr><th>Artist</th><th>Links</th><th>Note</th><th class="is-num">Arts</th><th>Applied</th><th/></tr>
        </thead>
        <tbody>
        <tr v-for="r in data.results" :key="r.id">
          <td>
            <NuxtLinkLocale :to="`/creator/${r.username}`" class="adm-link">@{{ r.username }}</NuxtLinkLocale>
          </td>
          <td>
            <a v-for="l in r.links" :key="l" :href="l" target="_blank" rel="noopener noreferrer" class="prg-out">{{ l.replace(/^https?:\/\//, '') }}</a>
          </td>
          <td class="prg-note">{{ r.note || '—' }}</td>
          <td class="is-num">{{ r.arts }}</td>
          <td>{{ r.applied_at ? r.applied_at.slice(0, 10) : '—' }}</td>
          <td>
            <div v-if="status === 'applied'" class="adm-row-actions">
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

    <div v-if="loading && !data" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton adm-skel"/>
    </div>
  </AdminShell>
</template>

<style scoped>
.prg-tabs {
  display: flex;
  gap: var(--space-2);
}

.prg-tabs .btn { text-transform: capitalize; }
.prg-out { display: block; color: var(--primary); white-space: nowrap; }
.prg-note { max-width: 280px; color: var(--muted); }
</style>
