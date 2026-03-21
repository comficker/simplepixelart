<script setup lang="ts">
const route = useRoute()
const collectionName = computed(() => {
  const slug = route.params.collection?.toString() || ''
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
})
</script>

<template>
  <div class="page">
    <section>
      <h1 class="h-center">
        <span class="icon icon-angle-right"/>
        <span>{{ collectionName }}</span>
      </h1>
    </section>
    <item-list show-filter/>
  </div>
</template>
