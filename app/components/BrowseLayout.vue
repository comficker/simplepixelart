<script setup lang="ts">
defineProps<{ title: string; desc?: string }>()

const sheetOpen = ref(false)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') sheetOpen.value = false
}

watch(sheetOpen, (open) => {
  if (typeof document === 'undefined') return
  if (open) document.addEventListener('keydown', onKey)
  else document.removeEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="browse" :class="{'sheet-open': sheetOpen}">
    <div class="screen-head">
      <div class="screen-head-text">
        <h1 v-if="title" class="screen-title">{{ title }}</h1>
        <p v-if="desc" class="screen-desc">{{ desc }}</p>
      </div>
      <div class="screen-actions">
        <slot name="actions"/>
        <button type="button" class="btn browse-filters-open" @click="sheetOpen = true">
          <span class="icon icon-adjust"/>
          <span>Filters</span>
        </button>
      </div>
    </div>

    <div class="browse-scrim" aria-hidden="true" @click="sheetOpen = false"/>

    <aside class="browse-filters" aria-label="Filters">
      <div class="browse-filters-head">
        <span class="browse-filter-cap">Filters</span>
        <button
            type="button"
            class="widget-ctl-btn"
            aria-label="Close filters"
            title="Close filters"
            @click="sheetOpen = false"
        >
          <span class="icon icon-close"/>
        </button>
      </div>
      <slot name="filters"/>
    </aside>

    <div class="browse-results">
      <div class="browse-content">
        <slot/>
      </div>
      <div v-if="$slots.foot" class="browse-foot">
        <slot name="foot"/>
      </div>
    </div>
  </div>
</template>
