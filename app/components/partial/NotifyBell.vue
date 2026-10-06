<script setup lang="ts">
interface Notif {
  id: number
  kind: string
  read: boolean
  meta: Record<string, any> | null
  created: string
  actor: { username?: string } | null
}

const auth = useAuthStore()
const {t} = useI18n()
const unread = ref(0)
const items = ref<Notif[]>([])
const loading = ref(false)
const loaded = ref(false)

async function fetchUnread() {
  if (!auth.isLogged) return
  try {
    const res = await useNativeFetch<{ count: number }>('/activity/notifications/', {
      params: {read: false, page_size: 1},
    })
    unread.value = res.count || 0
  } catch {  }
}

async function onOpen() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await useNativeFetch<{ results: Notif[] }>('/activity/notifications/', {
      params: {page_size: 10},
    })
    items.value = res.results || []
    loaded.value = true
    if (unread.value > 0) {
      await useNativeFetch('/activity/notifications-read/', {method: 'POST', body: {}})
      unread.value = 0
    }
  } catch {  } finally {
    loading.value = false
  }
}

const KIND_ICON: Record<string, string> = {
  follow: 'icon-user', comment: 'icon-chat', like: 'icon-heart', remix: 'icon-pen',
  new_art: 'icon-image', challenge: 'icon-flag',
}

function textOf(n: Notif): string {
  const who = n.actor?.username ? `@${n.actor.username}` : t('c_NotifyBell.someone')
  const yourArt = t('c_NotifyBell.yourArt')
  if (n.kind === 'follow') return t('c_NotifyBell.startedFollowing', {who})
  if (n.kind === 'comment') return t('c_NotifyBell.commentedOn', {who, name: n.meta?.target_name || yourArt})
  if (n.kind === 'like') return t('c_NotifyBell.liked', {who, name: n.meta?.target_name || yourArt})
  if (n.kind === 'new_art') return t('c_NotifyBell.published', {who, name: n.meta?.target_name || t('c_NotifyBell.aNewPiece')})
  if (n.kind === 'challenge') return t('c_NotifyBell.challengePlaced', {place: n.meta?.place, name: n.meta?.challenge_name})
  if (n.kind === 'remix') return t('c_NotifyBell.remixed', {who, name: n.meta?.original_name || yourArt})
  return `${who} · ${n.kind}`
}

function linkOf(n: Notif): string {
  if (n.kind === 'follow' && n.actor?.username) return `/creator/${n.actor.username}`
  if (n.meta?.target_type === 'sharedpage' && n.meta?.target_id) return `/art/${n.meta.target_id}`
  return '/work'
}

function ago(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return t('c_NotifyBell.agoS', {n: s})
  if (s < 3600) return t('c_NotifyBell.agoM', {n: Math.floor(s / 60)})
  if (s < 86400) return t('c_NotifyBell.agoH', {n: Math.floor(s / 3600)})
  return t('c_NotifyBell.agoD', {n: Math.floor(s / 86400)})
}

onMounted(fetchUnread)
watch(() => auth.isLogged, (v) => { if (v) fetchUnread() })
</script>

<template>
  <ui-dropdown-menu v-if="auth.isLogged" position="right" :label="$t('common.notifications')" @open="onOpen">
    <button type="button" class="hdr-link notify-btn" :title="$t('c_NotifyBell.notifications')">
      <span class="icon icon-bell"/>
      <span v-if="unread > 0" class="notify-badge">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
    <template #menu>
      <div class="file-menu notify-menu">
        <div class="file-menu-item file-menu-heading">{{ $t('c_NotifyBell.notifications') }}</div>
        <div v-if="loading && !items.length" class="notify-empty">{{ $t('common.loading') }}</div>
        <template v-else-if="items.length">
          <NuxtLinkLocale
              v-for="n in items"
              :key="n.id"
              :to="linkOf(n)"
              class="file-menu-item notify-item"
              :class="{unread: !n.read}"
          >
            <span class="icon" :class="KIND_ICON[n.kind] || 'icon-chat'"/>
            <span class="file-menu-label is-stacked">
              <span class="notify-text">{{ textOf(n) }}</span>
              <span class="notify-sub">
                <template v-if="n.meta?.excerpt">“{{ n.meta.excerpt }}” · </template>{{ ago(n.created) }}
              </span>
            </span>
          </NuxtLinkLocale>
        </template>
        <div v-else-if="loaded" class="notify-empty">{{ $t('c_NotifyBell.nothingYetPublishArtAnd') }}</div>
      </div>
    </template>
  </ui-dropdown-menu>
</template>

<style scoped>
.notify-btn {
  position: relative;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.notify-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xs);
  font-weight: 800;
  line-height: 1;
  color: var(--primary-foreground);
  background: var(--primary-fill);
  border-radius: var(--radius-pill);
}

.notify-menu {
  min-width: 280px;
  max-width: 340px;
}

.notify-item .notify-text {
  font-weight: 600;
}

.notify-item.unread .notify-text {
  color: var(--primary);
}

.notify-sub {
  font-size: var(--text-2xs);
  color: var(--muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  max-width: 260px;
}

.notify-empty {
  padding: var(--space-3);
  font-size: var(--text-xs);
  color: var(--muted);
}
</style>
