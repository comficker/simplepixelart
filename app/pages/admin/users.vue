<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Users - Admin - Simple Pixel Art',
  description: 'Staff user manager.',
  canonical: 'https://simplepixelart.com/admin/users',
  robots: 'noindex, nofollow',
})

interface Row {
  id: number; username: string; email: string; date_joined: string
  is_staff: boolean; arts: number; invited: number; balance: number
}
interface Page { count: number; page: number; page_size: number; results: Row[] }

const isStaff = computed(() => !!(auth.logged as any)?.is_staff)
const data = ref<Page | null>(null)
const q = ref('')
const page = ref(1)
const loading = ref(false)

async function load() {
  if (!isStaff.value) return
  loading.value = true
  try {
    data.value = await useNativeFetch<Page>('/coloring/admin/users/', {
      params: {q: q.value || undefined, page: page.value},
    })
  } catch {
    toast.error('Could not load users')
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(q, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; load() }, 350)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const pages = computed(() => data.value ? Math.max(1, Math.ceil(data.value.count / data.value.page_size)) : 1)
function go(p: number) {
  page.value = Math.min(Math.max(1, p), pages.value)
  load()
}

const giving = ref<Row | null>(null)
const giveAmount = ref(1)
const sending = ref(false)

function openGive(u: Row) {
  giving.value = u
  giveAmount.value = 1
}

async function sendGive() {
  if (!giving.value || sending.value) return
  const amount = Math.floor(giveAmount.value)
  if (!amount || amount < 1) { toast.error('Amount must be at least 1'); return }
  sending.value = true
  try {
    const res = await useNativeFetch<{ id: number; balance: number }>(
        '/coloring/admin/users/grant/',
        {method: 'POST', body: {user_id: giving.value.id, amount}},
    )
    giving.value.balance = res.balance
    toast.success(`Sent 🪙${amount} to @${giving.value.username}`)
    giving.value = null
  } catch (e: any) {
    toast.error(e?.response?.status === 409 ? 'Just sent — try again in a second' : 'Could not send tokens')
  } finally {
    sending.value = false
  }
}

onMounted(load)
watch(isStaff, (v) => { if (v) load() })
</script>

<template>
  <div class="page">
    <section class="readme adm-panel">
      <div class="adm-head">
        <h1 class="adm-title"><span class="icon icon-user"/><span>Users</span></h1>
        <div class="adm-head-actions">
          <NuxtLink to="/admin" class="btn"><span class="icon icon-adjust"/><span>Overview</span></NuxtLink>
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
          <div class="usr-search">
            <span class="icon icon-search"/>
            <input v-model="q" class="adm-input" placeholder="Search username or email…">
          </div>

          <div v-if="data" class="adm-table-wrap">
            <table class="adm-table">
              <thead>
              <tr><th>User</th><th>Joined</th><th>Arts</th><th>Invited</th><th>Balance</th><th/></tr>
              </thead>
              <tbody>
              <tr v-for="u in data.results" :key="u.id">
                <td>
                  <div class="usr-name">
                    <NuxtLink :to="`/creator/${u.username}`" class="usr-link">@{{ u.username }}</NuxtLink>
                    <span v-if="u.is_staff" class="usr-badge">staff</span>
                  </div>
                  <div class="usr-mail">{{ u.email || '—' }}</div>
                </td>
                <td>{{ u.date_joined }}</td>
                <td>{{ u.arts }}</td>
                <td>{{ u.invited }}</td>
                <td class="usr-balance">🪙{{ u.balance }}</td>
                <td>
                  <button class="btn usr-give" title="Give tokens" @click="openGive(u)">
                    <span class="icon icon-gift"/><span>Give</span>
                  </button>
                </td>
              </tr>
              <tr v-if="!data.results.length">
                <td colspan="6" class="adm-empty">No users match.</td>
              </tr>
              </tbody>
            </table>
          </div>

          <div v-if="data && pages > 1" class="usr-pager">
            <button class="btn" :disabled="page <= 1 || loading" @click="go(page - 1)">
              <span class="icon icon-angle-left"/>
            </button>
            <span class="usr-pager-label">{{ page }} / {{ pages }} · {{ data.count }} users</span>
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

    <UiModal
        v-if="giving"
        title="Give tokens"
        :sub="`Credits go straight to @${giving.username}'s balance (now 🪙${giving.balance}).`"
        width="360px"
        @close="giving = null"
    >
      <form class="usr-give-form" @submit.prevent="sendGive">
        <label class="usr-give-field">
          <span>Amount</span>
          <input v-model.number="giveAmount" type="number" min="1" max="100000" class="adm-input" autofocus>
        </label>
        <button type="submit" class="btn primary usr-give-send" :disabled="sending">
          <span class="icon icon-gift"/>
          <span>{{ sending ? 'Sending…' : `Send 🪙${Math.max(1, Math.floor(giveAmount || 0))}` }}</span>
        </button>
      </form>
    </UiModal>
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

.adm-empty { padding: 2rem 0; text-align: center; }
.adm-skel { height: 72px; border-radius: var(--radius-sm); margin-bottom: var(--space-2); }

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

.usr-search {
  position: relative;
  max-width: 320px;
}

.usr-search .icon {
  position: absolute;
  left: 8px;
  top: 50%;
  translate: 0 -50%;
  width: 14px;
  height: 14px;
  color: var(--muted);
  pointer-events: none;
}

.usr-search .adm-input { padding-left: 28px; }

.usr-name {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-weight: 600;
}

.usr-link { color: var(--foreground); }
.usr-link:hover { color: var(--primary); }

.usr-badge {
  font-size: var(--text-2xs);
  font-weight: 700;
  color: var(--primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 4px;
}

.usr-mail {
  color: var(--muted);
  font-size: var(--text-2xs);
}

.usr-balance { font-weight: 700; white-space: nowrap; }

.usr-give {
  padding: 4px 8px;
  font-size: var(--text-2xs);
  white-space: nowrap;
}

.usr-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.usr-pager-label {
  font-size: var(--text-xs);
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.usr-give-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

.usr-give-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.usr-give-send { justify-content: center; white-space: nowrap; }
</style>
