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

function focusInput() {
  inputRef.value?.focus()
}

function addTag() {
  const tag = inputValue.value.trim()
  if (tag &&
      !props.modelValue.includes(tag) &&
      props.modelValue.length < props.maxTags &&
      tag.length <= props.maxLength) {
    emit('update:modelValue', [...props.modelValue, tag])
    emit('changed')
  }
  inputValue.value = ''
}

function removeTag(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
  emit('changed')
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Backspace' && !inputValue.value && props.modelValue.length > 0) {
    e.preventDefault()
    removeTag(props.modelValue.length - 1)
  }
}

function handleBlur() {
  if (inputValue.value.trim()) addTag()
}
</script>

<template>
  <div :class="['tag-box', props.className]" @click="focusInput">
    <span v-for="(tag, index) in props.modelValue" :key="index" class="tag-chip">
      <span class="tag-chip-text">{{ tag }}</span>
      <button class="tag-chip-x" type="button" aria-label="Remove tag" @click.stop="removeTag(index)">×</button>
    </span>
    <input
        v-if="props.modelValue.length < props.maxTags"
        ref="inputRef"
        v-model="inputValue"
        :placeholder="props.modelValue.length ? '' : props.placeholder"
        :maxlength="props.maxLength"
        class="tag-field"
        @keydown="handleKeydown"
        @blur="handleBlur"
    />
    <span v-else class="tag-max">Max {{ props.maxTags }} tags</span>
  </div>
</template>

<style scoped>
.tag-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 2.25rem;
  padding: 5px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: text;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.tag-box:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 25%, transparent);
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0 0.125rem 0 0.5rem;
  height: 1.5rem;
  font-size: var(--text-xs);
  line-height: 1;
  color: var(--primary);
  background: color-mix(in oklab, var(--primary) 12%, var(--surface));
  border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border));
  border-radius: var(--radius-pill);
}

.tag-chip-text {
  white-space: nowrap;
}

.tag-chip-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 15px;
  line-height: 1;
  border-radius: var(--radius-pill);
  transition: color var(--transition), background var(--transition);
}

@media (hover: hover) and (pointer: fine) {
  .tag-chip-x:hover {
    color: var(--primary);
    background: color-mix(in oklab, var(--primary) 18%, transparent);
  }
}

.tag-field {
  flex: 1;
  min-width: 90px;
  height: 1.5rem;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-xs);
  font-family: inherit;
}

.tag-field::placeholder {
  color: var(--muted);
}

.tag-max {
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--muted);
}
</style>
