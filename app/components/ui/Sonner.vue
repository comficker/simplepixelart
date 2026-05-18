<script lang="ts" setup>
import { Toaster } from "vue-sonner"
import 'vue-sonner/style.css'

const props = defineProps<{
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
}>()
</script>

<template>
  <Toaster
    class="toaster group"
    :position="props.position || 'bottom-right'"
    :expand="true"
    :rich-colors="false"
  />
</template>
