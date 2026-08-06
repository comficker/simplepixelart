export default defineNuxtPlugin(() => {
  if (import.meta.dev) return

  const config = useRuntimeConfig().public.firebase as Record<string, string>

  // Defer Firebase init until browser is idle to unblock LCP.
  const init = async () => {
    try {
      const {initializeApp, getApps, getApp} = await import('firebase/app')
      const app = getApps().length ? getApp() : initializeApp(config)
      const {getAnalytics, isSupported} = await import('firebase/analytics')
      if (await isSupported()) {
        getAnalytics(app)
      }
    } catch (e) {
      console.warn('[firebase] init failed', e)
    }
  }

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(init, {timeout: 5000})
  } else {
    setTimeout(init, 3000)
  }
})
