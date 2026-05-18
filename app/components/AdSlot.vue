<script setup lang="ts">
interface Props {
  slot: string
  client?: string
  format?: string
  responsive?: string
  label?: string
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  client: 'ca-pub-7014744652532083',
  format: 'auto',
  responsive: 'true',
  label: 'Advertisement',
  size: 'medium',
})

const config = useRuntimeConfig()
const adsEnabled = config.public.adsEnabled !== false

// Skip rendering when slot ID is missing/placeholder so we don't ship broken <ins> tags.
const hasValidSlot = computed(() => /^\d{6,}$/.test(props.slot))

const insRef = ref<HTMLElement | null>(null)
const pushed = ref(false)

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
  nextTick(() => push())
})
</script>

<template>
  <div v-if="adsEnabled && hasValidSlot" class="ad-slot" :class="`ad-slot-${size}`">
    <div class="ad-label">{{ label }}</div>
    <ins
        ref="insRef"
        class="adsbygoogle"
        style="display:block"
        :data-ad-client="client"
        :data-ad-slot="slot"
        :data-ad-format="format"
        :data-full-width-responsive="responsive"
    />
  </div>
</template>

<style scoped>
.ad-slot {
  margin-top: 1rem;
  margin-bottom: 1rem;
  /* Reserve space to prevent CLS when ad lazy-loads */
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
