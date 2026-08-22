<template>
  <div
      ref="wrap"
      class="tooltip-wrapper"
      @mouseenter="onEnter"
      @mouseleave="show = false"
      @mousedown="show = false"
      @focus="onFocus"
      @blur="show = false"
      tabindex="0"
  >
    <slot />
    <Teleport to="body">
      <div
          v-if="show"
          class="tooltip"
          :class="`tooltip-${position}`"
          :style="{left: `${pt.x}px`, top: `${pt.y}px`}"
      >
        <slot name="content">{{ text }}</slot>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
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
const wrap = ref(null)
const pt = ref({ x: 0, y: 0 })

function onFocus() {
  if (wrap.value && !wrap.value.matches(':focus-visible')) return
  onEnter()
}

function onEnter() {
  if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return
  const r = wrap.value?.getBoundingClientRect()
  if (!r) return
  pt.value = props.position === 'bottom' ? { x: r.left + r.width / 2, y: r.bottom }
      : props.position === 'left' ? { x: r.left, y: r.top + r.height / 2 }
          : props.position === 'right' ? { x: r.right, y: r.top + r.height / 2 }
              : { x: r.left + r.width / 2, y: r.top }
  show.value = true
}
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
}

.tooltip {
  position: fixed;
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

  width: max-content;
  max-width: min(260px, 80vw);
  white-space: normal;
  text-align: center;
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
  from { opacity: 0; transform: var(--tip-from) scale(0.94); }
  to   { opacity: 1; }
}

.tooltip-top {
  --tip-from: translate(-50%, -100%) translateY(-6px);
  transform: translate(-50%, -100%) translateY(-8px);
}
.tooltip-top::after {
  bottom: -3px;
  left: 50%;
  margin-left: -3.5px;
}

.tooltip-bottom {
  --tip-from: translate(-50%, 0) translateY(6px);
  transform: translate(-50%, 0) translateY(8px);
}
.tooltip-bottom::after {
  top: -3px;
  left: 50%;
  margin-left: -3.5px;
}

.tooltip-left {
  --tip-from: translate(-100%, -50%) translateX(-6px);
  transform: translate(-100%, -50%) translateX(-8px);
}
.tooltip-left::after {
  right: -3px;
  top: 50%;
  margin-top: -3.5px;
}

.tooltip-right {
  --tip-from: translate(0, -50%) translateX(6px);
  transform: translate(0, -50%) translateX(8px);
}
.tooltip-right::after {
  left: -3px;
  top: 50%;
  margin-top: -3.5px;
}
</style>
