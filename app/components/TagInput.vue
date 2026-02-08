<script setup lang="ts">
interface Props {
  modelValue: string[]
  placeholder?: string
  maxLength?: number
  maxTags?: number
  className?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Add tag...',
  maxLength: 20,
  maxTags: 10,
  className: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]],
  'changed': []
}>()

const inputRef = ref<HTMLInputElement>()
const inputValue = ref('')
const isEditing = ref(false)

function startEditing() {
  isEditing.value = true
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function stopEditing() {
  isEditing.value = false
  inputValue.value = ''
}

function addTag() {
  const tag = inputValue.value.trim()
  if (tag &&
      !props.modelValue.includes(tag) &&
      props.modelValue.length < props.maxTags &&
      tag.length <= props.maxLength) {
    emit('update:modelValue', [...props.modelValue, tag])
    inputValue.value = ''
    emit('changed')
  }
}

function removeTag(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
  emit('changed')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace') {
    if (!inputValue.value && props.modelValue.length > 0) {
      e.preventDefault()
      removeTag(props.modelValue.length - 1)
    }
  } else if (e.key === 'Escape') {
    stopEditing()
  }
}

function handleBlur() {
  if (inputValue.value.trim()) {
    addTag()
  } else {
    stopEditing()
  }
}
</script>

<template>
  <div :class="['tags', props.className]">
    <div
        v-for="(tag, index) in props.modelValue"
        :key="index"
        class="tag-wrapper"
    >
      <div class="tag">
        <span>{{ tag }}</span>
        <button @click="removeTag(index)" class="remove-btn" type="button">×</button>
      </div>
    </div>
    <div class="tag-wrapper" v-if="props.modelValue.length < props.maxTags">
      <input
          v-if="isEditing"
          ref="inputRef"
          v-model="inputValue"
          :placeholder="props.placeholder"
          :maxlength="props.maxLength"
          class="tag-input-field"
          @keydown="handleKeydown"
          @blur="handleBlur"
      />
      <span
          v-else
          class="add-tag-trigger"
          @click="startEditing"
      >+ {{ props.placeholder }}</span>
    </div>
    <div v-else class="tag-wrapper max-tags-warning">Max {{ props.maxTags }} tags</div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.tags {
  @apply flex flex-wrap px-1 items-center text-xs;
}

.tag-wrapper {
  @apply p-1;
}

.tag {
  @apply inline-flex items-center gap-1 px-1 py-0.5 bg-blue-100 text-blue-800 rounded-md;
}

.remove-btn {
  @apply ml-1 text-blue-600 hover:text-blue-800 font-bold cursor-pointer;
  background: none;
  border: none;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.tag-input-field {
  @apply px-1 border border-gray-300 outline-none focus:border-blue-500;
}

.add-tag-trigger {
  @apply text-gray-500 cursor-pointer hover:text-gray-700;
}

.max-tags-warning {
  @apply w-full text-gray-500 text-xs italic;
}
</style>