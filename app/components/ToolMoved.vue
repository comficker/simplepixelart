<script setup lang="ts">
const props = defineProps<{ to: string; name: string }>()
const route = useRoute()

useCustomSeoMeta({
  title: `${props.name} has moved`,
  description: `The ${props.name} has moved to ${props.to}.`,
  canonical: `https://simplepixelart.com${props.to}`,
  robots: 'noindex, follow',
})

onMounted(() => {
  const timer = setTimeout(() => navigateTo({path: props.to, query: route.query}), 2500)
  onBeforeUnmount(() => clearTimeout(timer))
})
</script>

<template>
  <div class="page">
    <div class="empty-state tool-moved">
      <span class="icon icon-move empty-state-icon"/>
      <h1 class="empty-state-title">{{ name }} has moved</h1>
      <p class="empty-state-body">
        This tool now lives at <code>{{ to }}</code>. Taking you there now…
      </p>
      <nuxt-link :to="{ path: to, query: route.query }" class="btn primary empty-state-action">
        Go to {{ name }}
      </nuxt-link>
    </div>
  </div>
</template>

<style scoped>
.tool-moved {
  margin-top: var(--space-4);
}

.tool-moved code {
  font-size: var(--text-sm);
  padding: 0 4px;
}
</style>
