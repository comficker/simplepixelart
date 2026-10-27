<script setup lang="ts">
const {options, settle} = useConfirm()
</script>

<template>
  <UiModal v-if="options" :title="options.title" :sub="options.message" @close="settle(false)">
    <div class="publish-actions">
      <button class="btn block" @click="settle(false)">{{ $t('common.cancel') }}</button>
      <button class="btn block" :class="options.danger ? 'confirm-danger' : 'primary'" @click="settle(true)">
        {{ options.confirmText || $t('common.confirm') }}
      </button>
    </div>
  </UiModal>
</template>

<style>
/* Same fill as the editor's delete confirm. */
.btn.confirm-danger {
  color: var(--danger-foreground);
  background: var(--danger);
  border-color: var(--danger);
}

@media (hover: hover) and (pointer: fine) {
  .btn.confirm-danger:hover {
    color: var(--danger-foreground);
    background: var(--danger);
    opacity: 0.9;
  }
}
</style>
