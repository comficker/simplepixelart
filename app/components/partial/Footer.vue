<script setup lang="ts">
const year = new Date().getFullYear()
const config = useRuntimeConfig()
const auth = useAuthStore()
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
        <a v-else :href="`${config.public.api}/auth/google`" class="footer-auth">
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
@reference "tailwindcss";

footer .container {
  @apply flex flex-col items-center gap-3 py-6;
}

.footer-links {
  @apply flex flex-wrap gap-4 justify-center text-xs;
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
  @apply flex items-center gap-1 cursor-pointer;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .footer-auth:hover {
    color: var(--primary);
  }
}

.footer-copy {
  @apply text-xs;
  color: var(--foreground);
}
</style>