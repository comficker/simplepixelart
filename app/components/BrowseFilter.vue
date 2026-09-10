<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string
  value?: string
  icon?: string
  active?: boolean
  open?: boolean
}>(), {open: true})

const open = ref(props.open)
</script>

<template>
  <section class="browse-filter" :class="{open}">
    <button
        type="button"
        class="browse-filter-btn"
        :class="{active}"
        :aria-expanded="open"
        @click="open = !open"
    >
      <span v-if="icon" class="icon" :class="icon"/>
      <span class="browse-filter-name">{{ label }}</span>
      <span class="browse-filter-val">{{ value }}</span>
      <span class="icon icon-chevron-down browse-filter-caret"/>
    </button>
    <div v-if="open" class="browse-filter-body">
      <slot/>
    </div>
  </section>
</template>
