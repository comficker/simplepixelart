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

:is(.widget, .tool-main) > .widget-head {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  border-bottom: 1px solid var(--border);
  /* Widget heads stack down a column, so one carrying a control has to line up
     with one that only carries a title. Left to content they came out 23px
     bare, 27px with a button group and 28.7px with a dropdown. Pinning the
     floor to the tallest of those makes every head identical. */
  min-height: 29px;
}

@media (pointer: coarse) and (max-width: 1023px) {
  /* controls grow to a 32px touch target there, so the floor grows with them */
  :is(.widget, .tool-main) > .widget-head {
    min-height: 41px;
  }
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
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.widget-body {
  padding: var(--space-2);
  background: var(--surface);
}
</style>