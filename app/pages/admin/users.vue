<script setup lang="ts">
import {toast} from 'vue-sonner'

const auth = useAuthStore()

useCustomSeoMeta({
  title: 'Users - Admin',
  description: 'Staff user manager.',
  canonical: 'https://simplepixelart.com/admin/users',
  robots: 'noindex, nofollow',
})

interface Row {
  id: number; username: string; email: string; date_joined: string
  is_staff: boolean; arts: number; invited: number; balance: number; verified: boolean
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

async function toggleVerified(u: Row) {
  try {
    const res = await useNativeFetch<{ id: number; verified: boolean }>(
        '/coloring/admin/users/verify/',
        {method: 'POST', body: {user_id: u.id, verified: !u.verified}},
    )
    u.verified = res.verified
    toast.success(res.verified ? `@${u.username} is verified` : `Removed Verified from @${u.username}`)
  } catch {
    toast.error('Could not change Verified')
  }
}

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
  <AdminShell title="Users" :busy="loading" @refresh="load">
    <div class="adm-toolbar">
      <div class="adm-search">
        <span class="icon icon-search"/>
        <input v-model="q" type="search" class="adm-input" placeholder="Search username or email…" aria-label="Search users">
      </div>
    </div>

    <div v-if="data" class="adm-table-wrap">
      <table class="adm-table">
        <thead>
        <tr><th>User</th><th>Joined</th><th class="is-num">Arts</th><th class="is-num">Invited</th><th class="is-num">Balance</th><th/></tr>
        </thead>
        <tbody>
        <tr v-for="u in data.results" :key="u.id">
          <td>
            <div class="usr-name">
              <NuxtLinkLocale :to="`/creator/${u.username}`" class="adm-link">@{{ u.username }}</NuxtLinkLocale>
              <span v-if="u.is_staff" class="adm-badge is-on">staff</span>
            </div>
            <div class="adm-sub">{{ u.email || '—' }}</div>
          </td>
          <td>{{ u.date_joined }}</td>
          <td class="is-num">{{ u.arts }}</td>
          <td class="is-num">{{ u.invited }}</td>
          <td class="is-num usr-balance">🪙{{ u.balance }}</td>
          <td>
            <div class="adm-row-actions">
              <button
                  class="btn usr-give"
                  :class="{primary: u.verified}"
                  :aria-pressed="u.verified"
                  :title="u.verified ? 'Remove the Verified label' : 'Give the Verified label'"
                  @click="toggleVerified(u)"
              >
                <span class="icon icon-check-decagram"/><span>{{ u.verified ? 'Verified' : 'Verify' }}</span>
              </button>
              <button class="btn usr-give" title="Give tokens" @click="openGive(u)">
                <span class="icon icon-gift"/><span>Give</span>
              </button>
            </div>
          </td>
        </tr>
        <tr v-if="!data.results.length">
          <td colspan="6" class="adm-empty">No users match.</td>
        </tr>
        </tbody>
      </table>
    </div>

    <div v-if="data && pages > 1" class="adm-pager">
      <button class="btn" :disabled="page <= 1 || loading" @click="go(page - 1)">
        <span class="icon icon-angle-left"/>
      </button>
      <span class="adm-pager-label">{{ page }} / {{ pages }} · {{ data.count }} users</span>
      <button class="btn" :disabled="page >= pages || loading" @click="go(page + 1)">
        <span class="icon icon-angle-right"/>
      </button>
    </div>

    <div v-if="loading && !data" class="adm-empty" aria-busy="true">
      <div v-for="i in 3" :key="i" class="skeleton adm-skel"/>
    </div>
    <template #outside>
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
          <input v-model.number="giveAmount" type="number" min="1" max="100000" class="adm-input" aria-label="Credits to give" autofocus>
        </label>
        <button type="submit" class="btn primary usr-give-send" :disabled="sending">
          <span class="icon icon-gift"/>
          <span>{{ sending ? 'Sending…' : `Send 🪙${Math.max(1, Math.floor(giveAmount || 0))}` }}</span>
        </button>
      </form>
    </UiModal>
    </template>
  </AdminShell>
</template>

<style scoped>
.usr-name {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.usr-balance { font-weight: 700; white-space: nowrap; }

.usr-give {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-2xs);
  white-space: nowrap;
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
