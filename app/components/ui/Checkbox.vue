<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
  disabled?: boolean
  label?: string
  size?: 'sm' | 'md' | 'lg'
  id?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

const autoId = useId?.() ?? `cb-${Math.random().toString(36).slice(2, 9)}`
const inputId = computed(() => props.id || autoId)
const size = computed(() => props.size || 'md')

function onChange(e: Event) {
  if (props.disabled) return
  const next = (e.target as HTMLInputElement).checked
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <label
      :for="inputId"
      class="ui-checkbox"
      :class="[`ui-checkbox-${size}`, { 'is-disabled': disabled, 'is-checked': modelValue }]"
  >
    <input
        :id="inputId"
        type="checkbox"
        class="ui-checkbox-input"
        :checked="modelValue"
        :disabled="disabled"
        @change="onChange"
    >
    <span class="ui-checkbox-box" aria-hidden="true">
      <svg
          class="ui-checkbox-tick"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
      >
        <polyline points="3.5,8.5 6.8,11.6 12.5,5.2"/>
      </svg>
    </span>
    <span v-if="label || $slots.default" class="ui-checkbox-label">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<style scoped>
.ui-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  user-select: none;
  font-size: var(--text-sm);
  line-height: 1.3;
  color: var(--foreground);
  -webkit-tap-highlight-color: transparent;
}

.ui-checkbox.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ui-checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.ui-checkbox-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid var(--border);
  background: var(--background);
  border-radius: var(--radius-sm, 4px);
  box-shadow: inset 0 0 0 0 var(--primary);
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease,
    transform 160ms cubic-bezier(.34,1.56,.64,1);
}

.ui-checkbox-sm .ui-checkbox-box { width: 16px; height: 16px; }
.ui-checkbox-lg .ui-checkbox-box { width: 22px; height: 22px; }

.ui-checkbox-tick {
  width: 70%;
  height: 70%;
  color: var(--primary-foreground);
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(.34,1.56,.64,1);
}

.ui-checkbox.is-checked .ui-checkbox-box {
  border-color: var(--primary);
  background: var(--primary);
}

.ui-checkbox.is-checked .ui-checkbox-tick {
  opacity: 1;
  transform: scale(1);
}

@media (hover: hover) and (pointer: fine) {
  .ui-checkbox:not(.is-disabled):hover .ui-checkbox-box {
    border-color: var(--primary);
  }
}

.ui-checkbox-input:focus-visible + .ui-checkbox-box {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.ui-checkbox:not(.is-disabled):active .ui-checkbox-box {
  transform: scale(0.92);
}

.ui-checkbox-label {
  font-weight: 500;
}
</style>
