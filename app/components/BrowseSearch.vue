<script setup lang="ts">
import {debounce} from "~/helper/utils";

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  delay?: number
}>(), {modelValue: '', placeholder: 'Search…', delay: 600})

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const onInput = debounce((e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value), props.delay)
</script>

<template>
  <label class="browse-search">
    <span class="icon icon-search" aria-hidden="true"/>
    <input
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        :aria-label="placeholder"
        @input="onInput"
    />
  </label>
</template>
