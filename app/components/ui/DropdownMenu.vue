<template>
  <div
      class="dropdown"
      :class="[{ active: open }, position]"
      ref="root"
      v-bind="attrs"
      @keydown="onKeydown"
  >
    <div
        class="dropdown-trigger-wrap cursor-pointer"
        ref="triggerEl"
        role="button"
        tabindex="0"
        :aria-label="label || undefined"
        :aria-haspopup="true"
        :aria-expanded="open"
        @click="toggle"
        @keydown.enter.prevent="openMenu()"
        @keydown.space.prevent="openMenu()"
        @keydown.down.prevent="openMenu()"
    >
      <slot/>
    </div>

    <Teleport v-if="mounted" to="body">
      <div
          class="dropdown dd-ghost"
          :class="[{ active: open }, position, attrs.class]"
          :style="ghostStyle"
          @keydown="onKeydown"
      >
        <div
            class="dropdown-menu"
            ref="menuEl"
            role="menu"
            :aria-hidden="!open"
            @click="onMenuClick"
        >
          <slot name="menu"/>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import {ref, computed, onMounted, onBeforeUnmount, nextTick, watch, useAttrs} from 'vue'

defineOptions({inheritAttrs: false})

defineProps({
  position: {
    type: String,
    default: '',
  },
  label: {
    type: String,
    default: '',
  },
})

const attrs = useAttrs()
const open = ref(false)
const mounted = ref(false)
const root = ref(null)
const triggerEl = ref(null)
const menuEl = ref(null)

const rect = ref({left: 0, top: 0, width: 0, height: 0})

const ghostStyle = computed(() => ({
  position: 'fixed',
  left: `${rect.value.left}px`,
  top: `${rect.value.top}px`,
  width: `${rect.value.width}px`,
  height: `${rect.value.height}px`,
  zIndex: 10001,
  pointerEvents: 'none',
}))

function syncRect() {
  const el = triggerEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  rect.value = {left: r.left, top: r.top, width: r.width, height: r.height}
}

function bindTracking(on) {
  if (typeof window === 'undefined') return
  const fn = on ? window.addEventListener : window.removeEventListener
  fn.call(window, 'scroll', syncRect, true)
  fn.call(window, 'resize', syncRect)
}

function getItems() {
  if (!menuEl.value) return []
  const nodes = menuEl.value.querySelectorAll(
      '.drop-item, [role="menuitem"], a, button, [tabindex]:not([tabindex="-1"])'
  )
  return Array.from(nodes).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-disabled'))
}

function ensureItemsFocusable() {
  if (!menuEl.value) return
  menuEl.value.querySelectorAll('.drop-item').forEach(el => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    if (!el.hasAttribute('role')) el.setAttribute('role', 'menuitem')
  })
}

function focusIndex(i) {
  const items = getItems()
  if (!items.length) return
  const idx = (i + items.length) % items.length
  items[idx].focus()
}

function currentIndex() {
  const items = getItems()
  return items.findIndex(el => el === document.activeElement)
}

async function openMenu(focusFirst = true) {
  if (open.value) return
  syncRect()
  open.value = true
  bindTracking(true)
  await nextTick()
  ensureItemsFocusable()
  if (focusFirst) focusIndex(0)
}

function close({restoreFocus = true} = {}) {
  if (!open.value) return
  open.value = false
  bindTracking(false)
  if (restoreFocus) triggerEl.value?.focus()
}

function toggle() {
  if (open.value) close({restoreFocus: false})
  else openMenu(false)
}

function onKeydown(e) {
  if (!open.value) return
  switch (e.key) {
    case 'Escape':
      e.preventDefault()
      close()
      break
    case 'ArrowDown':
      e.preventDefault()
      focusIndex(currentIndex() + 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      focusIndex(currentIndex() - 1)
      break
    case 'Home':
      e.preventDefault()
      focusIndex(0)
      break
    case 'End':
      e.preventDefault()
      focusIndex(getItems().length - 1)
      break
    case 'Tab':
      close({restoreFocus: false})
      break
  }
}

function onClickOutside(e) {
  if (!root.value?.contains(e.target) && !menuEl.value?.contains(e.target)) {
    if (open.value) bindTracking(false)
    open.value = false
  }
}

function onMenuClick(e) {
  if (e.target?.closest?.('[data-keep-open]')) return
  close({restoreFocus: false})
}

watch(open, async (val) => {
  if (val) {
    await nextTick()
    ensureItemsFocusable()
  }
})

onMounted(() => {
  mounted.value = true
  syncRect()
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  bindTracking(false)
})

defineExpose({open: openMenu, close, toggle})
</script>

<style scoped>
.dropdown-trigger-wrap {
  display: inline-flex;
  border-radius: var(--radius-sm, 4px);
}

.dropdown-trigger-wrap:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
