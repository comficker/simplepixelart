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
    <div class="container">
      <div class="footer-links">
        <nuxt-link to="/about">About</nuxt-link>
        <nuxt-link to="/contact">Contact</nuxt-link>
        <nuxt-link to="/privacy">Privacy</nuxt-link>
        <nuxt-link to="/terms">Terms</nuxt-link>
        <nuxt-link to="/guidelines">Guidelines</nuxt-link>
        <nuxt-link to="/dmca">DMCA</nuxt-link>
        <span class="footer-sep">|</span>
        <span v-if="auth.isLogged" class="footer-auth" @click="auth.logout()">
          <span class="icon icon-x"/>
          <span>Logout</span>
        </span>
        <a v-else :href="googleAuthUrl" class="footer-auth">
          <span class="icon icon-social"/>
          <span>Login</span>
        </a>
      </div>
      <div class="h-center gap-1 footer-copy">
        <span>© {{ year }} SimplePixelArt.com</span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
footer .container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
}

.footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.footer-links a {
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .footer-links a:hover {
    color: var(--primary);
  }
}

.footer-sep {
  color: var(--border);
}

.footer-auth {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .footer-auth:hover {
    color: var(--primary);
  }
}

.footer-copy {
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  color: var(--foreground);
}
</style>