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
  <!-- The editor's widget chrome (.widget / .widget-head / .title /
       .widget-body), flattened by .browse-filters. -->
  <section class="widget browse-filter" :class="{open}">
    <button
        type="button"
        class="widget-head browse-filter-head"
        :class="{active}"
        :aria-expanded="open"
        @click="open = !open"
    >
      <span class="title">{{ label }}</span>
      <span class="browse-filter-val">{{ value }}</span>
      <span class="icon icon-chevron-down browse-filter-caret"/>
    </button>
    <div v-if="open" class="widget-body browse-filter-body">
      <slot/>
    </div>
  </section>
</template>
