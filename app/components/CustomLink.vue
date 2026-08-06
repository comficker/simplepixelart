<script setup lang="ts">
const {to} = defineProps<{to?: string | null}>()
</script>

<template>
  <nuxt-link v-if="to" class="h-center underline" :to="to">
    <slot/>
  </nuxt-link>
  <a v-else class="h-center text-muted">
    <slot/>
  </a>
</template>