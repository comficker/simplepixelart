<script setup lang="ts">
// The studio's other sites: a quiet line at the foot of every readme, in the
// footer's own type, not a promo block. Names only, so they read as a
// credit rather than an ad.
const FAMILY = [
  {href: 'https://easybeadpattern.com/', name: 'EasyBeadPattern'},
  {href: 'https://freegraphpaper.net/', name: 'FreeGraphPaper'},
]
</script>

<template>
  <p class="more-tools">
    <span>Ninosaur</span>
    <a v-for="l in FAMILY" :key="l.href" :href="l.href" target="_blank" rel="noopener">{{ l.name }}</a>
  </p>
</template>

<style scoped>
.more-tools {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
  color: var(--muted);
}

.more-tools a {
  color: var(--muted);
  text-decoration: none;
  transition: color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .more-tools a:hover {
    color: var(--primary);
  }
}
</style>
