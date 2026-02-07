<template>
  <div
      class="tooltip-wrapper"
      @mouseenter="show = true"
      @mouseleave="show = false"
      @focus="show = true"
      @blur="show = false"
      tabindex="0"
  >
    <slot />
    <div
        v-if="show"
        class="tooltip"
        :class="`tooltip-${position}`"
    >
      <slot name="content" />
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
})

const show = ref(false)
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
}

.tooltip {
  position: absolute;
  background: #111;
  color: white;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 6px;
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
