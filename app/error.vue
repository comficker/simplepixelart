<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode: number
    message: string
  }
}>()

const is404 = computed(() => props.error.statusCode === 404)
const heading = computed(() => is404.value ? 'Pixel out of bounds' : 'Something glitched')
const sub = computed(() =>
    is404.value
        ? 'The page you’re looking for is off the canvas. It might have been moved or never existed.'
        : 'Our canvas hit an unexpected error. The brush has been reset — try again.'
)

useHead({
  title: is404.value ? '404 – Page not found' : 'Error',
  meta: [
    {name: 'robots', content: 'noindex, follow'},
  ],
})

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="err-wrap">
    <section class="err-card">
      <div class="err-art" aria-hidden="true">
        <!-- 6x6 pixel grid that spells the status code in dot-matrix style -->
        <div class="err-grid">
          <span v-for="n in 36" :key="n" class="err-pix" :style="{ animationDelay: `${(n % 7) * 60}ms` }"/>
        </div>
        <div class="err-code">{{ error.statusCode }}</div>
      </div>
      <h1 class="err-title">{{ heading }}</h1>
      <p class="err-sub">{{ sub }}</p>
      <div class="err-actions">
        <button class="btn primary" @click="handleError">
          <span class="icon icon-square"/>
          <span>Back to home</span>
        </button>
        <nuxt-link to="/arts" class="btn">
          <span class="icon icon-search"/>
          <span>Browse gallery</span>
        </nuxt-link>
      </div>
      <p class="err-hint">
        Or press <kbd class="kbd">{{ isMac() ? '⌘' : 'Ctrl' }}</kbd><kbd class="kbd">K</kbd> to search.
      </p>
    </section>
  </div>
</template>

<script lang="ts">
function isMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}
</script>

<style scoped>
.err-wrap {
  min-height: calc(100vh - 200px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
}

.err-card {
  max-width: 520px;
  width: 100%;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.err-art {
  position: relative;
  width: 168px;
  height: 168px;
  margin-bottom: 0.5rem;
  border: 1px dashed color-mix(in oklab, var(--border) 80%, transparent);
  border-radius: var(--radius);
  background:
    linear-gradient(135deg, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%),
    var(--surface);
  overflow: hidden;
}

.err-grid {
  position: absolute;
  inset: 8px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 4px;
  opacity: 0.55;
}

.err-pix {
  background: color-mix(in oklab, var(--primary) 60%, var(--foreground));
  border-radius: 2px;
  opacity: 0;
  animation: errPix 2.4s cubic-bezier(.4,0,.2,1) infinite;
}

@keyframes errPix {
  0%, 30%   { opacity: 0; transform: scale(0.5); }
  45%, 70%  { opacity: 0.9; transform: scale(1); }
  100%      { opacity: 0; transform: scale(0.5); }
}

.err-code {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64px;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.04em;
  color: var(--foreground);
  background: linear-gradient(
      135deg,
      var(--foreground) 0%,
      color-mix(in oklab, var(--foreground) 60%, var(--primary)) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 3px 3px 0 color-mix(in oklab, var(--primary) 25%, transparent);
  pointer-events: none;
  z-index: 1;
}

.err-title {
  font-size: var(--text-2xl);
  line-height: var(--text-2xl-lh);
  font-weight: 800;
  letter-spacing: -0.025em;
  color: var(--foreground);
}

.err-sub {
  color: var(--muted);
  max-width: 38ch;
  font-size: var(--text-sm);
  line-height: var(--text-sm-lh);
}

.err-actions {
  display: flex;
  gap: 0.625rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;
  justify-content: center;
}

.err-hint {
  margin-top: 0.5rem;
  font-size: 12px;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .err-pix { animation: none; opacity: 0.4; }
}
</style>
