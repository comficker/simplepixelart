<script setup lang="ts">
const year = new Date().getFullYear()
const config = useRuntimeConfig()
const auth = useAuthStore()

const requestURL = useRequestURL()
const googleAuthUrl = computed(() => {
  const apiBase = (config.public.api as string) || ''
  const next = `${requestURL.origin}/auth/callback`
  return `${apiBase}/auth/google?state=${encodeURIComponent(next)}`
})
</script>

<template>
  <footer>
    <div class="container footer-bar">
      <div class="footer-left">
        <span class="footer-copy">© {{ year }} SimplePixelArt.com</span>
        <!-- Minimal set: Privacy/Terms must stay visible (AdSense + legal),
             Contact for trust. About/Guidelines/DMCA remain reachable via the
             command palette and the contact page. -->
        <nav class="footer-links" aria-label="Footer">
          <nuxt-link to="/contact">Contact</nuxt-link>
          <nuxt-link to="/privacy">Privacy</nuxt-link>
          <nuxt-link to="/terms">Terms</nuxt-link>
        </nav>
      </div>
      <div class="footer-actions">
        <a href="https://github.com/comficker/simplepixelart" target="_blank" rel="noopener" class="footer-ic" title="Open source on GitHub" aria-label="GitHub repository">
          <span class="icon icon-github"/>
        </a>
        <a href="https://x.com/comficker" target="_blank" rel="noopener" class="footer-ic" title="Follow on X" aria-label="X (Twitter)">
          <span class="icon icon-brand-x"/>
        </a>
        <span class="footer-sep" aria-hidden="true"/>
        <span v-if="auth.isLogged" class="footer-auth" @click="auth.logout()">Logout</span>
        <a v-else :href="googleAuthUrl" class="footer-auth">Login</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.footer-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
  padding-top: var(--space-4);
  padding-bottom: 0;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.footer-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  min-width: 0;
}

.footer-copy {
  color: var(--muted);
  white-space: nowrap;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}

.footer-links a,
.footer-auth {
  color: var(--muted);
  cursor: pointer;
  transition: color 160ms ease;
}

/* GitHub / X get first-class placement: icon buttons on the right. */
.footer-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.footer-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--muted);
  transition: color 160ms ease;
}

.footer-ic .icon {
  width: 17px;
  height: 17px;
}

.footer-sep {
  width: 1px;
  height: 14px;
  background: var(--border);
}

.footer-auth {
  font-weight: 600;
  color: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .footer-links a:hover,
  .footer-auth:hover,
  .footer-ic:hover {
    color: var(--primary);
  }
}

/* Small screens: stack centered — copyright, links, then the action row. */
@media (max-width: 640px) {
  .footer-bar {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .footer-left {
    flex-direction: column;
    align-items: center;
  }

  .footer-links {
    justify-content: center;
  }
}
</style>
