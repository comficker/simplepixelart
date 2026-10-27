<template>
  <Teleport to="body">
    <div class="share-overlay" @click.self="$emit('close')">
      <div
          ref="dialog"
          class="share-modal ui-modal"
          tabindex="-1"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? headingId : undefined"
          :aria-label="title ? undefined : (ariaLabel || $t('c_Modal.dialog'))"
          :style="width ? {maxWidth: width} : undefined"
          v-bind="$attrs"
      >
        <button class="ui-modal-x" :aria-label="$t('common.close')" :title="$t('common.close')" @click="$emit('close')">
          <span class="icon icon-x"/>
        </button>
        <div v-if="title || sub || $slots.sub" class="ui-modal-head">
          <h3 v-if="title" :id="headingId" class="publish-heading">{{ title }}</h3>
          <p v-if="sub" class="publish-sub">{{ sub }}</p>
          <slot name="sub"/>
        </div>
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
const dialog = ref<HTMLElement | null>(null)
// Focus moves into the dialog on open, Tab stays inside it, and goes back to
// whatever opened it on close — otherwise keyboard users land on <body>.
let opener: HTMLElement | null = null
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables() {
  return [...(dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) || [])].filter(el => el.offsetParent)
}

function onKey(e: KeyboardEvent) {
  if (modalStack[modalStack.length - 1] !== stackId) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Tab') {
    const els = focusables()
    if (!els.length) return
    const first = els[0], last = els[els.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || !dialog.value?.contains(at))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (at === last || !dialog.value?.contains(at))) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  modalStack.push(stackId)
  document.addEventListener('keydown', onKey)
  opener = document.activeElement as HTMLElement | null
  nextTick(() => {
    if (dialog.value?.contains(document.activeElement)) return
    const field = dialog.value?.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled])')
    ;(field || dialog.value)?.focus({preventScroll: true})
  })
})
onBeforeUnmount(() => {
  const i = modalStack.indexOf(stackId)
  if (i !== -1) modalStack.splice(i, 1)
  document.removeEventListener('keydown', onKey)
  if (opener?.isConnected) opener.focus({preventScroll: true})
})
</script>

<script lang="ts">
const modalStack: symbol[] = []
</script>

<style>

/* One rhythm for every dialog: head, then each block a step apart. Blocks
   keep no outer margins of their own, so no dialog drifts from the others. */
.ui-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.share-modal.ui-modal > * {
  margin-top: 0;
  margin-bottom: 0;
}

.ui-modal-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ui-modal-head > * {
  margin: 0;
}

.ui-modal:focus {
  outline: none;
}

/* Field labels read the same in every dialog, whichever panel's label class
   the form borrowed. */
.share-modal.ui-modal .tm-label,
.share-modal.ui-modal .cv-label,
.share-modal.ui-modal .si-label {
  font-size: var(--text-xs);
  letter-spacing: 0;
  text-transform: none;
}

.share-modal.ui-modal .tm-num-cap,
.share-modal.ui-modal .pp-mode-label,
.share-modal.ui-modal .pp-themes-label {
  letter-spacing: 0;
  text-transform: none;
}

.ui-modal-head .publish-heading {
  padding-right: calc(var(--space-6) + var(--space-3));
}

.ui-modal-x {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--space-6) + var(--space-2));
  height: calc(var(--space-6) + var(--space-2));
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.ui-modal-x .icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

@media (hover: hover) and (pointer: fine) {
  .ui-modal-x:hover {
    background: var(--surface-2);
    color: var(--foreground);
  }
}
</style>
