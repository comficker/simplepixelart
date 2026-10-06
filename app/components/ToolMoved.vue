<script setup lang="ts">
const props = defineProps<{ to: string; name: string }>()
const route = useRoute()
const {t} = useI18n()
const localePath = useLocalePath()

useCustomSeoMeta({
  title: () => t('c_ToolMoved.xHasMoved', {name: props.name}),
  description: () => t('c_ToolMoved.theXHasMovedTo', {name: props.name, to: props.to}),
  canonical: `https://simplepixelart.com${props.to}`,
  robots: 'noindex, follow',
})

onMounted(() => {
  const timer = setTimeout(() => navigateTo(localePath({path: props.to, query: route.query})), 2500)
  onBeforeUnmount(() => clearTimeout(timer))
})
</script>

<template>
  <div class="page">
    <div class="empty-state tool-moved">
      <span class="icon icon-move empty-state-icon"/>
      <h1 class="empty-state-title">{{ $t('c_ToolMoved.xHasMoved', {name}) }}</h1>
      <p class="empty-state-body">
        {{ $t('c_ToolMoved.thisToolNowLivesAt') }} <code>{{ to }}</code>{{ $t('c_ToolMoved.takingYouThereNow') }} </p>
      <NuxtLinkLocale :to="{ path: to, query: route.query }" class="btn primary empty-state-action">
        {{ $t('c_ToolMoved.goToX', {name}) }}
      </NuxtLinkLocale>
    </div>
  </div>
</template>

<style scoped>
.tool-moved {
  margin-top: var(--space-4);
}

.tool-moved code {
  font-size: var(--text-sm);
  padding: 0 var(--space-1);
}
</style>
