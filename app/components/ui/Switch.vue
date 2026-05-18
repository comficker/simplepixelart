<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  disabled: false,
  size: 'md',
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: boolean): void
}>()

function toggle() {
  if (props.disabled) return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}
</script>

<template>
  <label class="ui-switch-wrapper" :class="[`size-${props.size}` , { disabled: props.disabled }]">
    <button
      type="button"
      class="ui-switch"
      role="switch"
      :aria-checked="String(props.modelValue)"
      :aria-disabled="String(!!props.disabled)"
      :class="{ on: props.modelValue }"
      :disabled="props.disabled"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="track" />
      <span class="thumb" />
    </button>
    <span class="label" v-if="$slots.default" @click.prevent="toggle"><slot /></span>
  </label>
  
</template>

<style scoped>
.ui-switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.ui-switch-wrapper.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ui-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  outline: none;
}

.ui-switch:focus-visible .track {
  box-shadow: 0 0 0 2px var(--primary);
}

.track {
  position: relative;
  display: block;
  background: var(--surface-2, #3a2560);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: background-color 0.15s ease;
}

.thumb {
  position: absolute;
  top: 0;
  left: 0;
  background: var(--foreground, #f5e6a8);
  border: 1px solid var(--border);
  border-radius: 999px;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Sizes */
.size-sm .track { width: 28px; height: 16px; }
.size-sm .thumb { width: 12px; height: 12px; }
.size-md .track { width: 36px; height: 20px; }
.size-md .thumb { width: 16px; height: 16px; }
.size-lg .track { width: 48px; height: 28px; }
.size-lg .thumb { width: 24px; height: 24px; }

/* ON state */
.ui-switch.on .track { background: var(--primary, #ffb800); }
.ui-switch.on .thumb { background: var(--primary-foreground, #1a1033); }
.size-sm .ui-switch.on .thumb { transform: translateX(12px); }
.size-md .ui-switch.on .thumb { transform: translateX(16px); }
.size-lg .ui-switch.on .thumb { transform: translateX(20px); }

.label { font-size: 14px; }
</style>
