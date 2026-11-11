<script setup lang="ts">
/* "Get the Android app" as a card: after publishing, and on Your work for
   signed-in people (`dismissible`, hidden for good once closed). */
import {playUrl} from '~/helper/play'

const props = defineProps<{ spot: string; dismissible?: boolean }>()

const KEY = 'android_card_closed'
const closed = ref(props.dismissible)
onMounted(() => {
  if (!props.dismissible) return
  try { closed.value = !!localStorage.getItem(KEY) } catch { closed.value = false }
})

function close() {
  closed.value = true
  try { localStorage.setItem(KEY, '1') } catch {}
}
</script>

<template>
  <div v-if="!closed" class="android-card">
    <span class="icon icon-android android-card-ic" aria-hidden="true"/>
    <div class="android-card-copy">
      <strong class="android-card-title">{{ $t('c_AndroidApp.title') }}</strong>
      <span class="android-card-sub">{{ $t('c_AndroidApp.sub') }}</span>
    </div>
    <a :href="playUrl(spot)" target="_blank" rel="noopener" class="btn">{{ $t('c_AndroidApp.get') }}</a>
    <button v-if="dismissible" type="button" class="widget-ctl-btn" :aria-label="$t('common.close')" :title="$t('common.close')" @click="close">
      <span class="icon icon-close"/>
    </button>
  </div>
</template>

<style scoped>
.android-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.android-card-ic {
  flex-shrink: 0;
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: #3ddc84;
}

.android-card-copy {
  display: flex;
  flex: 1 1 12rem;
  flex-direction: column;
  min-width: 0;
}

.android-card-title {
  font-size: var(--text-sm);
}

.android-card-sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

/* Never squeeze the button's label; on a narrow row it wraps below. */
.android-card .btn {
  white-space: nowrap;
}
</style>
