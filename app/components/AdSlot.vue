<script setup lang="ts">
interface Props {
  slot: string
  client?: string
  format?: string
  responsive?: string
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  client: 'ca-pub-7014744652532083',
  format: 'auto',
  responsive: 'true',
  label: 'Advertisement',
})

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
  nextTick(() => push())
})
</script>

<template>
  <div class="ad-slot">
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
@reference "tailwindcss";

.ad-slot {
  @apply my-4;
  min-height: 100px;
}

.ad-label {
  @apply text-xs uppercase py-1;
  color: var(--muted);
  letter-spacing: 0.08em;
  text-align: center;
}
</style>
