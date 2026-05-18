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
.widget {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
}

.widget .widget-head {
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  padding: 0 0.5rem;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.widget h2 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.widget-head .title {
  padding: 0 1rem;
  background: var(--widget-title-bg, color-mix(in oklab, var(--surface) 78%, #000));
  color: var(--widget-title-fg, var(--foreground));
  font-size: 10px;
  line-height: var(--text-xs-lh);
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.widget-body {
  padding: 0.375rem;
  background: var(--surface);
}

@media (min-width: 768px) {
  .widget-body {
    padding: 0.5rem;
  }
}
</style>