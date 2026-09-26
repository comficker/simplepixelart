<script setup lang="ts">
const sync = useLocalSync()
</script>

<template>
  <UiModal
      v-if="sync.open.value"
      :title="$t('c_SyncPrompt.syncYourWork')"
      :sub="$t('c_SyncPrompt.madeWhileSignedOut', {count: sync.total.value})"
      @close="sync.dismiss()"
  >
    <div class="share-stack">
      <p v-if="sync.busy.value" class="sync-progress" role="status" aria-live="polite">
        {{ $t('c_SyncPrompt.uploading', {done: sync.done.value, total: sync.total.value}) }}
      </p>
      <button class="btn primary wide" :disabled="sync.busy.value" @click="sync.accept()">
        <span class="icon icon-upload"/>
        <span>{{ sync.busy.value ? $t('c_SyncPrompt.uploadingShort') : $t('c_SyncPrompt.uploadThem') }}</span>
      </button>
      <button class="share-dismiss" :disabled="sync.busy.value" @click="sync.dismiss()">
        {{ $t('c_SyncPrompt.keepThemOnThisDevice') }}
      </button>
    </div>
  </UiModal>
</template>

<style scoped>
.sync-progress {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  text-align: center;
}
</style>
