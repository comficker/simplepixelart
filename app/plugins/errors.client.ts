// Uncaught errors go to GA as `app_exception` (same name as the mobile app),
// so a funnel step that loses people can be told apart from one that breaks
// for them. Each message once per page, ten per visit; noise from browser
// extensions and third-party scripts is dropped.
const NOISE = /ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|googlesyndication|googletagmanager|adsbygoogle|Script error\.?$|Load failed$|Failed to fetch dynamically imported module/i
const MAX_PER_VISIT = 10

export default defineNuxtPlugin((nuxtApp) => {
  const seen = new Set<string>()
  let sent = 0
  let page = ''

  function report(err: unknown, source: 'vue' | 'window' | 'promise', fatal = false, file = '') {
    const message = String((err as any)?.message ?? err ?? '').slice(0, 100)
    if (!message || NOISE.test(message) || NOISE.test(file) || NOISE.test(String((err as any)?.stack ?? ''))) return
    const route = String(nuxtApp.$router?.currentRoute.value.name ?? '').split('___')[0]
    if (route !== page) { page = route; seen.clear() }
    if (seen.has(message) || sent >= MAX_PER_VISIT) return
    seen.add(message)
    sent++
    track('app_exception', {message, source, route, fatal, frame: topFrame(err, file)})
  }

  // Where it was thrown, as "/_nuxt/<chunk>.js:<line>:<col>" -- the message
  // alone did not say which of a dozen null-guarded call sites it was.
  function topFrame(err: unknown, file: string) {
    // Chrome's stack starts with the message, which can hold a path too;
    // Firefox and Safari start straight at the first frame.
    const stack = String((err as any)?.stack ?? '').replace(String((err as any)?.message ?? ''), '')
    const m = stack.match(/(?:https?:\/\/[^/\s)]+)?(\/[^\s)]*:\d+:\d+)/) || stack.match(/<anonymous>|\(native\)/)
    return (m?.[1] || m?.[0] || file || '(none)').slice(0, 100)
  }

  // Nuxt owns vueApp.config.errorHandler (it drives the error page); its
  // hooks are the supported way to listen in.
  nuxtApp.hook('vue:error', (err) => report(err, 'vue'))
  nuxtApp.hook('app:error', (err) => report(err, 'vue', true))
  window.addEventListener('error', (e) => report(e.error ?? e.message, 'window', false, e.filename || ''))
  window.addEventListener('unhandledrejection', (e) => report(e.reason, 'promise'))
})
