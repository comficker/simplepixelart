<script setup lang="ts">
import useStatefulCookie from '~/composables/useStatefulCookie'

const {t} = useI18n()
useHead({
  title: () => t('p_auth_callback.pageTitle'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const router = useRouter()
const authToken = useStatefulCookie('auth_token')
const authTokenRefresh = useStatefulCookie('auth_token_refresh')
const auth = useAuthStore()

const error = ref<string | null>(null)

onMounted(async () => {
  const access = (route.query.access_token as string | undefined) || ''
  const refresh = (route.query.refresh_token as string | undefined) || ''

  if (!access || !refresh) {
    error.value = t('p_auth_callback.missingTokens')
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
    await attachPendingReferral()
    // Offered on the page we land on, not here -- this view unmounts the
    // moment the redirect below runs.
    useLocalSync().offer()
  }

  const next = (route.query.next as string | undefined) || '/'
  router.replace(next)
})
</script>

<template>
  <div class="callback">
    <div class="callback__card">
      <div v-if="!error" class="callback__spinner" aria-hidden="true" />
      <h1 class="callback__title">{{ error ? $t('p_auth_callback.signInFailed') : $t('p_auth_callback.signingYouIn') }}</h1>
      <p class="callback__msg">{{ error || $t('p_auth_callback.justAMoment') }}</p>
      <NuxtLinkLocale v-if="error" to="/" class="btn primary">{{ $t('p_auth_callback.backHome') }}</NuxtLinkLocale>
    </div>
  </div>
</template>

<style scoped>
.callback {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100dvh - 6rem);
  padding: 2rem var(--space-4);
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
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  animation: cb-spin 800ms linear infinite;
}
@keyframes cb-spin { to { transform: rotate(360deg); } }
.callback__title {
  font-size: var(--text-lg);
  font-weight: 700;
}
.callback__msg {
  font-size: var(--text-sm);
  opacity: 0.7;
}
</style>
