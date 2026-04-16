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
  @apply px-4 py-0.5;
  background: var(--primary);
  color: var(--primary-foreground);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.widget-body {
  @apply p-1.5 md:p-2;
  border: 2px solid var(--border);
  background: var(--surface);
}
</style>