export default defineNuxtPlugin(() => {
  if (import.meta.dev) return

  const config = useRuntimeConfig().public.firebase as Record<string, string>

  const init = async () => {
    try {
      const {initializeApp, getApps, getApp} = await import('firebase/app')
      const app = getApps().length ? getApp() : initializeApp(config)
      const {getAnalytics, isSupported, logEvent} = await import('firebase/analytics')
      if (await isSupported()) {
        const analytics = getAnalytics(app)
        setTracker((name, params) => logEvent(analytics, name, params))
      }
    } catch (e) {
      console.warn('[firebase] init failed', e)
    }
  }

  if ('requestIdleCallback' in window) {
    // A visitor gone before analytics starts is never counted, and the old
    // 5s wait lost every quick bounce.
    (window as any).requestIdleCallback(init, {timeout: 1500})
  } else {
    setTimeout(init, 1000)
  }
})
