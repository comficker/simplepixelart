<template>
  <div class="dropdown" :class="[{'active': open}, position]" ref="root">
    <div class="cursor-pointer" @click="toggle">
      <slot />
    </div>
    <div class="dropdown-menu">
      <slot name="menu" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps({
  position: {
    type: String,
    default: '',
  },
})

const open = ref(false)
const root = ref(null)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onClickOutside(e) {
  if (!root.value?.contains(e.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>