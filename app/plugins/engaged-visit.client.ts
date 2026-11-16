import {analyticsDenied} from '~/helper/consent'
import {onProductEvent, track} from '~/composables/useTrack'

// `engaged_visit`, once per tab session: the visit is a person, not a
// datacenter bot that loads the page and leaves. GA4 segments cannot filter
// on "engaged session", so the bot-city filter dropped real visitors from
// those cities too; with this event it can keep them. Sent on whichever
// comes first:
//   time         -- 10s with the tab visible (time hidden does not count)
//   interaction  -- a pointer press, a key, or a scroll past 200px
//   product_event -- any product event (new_canvas, export, login, ...)
// Not sent while analytics consent is denied; a later trigger after the
// visitor accepts still counts.
const FLAG = 'sp_engaged_v1'
const VISIBLE_MS = 10_000

export default defineNuxtPlugin(() => {
  const adsEnabled = useRuntimeConfig().public.adsEnabled !== false
  try {
    if (sessionStorage.getItem(FLAG)) return
  } catch {}

  let done = false
  let visibleMs = 0
  let visibleSince: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function fire(trigger: 'time' | 'interaction' | 'product_event') {
    if (done) return
    // Consent Mode exists only with ads on; without it nothing is denied.
    if (adsEnabled && analyticsDenied()) return
    done = true
    try {
      sessionStorage.setItem(FLAG, trigger)
    } catch {}
    cleanup()
    track('engaged_visit', {trigger})
  }

  function startClock() {
    if (visibleSince !== null || document.visibilityState !== 'visible') return
    visibleSince = Date.now()
    timer = setTimeout(() => {
      stopClock()
      fire('time')
    }, Math.max(0, VISIBLE_MS - visibleMs))
  }

  function stopClock() {
    if (visibleSince !== null) visibleMs += Date.now() - visibleSince
    visibleSince = null
    if (timer) clearTimeout(timer)
    timer = null
  }

  const onVisibility = () => document.visibilityState === 'visible' ? startClock() : stopClock()
  const onInteract = () => fire('interaction')
  const onScroll = (e: Event) => {
    const t = e.target
    const y = t instanceof Element ? t.scrollTop : window.scrollY
    if (y > 200) fire('interaction')
  }

  function cleanup() {
    stopClock()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pointerdown', onInteract, true)
    window.removeEventListener('keydown', onInteract, true)
    window.removeEventListener('scroll', onScroll, true)
    onProductEvent(null)
  }

  document.addEventListener('visibilitychange', onVisibility)
  // Capture phase: the editor and the canvas stop propagation of their own
  // pointer events. Scroll is captured too, since most screens scroll an
  // inner panel rather than the window.
  window.addEventListener('pointerdown', onInteract, {capture: true, passive: true})
  window.addEventListener('keydown', onInteract, {capture: true, passive: true})
  window.addEventListener('scroll', onScroll, {capture: true, passive: true})
  onProductEvent(() => fire('product_event'))
  startClock()
})
