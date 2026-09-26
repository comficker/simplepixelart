<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <div class="footer-left">
    <span class="footer-copy">© {{ year }} SimplePixelArt.com</span>
    <nav class="footer-links" :aria-label="$t('c_FooterBar.footer')">
      <NuxtLinkLocale to="/contact">{{ $t('c_FooterBar.contact') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/guidelines">{{ $t('common.guidelines') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/privacy">{{ $t('c_FooterBar.privacy') }}</NuxtLinkLocale>
      <NuxtLinkLocale to="/terms">{{ $t('c_FooterBar.terms') }}</NuxtLinkLocale>
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

/* The bar centres itself at this width, but these are flex rows of their own
   and stayed hard left under a centred row of social links. */
@media (max-width: 640px) {
  .footer-left,
  .footer-links {
    justify-content: center;
  }
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
