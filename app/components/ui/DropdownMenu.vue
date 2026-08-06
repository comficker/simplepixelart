<template>
  <div
      class="dropdown"
      :class="[{ active: open }, position]"
      ref="root"
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
    <div
        class="dropdown-menu"
        ref="menuEl"
        role="menu"
        :aria-hidden="!open"
    >
      <slot name="menu"/>
    </div>
  </div>
</template>

<script setup>
import {ref, onMounted, onBeforeUnmount, nextTick, watch} from 'vue'

defineProps({
  position: {
    type: String,
    default: '',
  },
  // Accessible name for the (role=button) trigger — screen readers need it
  // since the trigger is icon-only.
  label: {
    type: String,
    default: '',
  },
})

const open = ref(false)
const root = ref(null)
const triggerEl = ref(null)
const menuEl = ref(null)

function getItems() {
  if (!menuEl.value) return []
  // Items are anything focusable inside the menu. We also auto-promote
  // .drop-item children to focusable when not already.
  const nodes = menuEl.value.querySelectorAll(
      '.drop-item, [role="menuitem"], a, button, [tabindex]:not([tabindex="-1"])'
  )
  return Array.from(nodes).filter(el => !el.hasAttribute('disabled') && !el.getAttribute('aria-disabled'))
}

function ensureItemsFocusable() {
  // Promote .drop-item nodes that lack tabindex.
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
  open.value = true
  await nextTick()
  ensureItemsFocusable()
  if (focusFirst) focusIndex(0)
}

function close({restoreFocus = true} = {}) {
  if (!open.value) return
  open.value = false
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
      // Close on tab-out for natural focus flow.
      close({restoreFocus: false})
      break
  }
}

function onClickOutside(e) {
  if (!root.value?.contains(e.target)) {
    open.value = false
  }
}

// When menu opens via click (mouse), still ensure items become focusable
// so subsequent keyboard nav works seamlessly.
watch(open, async (val) => {
  if (val) {
    await nextTick()
    ensureItemsFocusable()
  }
})

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
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
