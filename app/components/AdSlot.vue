<script setup lang="ts">
const {t} = useI18n()

interface Props {
  slot: string
  client?: string
  format?: string
  responsive?: string
  label?: string
  size?: 'small' | 'medium' | 'large'
  /** Inside a Widget the head already says it; skip the built-in label. */
  bare?: boolean
  /** Fixed-size unit (a 728x90 leaderboard). Rendered exactly as AdSense
   *  hands it out: inline width/height, no format attributes. */
  width?: number
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  client: 'ca-pub-7842478840527195',
  format: 'auto',
  responsive: 'true',
  label: '',
  size: 'medium',
  bare: false,
})

const config = useRuntimeConfig()
const adsEnabled = config.public.adsEnabled !== false

const hasValidSlot = computed(() => /^\d{6,}$/.test(props.slot))

const insRef = ref<HTMLElement | null>(null)
const frameRef = ref<HTMLElement | null>(null)
const pushed = ref(false)
// The <ins> is created on the client, and only when the (server-rendered,
// space-reserving) box is actually visible. `adsbygoogle.push({})` is not
// bound to an element: it claims the first unprocessed <ins> in DOM order, so
// a hidden leaderboard higher up the page would swallow the push meant for
// the rail unit below it and neither would ever show.
const live = ref(false)

function ensureScript() {
  if (typeof window === 'undefined') return
  const w = window as any
  if (w.__adsScriptInjected) return
  w.__adsScriptInjected = true
  const inject = () => {
    const s = document.createElement('script')
    s.async = true
    s.crossOrigin = 'anonymous'
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(props.client)}`
    document.head.appendChild(s)
  }
  if ('requestIdleCallback' in w) {
    w.requestIdleCallback(inject, { timeout: 3000 })
  } else {
    setTimeout(inject, 1500)
  }
}

function push() {
  if (pushed.value || typeof window === 'undefined') return
  try {
    // @ts-expect-error — adsbygoogle is injected by external script
    ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    pushed.value = true
  } catch (e) {
    console.warn('AdSense push failed:', e)
  }
}

onMounted(() => {
  if (!adsEnabled || !hasValidSlot.value) return
  // Hidden by the page's CSS (the 728 leaderboard below 768px and in the
  // 1200-1340px band where the column is narrower than it): no box, no unit.
  if (!frameRef.value?.offsetParent) return
  live.value = true
  ensureScript()
  nextTick(() => push())
})
</script>

<template>
  <!-- The flex frame is not decoration. Without it the unit starts at 0px,
       AdSense reads that as "no room", collapses it and climbs the ancestors
       stamping height:auto !important -- on the readme screens it reached
       .dash-main and the fixed-height rail became a page that scrolls. Give
       the unit a flex-sized box from the first paint and it never starts. -->
  <div v-if="adsEnabled && hasValidSlot" ref="frameRef" class="ad-frame">
    <div class="ad-slot" :class="`ad-slot-${size}`" :style="width && height ? {minHeight: `${height}px`} : undefined">
    <div v-if="!bare" class="ad-label">{{ label || t('c_AdSlot.advertisement') }}</div>
    <ins
        v-if="live && width && height"
        ref="insRef"
        class="adsbygoogle"
        :style="`display:inline-block;width:${width}px;height:${height}px`"
        :data-ad-client="client"
        :data-ad-slot="slot"
    />
    <ins
        v-else-if="live"
        ref="insRef"
        class="adsbygoogle"
        style="display:block"
        :data-ad-client="client"
        :data-ad-slot="slot"
        :data-ad-format="format"
        :data-full-width-responsive="responsive"
    />
    </div>
  </div>
</template>

<style scoped>
.ad-frame {
  display: flex;
  justify-content: center;
}

.ad-slot {
  margin-top: 1rem;
  margin-bottom: 1rem;

  min-height: 280px;
  display: flex;
  flex-direction: column;
}

.ad-slot-small { min-height: 200px; }
.ad-slot-medium { min-height: 280px; }
.ad-slot-large { min-height: 320px; }

.ad-slot .adsbygoogle {
  flex: 1;
  min-height: inherit;
}

/* A fixed unit keeps its own box; do not let the flex column stretch it. */
.ad-slot .adsbygoogle[style*="inline-block"] {
  flex: none;
  min-height: 0;
  align-self: center;
}

.ad-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 0 6px;
  color: var(--muted);
  text-align: center;
}

@media (max-width: 640px) {
  .ad-slot-small { min-height: 180px; }
  .ad-slot-medium { min-height: 250px; }
  .ad-slot-large { min-height: 280px; }
}
</style>
