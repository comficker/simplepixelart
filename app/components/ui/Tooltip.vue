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
  background: var(--primary, #ffb800);
  color: var(--primary-foreground, #1a1033);
  border: 2px solid var(--shadow-px, #000);
  box-shadow: 3px 3px 0 0 var(--shadow-px, #000);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
}

/* Positions */
.tooltip-top {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-6px);
}

.tooltip-bottom {
  top: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(6px);
}

.tooltip-left {
  right: 100%;
  top: 50%;
  transform: translateX(-6px) translateY(-50%);
}

.tooltip-right {
  left: 100%;
  top: 50%;
  transform: translateX(6px) translateY(-50%);
}
</style>
