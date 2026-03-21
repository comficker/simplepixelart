<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <div class="widget">
    <div class="widget-head">
      <h2 v-if="title" class="title">{{ title }}</h2>
      <slot name="ctl" v-if="$slots.ctl"/>
    </div>
    <div class="widget-body">
      <slot/>
    </div>
  </div>
</template>

<style>
@reference "tailwindcss";

.widget {
}

.widget .widget-head {
  @apply px-2 flex gap-4 justify-between;

  font-size: 10px;
}

.widget h2 {
  @apply flex justify-between items-center;
}

.widget-head .title {
  @apply px-4 py-0.5 rounded-t bg-gray-200 text-gray-800;
}

.widget-body {
  @apply p-2 border rounded-xs border-gray-200;
}
</style>