<script setup lang="ts">
</script>

<template>
  <footer>
    <div class="container footer-bar">
      <PartialFooterBar/>
      <div class="footer-social"><PartialSocialAuth/></div>
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
  padding-top: 0;
  padding-bottom: 0;
}

/* Stacked, so it needs the vertical room the one-line desktop bar gets from
   its min-height -- without it the first row sat on the border above. */
@media (max-width: 1023px) {
  .footer-bar {
    gap: var(--space-3);
    padding-top: var(--space-4);
    padding-bottom: var(--space-4);
  }
}

@media (max-width: 640px) {
  .footer-bar {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
}
</style>
