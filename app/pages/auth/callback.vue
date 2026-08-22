<script setup lang="ts">
import useStatefulCookie from '~/composables/useStatefulCookie'

useHead({
  title: 'Signing in… — SimplePixelArt',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const router = useRouter()
const authToken = useStatefulCookie('auth_token')
const authTokenRefresh = useStatefulCookie('auth_token_refresh')
const auth = useAuthStore()
const editor = useEditor()

const error = ref<string | null>(null)

onMounted(async () => {
  const access = (route.query.access_token as string | undefined) || ''
  const refresh = (route.query.refresh_token as string | undefined) || ''

  if (!access || !refresh) {
    error.value = 'Missing tokens. Please try again.'
    return
  }

  authToken.value = access
  authTokenRefresh.value = refresh

  let retry = 0
  while (true) {
    const ok = await auth.fetchInfo()
    if (ok || retry >= 2) break
    if (!ok && authTokenRefresh.value) {
      await auth.refreshToken(retry)
    }
    retry++
  }

  if (auth.isLogged) {
    try { await editor.syncLocalToCloud() }
    catch {}
    await attachPendingReferral()
  }

  const next = (route.query.next as string | undefined) || '/'
  router.replace(next)
})
</script>

<template>
  <div class="callback">
    <div class="callback__card">
      <div v-if="!error" class="callback__spinner" aria-hidden="true" />
      <h1 class="callback__title">{{ error ? 'Sign in failed' : 'Signing you in…' }}</h1>
      <p class="callback__msg">{{ error || 'Just a moment.' }}</p>
      <NuxtLink v-if="error" to="/" class="btn primary">Back home</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100dvh - 6rem);
  padding: 2rem 1rem;
}
.callback__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}
.callback__spinner {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-pill);
  border: 3px solid var(--ui-border, rgba(0, 0, 0, 0.1));
  border-top-color: var(--ui-primary, #4ec0e8);
  animation: cb-spin 800ms linear infinite;
}
@keyframes cb-spin { to { transform: rotate(360deg); } }
.callback__title {
  font-size: 1.25rem;
  font-weight: 700;
}
.callback__msg {
  font-size: 0.875rem;
  opacity: 0.7;
}
</style>
