<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <div class="footer-left">
    <span class="footer-copy">© {{ year }} SimplePixelArt.com</span>
    <nav class="footer-links" aria-label="Footer">
      <nuxt-link to="/contact">Contact</nuxt-link>
      <nuxt-link to="/guidelines">Guidelines</nuxt-link>
      <nuxt-link to="/privacy">Privacy</nuxt-link>
      <nuxt-link to="/terms">Terms</nuxt-link>
    </nav>
  </div>
</template>

<style scoped>
.footer-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  min-width: 0;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
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

.footer-links a {
  display: inline-flex;
  align-items: center;
  color: var(--muted);
  transition: color var(--transition);
}

@media (pointer: coarse) {
  .footer-links a {
    min-height: 32px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .footer-links a:hover {
    color: var(--primary);
  }
}
</style>
