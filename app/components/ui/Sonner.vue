<script lang="ts" setup>
import { Toaster } from "vue-sonner"

const props = defineProps()
</script>

<template>
  <Toaster
    class="toaster group"
    v-bind="props"
    :style="{
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
    }"
  />
</template>