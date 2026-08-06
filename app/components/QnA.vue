<script setup lang="ts">
export interface QnAItem {
  q: string
  /** Answer as an HTML fragment (paragraphs, lists, links allowed). */
  a: string
}

withDefaults(defineProps<{
  items: QnAItem[]
  title?: string
  /** Right-side hint; pass "" to hide it. */
  hint?: string
}>(), {
  title: 'Frequently asked questions',
  hint: 'Tap a question to expand',
})
</script>

<template>
  <section class="learn-more">
    <header class="section-head">
      <h2 class="section-title">{{ title }}</h2>
      <span v-if="hint" class="section-link section-hint">{{ hint }}</span>
    </header>

    <div class="qa-list">
      <details v-for="(item, i) in items" :key="i" class="qa-item">
        <summary class="qa-q">
          <span class="qa-chevron" aria-hidden="true"/>
          <span class="qa-q-text">{{ item.q }}</span>
        </summary>
        <div class="qa-a" v-html="item.a"/>
      </details>
    </div>
  </section>
</template>

<style scoped>
/* Section header (matches the home "Questions & answers" block). The .qa-*
 * item styles live globally in main.css, shared by every consumer. */
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: 0.25rem;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xl);
  line-height: 1.2;
  font-weight: 800;
  font-variation-settings: "wght" 800;
  letter-spacing: -0.02em;
  color: var(--foreground);
}

.section-hint {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-size: var(--text-sm);
  line-height: 1;
  font-weight: 600;
  color: var(--muted);
}

/* Mobile: the hint would squeeze the title in the fixed row — hide it. */
@media (max-width: 640px) {
  .section-hint {
    display: none;
  }
}
</style>
