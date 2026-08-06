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
      <nav class="footer-links" aria-label="Footer">
        <nuxt-link to="/about">About</nuxt-link>
        <nuxt-link to="/contact">Contact</nuxt-link>
        <nuxt-link to="/privacy">Privacy</nuxt-link>
        <nuxt-link to="/terms">Terms</nuxt-link>
        <nuxt-link to="/guidelines">Guidelines</nuxt-link>
        <nuxt-link to="/dmca">DMCA</nuxt-link>
        <span v-if="auth.isLogged" class="footer-auth" @click="auth.logout()">Logout</span>
        <a v-else :href="googleAuthUrl" class="footer-auth">Login</a>
      </nav>
      <span class="footer-copy">© {{ year }} SimplePixelArt.com</span>
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

.footer-copy {
  color: var(--muted);
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}

.footer-links a,
.footer-auth {
  color: var(--muted);
  cursor: pointer;
  transition: color 160ms ease;
}

.footer-auth {
  font-weight: 600;
  color: var(--foreground);
}

@media (hover: hover) and (pointer: fine) {
  .footer-links a:hover,
  .footer-auth:hover {
    color: var(--primary);
  }
}

/* Small screens: stack the bar centered (links, then copyright). All seven
   links don't quite fit one line at 390px, so cap the nav width to force a
   balanced two-line wrap instead of a lone orphaned "Login". */
@media (max-width: 640px) {
  .footer-bar {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .footer-links {
    justify-content: center;
    gap: var(--space-2) var(--space-3);
    max-width: 300px;
  }
}
</style>
