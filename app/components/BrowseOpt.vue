<script setup lang="ts">
defineProps<{
  active?: boolean
  to?: string
  disabled?: boolean
  count?: number | string | null
}>()

// NuxtLinkLocale, not NuxtLink: every option here is a bare path, so on
// /ja/arts the tag and sort links dropped the visitor back onto the
// English URL.
const NuxtLinkLocale = resolveComponent('NuxtLinkLocale')
</script>

<template>
  <component
      :is="to ? NuxtLinkLocale : 'button'"
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
