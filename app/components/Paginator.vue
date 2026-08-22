<script setup lang="ts">
const props = defineProps<{
  page: number
  pages: number
  prevTo?: string | null
  nextTo?: string | null
}>()

const emit = defineEmits<{ 'update:page': [n: number] }>()

const linkMode = computed(() => props.prevTo !== undefined || props.nextTo !== undefined)

function step(delta: number) {
  const next = props.page + delta
  if (next >= 1 && next <= props.pages) emit('update:page', next)
}
</script>

<template>
  <div v-if="pages > 1" class="paginator">
    <template v-if="linkMode">
      <CustomLink :to="prevTo" aria-label="Previous page">
        <span class="icon icon-angle-left"/>
      </CustomLink>
      <div>{{ page }}/{{ pages }}</div>
      <CustomLink :to="nextTo" aria-label="Next page">
        <span class="icon icon-angle-right"/>
      </CustomLink>
    </template>
    <template v-else>
      <a :href="page > 1 ? '#' : undefined" aria-label="Previous page" @click.prevent="step(-1)">
        <span class="icon icon-angle-left"/>
      </a>
      <div>{{ page }}/{{ pages }}</div>
      <a :href="page < pages ? '#' : undefined" aria-label="Next page" @click.prevent="step(1)">
        <span class="icon icon-angle-right"/>
      </a>
    </template>
  </div>
</template>
