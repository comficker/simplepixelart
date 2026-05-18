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
.tags {
  display: flex;
  flex-wrap: wrap;
  padding: 0 0.25rem;
  align-items: center;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
}

.tag-wrapper {
  padding: 0.25rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.25rem;
  background: var(--surface-2);
  color: var(--primary);
  border: 1px solid var(--border);
}

.remove-btn {
  margin-left: 0.25rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--secondary);
  background: none;
  border: none;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

@media (hover: hover) and (pointer: fine) {
  .remove-btn:hover {
    color: var(--primary);
  }
}

.tag-input-field {
  padding: 0 0.25rem;
  outline: none;
  background: var(--surface);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.tag-input-field:focus {
  border-color: var(--primary);
}

.add-tag-trigger {
  cursor: pointer;
  color: var(--muted);
}

@media (hover: hover) and (pointer: fine) {
  .add-tag-trigger:hover {
    color: var(--primary);
  }
}

.max-tags-warning {
  width: 100%;
  font-size: var(--text-xs);
  line-height: var(--text-xs-lh);
  font-style: italic;
  color: var(--muted);
}
</style>