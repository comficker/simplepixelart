<template>
  <Teleport to="body">
    <div class="share-overlay" @click.self="$emit('close')">
      <div
          class="share-modal ui-modal"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? headingId : undefined"
          :aria-label="title ? undefined : (ariaLabel || 'Dialog')"
          :style="width ? {maxWidth: width} : undefined"
          v-bind="$attrs"
      >
        <button class="ui-modal-x" aria-label="Close" title="Close" @click="$emit('close')">
          <span class="icon icon-x"/>
        </button>
        <h3 v-if="title" :id="headingId" class="publish-heading">{{ title }}</h3>
        <p v-if="sub" class="publish-sub">{{ sub }}</p>
        <slot/>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineOptions({inheritAttrs: false})
defineProps<{ title?: string; sub?: string; width?: string; ariaLabel?: string }>()
const emit = defineEmits<{ close: [] }>()

const headingId = useId()

const stackId = Symbol('ui-modal')

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && modalStack[modalStack.length - 1] === stackId) {
    e.stopPropagation()
    emit('close')
  }
}

onMounted(() => {
  modalStack.push(stackId)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  const i = modalStack.indexOf(stackId)
  if (i !== -1) modalStack.splice(i, 1)
  document.removeEventListener('keydown', onKey)
})
</script>

<script lang="ts">
const modalStack: symbol[] = []
</script>

<style>

.ui-modal {
  position: relative;
}

.ui-modal .publish-heading {
  padding-right: 2rem;
}

.ui-modal-x {
  position: absolute;
  top: 0.875rem;
  right: 0.875rem;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.ui-modal-x .icon {
  width: 16px;
  height: 16px;
}

@media (hover: hover) and (pointer: fine) {
  .ui-modal-x:hover {
    background: var(--surface-2);
    color: var(--foreground);
  }
}
</style>
