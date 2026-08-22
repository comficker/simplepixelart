<script setup lang="ts">
import { nextTick, ref } from 'vue'

interface Props {
  modelValue: string | undefined
  placeholder?: string
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Click to edit',
  className: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string],
  'changed': []
}>()

const isEditing = ref(false)
const textRef = ref<HTMLElement>()

function startEditing() {
  isEditing.value = true
  nextTick(() => {
    if (textRef.value) {
      textRef.value.focus()
      const range = document.createRange()
      range.selectNodeContents(textRef.value)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  })
}

function stopEditing() {
  if (textRef.value) {
    const newValue = textRef.value.textContent?.trim() || ''
    emit('update:modelValue', newValue)
  }
  emit('changed')
  isEditing.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    stopEditing()
  } else if (e.key === 'Escape') {
    isEditing.value = false
  }
}
</script>

<template>
  <div
    :class="[props.className, 'input']"
    @dblclick="startEditing"
    v-if="!isEditing"
    v-text="props.modelValue || props.placeholder"
  />
  <div
    ref="textRef"
    :class="[props.className, 'editable-text']"
    contenteditable
    @blur="stopEditing"
    @keydown="handleKeydown"
    v-else
    v-text="props.modelValue"
  />
</template>