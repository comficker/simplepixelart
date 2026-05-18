<template>
  <div
      class="tooltip-wrapper"
      @mouseenter="onEnter"
      @mouseleave="show = false"
      @focus="onEnter"
      @blur="show = false"
      tabindex="0"
  >
    <slot />
    <div
        v-if="show"
        class="tooltip"
        :class="`tooltip-${position}`"
    >
      <slot name="content">{{ text }}</slot>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  position: {
    type: String,
    default: 'top', // top | bottom | left | right
  },
  text: {
    type: String,
    default: '',
  },
})

const show = ref(false)

function onEnter() {
  // Skip tooltips on touch devices
  if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return
  show.value = true
}
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
}

.tooltip {
  position: absolute;
  background: var(--foreground);
  color: var(--background);
  border-radius: var(--radius-sm, 4px);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.12),
    0 6px 16px -4px rgba(0, 0, 0, 0.18);
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  animation: tipIn 140ms cubic-bezier(.22,.61,.36,1);
}

.tooltip::after {
  content: "";
  position: absolute;
  width: 7px;
  height: 7px;
  background: var(--foreground);
  transform: rotate(45deg);
}

@keyframes tipIn {
  from { opacity: 0; transform: var(--tip-from, translateX(-50%) translateY(-2px)) scale(0.94); }
  to   { opacity: 1; }
}

/* Positions */
.tooltip-top {
  --tip-from: translateX(-50%) translateY(-2px);
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
}
.tooltip-top::after {
  bottom: -3px;
  left: 50%;
  margin-left: -3.5px;
}

.tooltip-bottom {
  --tip-from: translateX(-50%) translateY(2px);
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
}
.tooltip-bottom::after {
  top: -3px;
  left: 50%;
  margin-left: -3.5px;
}

.tooltip-left {
  --tip-from: translateX(-2px) translateY(-50%);
  right: 100%;
  top: 50%;
  transform: translateX(-8px) translateY(-50%);
}
.tooltip-left::after {
  right: -3px;
  top: 50%;
  margin-top: -3.5px;
}

.tooltip-right {
  --tip-from: translateX(2px) translateY(-50%);
  left: 100%;
  top: 50%;
  transform: translateX(8px) translateY(-50%);
}
.tooltip-right::after {
  left: -3px;
  top: 50%;
  margin-top: -3.5px;
}
</style>
