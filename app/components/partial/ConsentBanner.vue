<script setup lang="ts">
const STORAGE_KEY = 'sp_consent_v1'
const config = useRuntimeConfig()
const adsEnabled = config.public.adsEnabled !== false

const visible = ref(false)

function applyConsent(granted: boolean) {
  const w = window as any
  if (typeof w.gtag !== 'function') {
    w.dataLayer = w.dataLayer || []
    w.gtag = function () { w.dataLayer.push(arguments) }
  }
  const state = granted ? 'granted' : 'denied'
  w.gtag('consent', 'update', {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  })
}

function persist(choice: 'accepted' | 'rejected') {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({choice, ts: Date.now()}))
  } catch {}
}

function accept() {
  applyConsent(true)
  persist('accepted')
  visible.value = false
}

function reject() {
  applyConsent(false)
  persist('rejected')
  visible.value = false
}

onMounted(() => {
  if (!adsEnabled) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      applyConsent(saved.choice === 'accepted')
      return
    }
  } catch {}
  visible.value = true
})
</script>

<template>
  <Transition name="consent">
    <div v-if="visible" class="consent" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <div class="consent-inner">
        <div class="consent-text">
          <strong>We use cookies</strong>
          <span>
            SimplePixelArt uses cookies for analytics and personalized ads. You can accept all or reject non-essential cookies.
            See our <nuxt-link to="/privacy">Privacy Policy</nuxt-link>.
          </span>
        </div>
        <div class="consent-actions">
          <button type="button" class="btn" @click="reject">Reject</button>
          <button type="button" class="btn primary" @click="accept">Accept all</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.consent {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;

  z-index: 45;
  padding: var(--space-4);
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.consent-inner {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  max-width: 880px;
  width: 100%;
  padding: 0.875rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-hover);
}

.consent-text {
  flex: 1 1 240px;
  min-width: 0;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.consent-text strong {
  color: var(--foreground);
  font-weight: 700;
  letter-spacing: -0.005em;
}

.consent-text :deep(a) {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.consent-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.consent-actions .btn {
  padding: 0.5rem 0.875rem !important;
  font-size: var(--text-xs) !important;
}

@media (max-width: 520px) {
  .consent-inner {
    flex-direction: column;
    align-items: stretch;
  }
  .consent-actions {
    justify-content: flex-end;
  }
}

.consent-enter-active,
.consent-leave-active {
  transition: opacity 200ms ease, transform 200ms cubic-bezier(.22,.61,.36,1);
}

.consent-enter-from,
.consent-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
