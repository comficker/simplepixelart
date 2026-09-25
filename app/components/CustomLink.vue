<script setup lang="ts">
const {to} = defineProps<{to?: string | null}>()
</script>

<template>
  <NuxtLinkLocale v-if="to" class="h-center underline" :to="to">
    <slot/>
  </NuxtLinkLocale>
  <a v-else class="h-center text-muted">
    <slot/>
  </a>
</template>