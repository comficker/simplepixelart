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
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.widget .widget-head {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  border-bottom: 1px solid var(--border);
}

.widget-head:empty {
  display: none;
}

.widget h2 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.widget-head .title {
  padding: 0;
  color: var(--muted);
  font-size: 10px;
  line-height: var(--text-xs-lh);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.widget-body {
  padding: var(--space-2);
  background: var(--surface);
}
</style>