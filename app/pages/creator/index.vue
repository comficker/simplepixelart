<script setup lang="ts">
useCustomSeoMeta({
  title: "Pixel Art Creators - Community Artists",
  description: "Discover talented pixel art creators on SimplePixelArt.com. Browse creator profiles and explore their pixel art portfolios.",
  keywords: "pixel art creators, pixel art artists, pixel art community, creator profiles",
  canonical: "https://simplepixelart.com/creator",
});
</script>

<template>
  <div class="page">
    <section>
      <h1 class="page-title">Pixel Art Creators</h1>
      <p class="text-muted">Discover artists from the SimplePixelArt.com community. Browse their portfolios and explore their pixel art creations.</p>
    </section>
    <item-list show-filter/>
  </div>
</template>
