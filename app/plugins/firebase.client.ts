import {initializeApp, getApps, getApp, type FirebaseApp} from 'firebase/app'
import type {Analytics} from 'firebase/analytics'

export default defineNuxtPlugin(async () => {
  const config = useRuntimeConfig().public.firebase as Record<string, string>

  // Reuse existing app if HMR already initialised one.
  const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config)

  let analytics: Analytics | null = null

  // Dynamic-import the analytics SDK only in production so the ~30KB
  // chunk is code-split out of the main bundle. Skip in dev to keep
  // local stats clean.
  if (!import.meta.dev) {
    try {
      const {getAnalytics, isSupported} = await import('firebase/analytics')
      if (await isSupported()) {
        analytics = getAnalytics(app)
      }
    } catch (e) {
      console.warn('[firebase] analytics init failed', e)
    }
  }

  return {
    provide: {
      firebase: app,
      firebaseAnalytics: analytics,
    },
  }
})
