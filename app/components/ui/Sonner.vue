<script lang="ts" setup>
import { Toaster } from "vue-sonner"
import 'vue-sonner/style.css'

const props = defineProps<{
  position?: string
}>()
</script>

<template>
  <Toaster
    class="toaster group"
    :position="(props.position as any) || 'bottom-right'"
    :expand="true"
    :rich-colors="false"
  />
</template>