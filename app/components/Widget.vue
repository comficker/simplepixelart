<script setup lang="ts">
// `to` makes the title itself the link, so the row's own name is the anchor
// text rather than a generic "View all".
defineProps<{ title?: string, to?: string }>()
</script>

<template>
  <div class="widget">
    <div class="widget-head">
      <h2 v-if="title" class="title">
        <NuxtLinkLocale v-if="to" :to="to" class="title-link">{{ title }}</NuxtLinkLocale>
        <template v-else>{{ title }}</template>
      </h2>
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
}

.title-link {
  color: inherit;
  transition: color var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .title-link:hover {
    color: var(--primary);
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
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.widget-body {
  padding: var(--space-2);
  background: var(--surface);
}
</style>