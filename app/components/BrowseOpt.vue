<script setup lang="ts">
defineProps<{
  active?: boolean
  to?: string
  disabled?: boolean
  count?: number | string | null
}>()

const NuxtLink = resolveComponent('NuxtLink')
</script>

<template>
  <component
      :is="to ? NuxtLink : 'button'"
      :to="to"
      :type="to ? undefined : 'button'"
      :disabled="to ? undefined : disabled"
      class="browse-opt"
      :class="{active}"
  >
    <span><slot/></span>
    <span v-if="count != null" class="browse-opt-count">{{ count }}</span>
    <span v-else-if="active" class="icon icon-check"/>
  </component>
</template>
