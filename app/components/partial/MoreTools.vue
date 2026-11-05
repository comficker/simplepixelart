<script setup lang="ts">
// Our other grid-based tools, at the end of every readme. Plain followed
// links: sister sites of one owner, the way such networks link each other.
const FAMILY = [
  {href: 'https://easybeadpattern.com/', name: 'EasyBeadPattern', key: 'c_MoreTools.beads'},
  {href: 'https://freegraphpaper.net/', name: 'FreeGraphPaper', key: 'c_MoreTools.graphPaper'},
]
</script>

<template>
  <h2>{{ $t('c_MoreTools.title') }}</h2>
  <ul>
    <li v-for="l in FAMILY" :key="l.href">
      <a :href="l.href" target="_blank" rel="noopener">{{ l.name }}</a> — {{ $t(l.key) }}
    </li>
  </ul>
</template>
