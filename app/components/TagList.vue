<script setup lang="ts">
export interface TagItem {
  label: string
  to: string
  count?: number
}

defineProps<{ items: TagItem[] }>()
</script>

<template>
  <div class="tag-list">
    <nuxt-link
        v-for="(t, i) in items"
        :key="i"
        :to="t.to"
        class="tag-list-item"
    >
      <span>{{ t.label }}</span>
      <span v-if="t.count != null" class="tag-list-count">{{ t.count }}</span>
    </nuxt-link>
  </div>
</template>

<style scoped>
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.tag-list-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 9px;
  padding: 3px 16px 3px 20px;
  white-space: nowrap;
  background: var(--surface-2);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: -0.005em;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  transition: background 160ms ease, color 160ms ease;
}

.tag-list-item::before {
  content: "";
  position: absolute;
  left: -9px;
  top: 0;
  bottom: 0;
  width: 9px;
  background: inherit;
  clip-path: polygon(100% 0, 100% 100%, 0 50%);
}

.tag-list-item::after {
  content: "";
  position: absolute;
  left: 6px;
  top: 50%;
  width: 4px;
  height: 4px;
  margin-top: -2px;
  border-radius: 50%;
  background: var(--surface);
}

.tag-list-count {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .tag-list-item:hover {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .tag-list-item:hover .tag-list-count {
    color: var(--primary-foreground);
  }
}
</style>
