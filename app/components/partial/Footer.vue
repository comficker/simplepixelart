<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <footer>
    <div class="container">
      <div class="footer-links">
        <nuxt-link to="/about">About</nuxt-link>
        <nuxt-link to="/privacy">Privacy Policy</nuxt-link>
        <nuxt-link to="/terms">Terms of Service</nuxt-link>
        <a href="mailto:comficker@gmail.com">Contact</a>
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
  @apply text-gray-500 hover:text-gray-800;
}

.footer-copy {
  @apply text-xs text-gray-600;
}
</style>