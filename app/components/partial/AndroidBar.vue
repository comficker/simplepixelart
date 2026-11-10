<script setup lang="ts">
/* A small bar at the bottom of the screen for Chrome on Android, pointing at
   the app on Google Play. Never a full-screen interstitial (Google penalises
   those); the cross hides it for good on this device. Not in the editors,
   whose own tools sit along the bottom. */
import {playUrl} from '~/helper/play'

const KEY = 'android_bar_closed'
const route = useRoute()
const eligible = ref(false)
const show = computed(() => eligible.value && !/editor/.test(route.path))

onMounted(() => {
  let closed = false
  try { closed = !!localStorage.getItem(KEY) } catch {}
  const ua = navigator.userAgent
  // Chrome itself: not a web view (the app's own included), not the other
  // Chromium browsers that carry "Chrome/" too.
  eligible.value = !closed && /Android/i.test(ua) && /Chrome\/\d/.test(ua)
      && !/; wv\)|SamsungBrowser|EdgA|OPR|YaBrowser|UCBrowser|MiuiBrowser/.test(ua)
})

function close() {
  eligible.value = false
  try { localStorage.setItem(KEY, '1') } catch {}
}
</script>

<template>
  <template v-if="show">
    <!-- Keeps the end of the page clear of the bar. -->
    <div class="android-bar-space" aria-hidden="true"/>
    <aside class="android-bar" :aria-label="$t('c_AndroidApp.title')">
      <img src="/images/google-play.svg" alt="" width="32" height="32" class="android-bar-logo">
      <span class="android-bar-copy">
        <strong class="android-bar-title">{{ $t('c_AndroidApp.title') }}</strong>
        <span class="android-bar-sub">{{ $t('c_AndroidApp.barSub') }}</span>
      </span>
      <a :href="playUrl('android_bar')" target="_blank" rel="noopener" class="btn primary android-bar-cta">{{ $t('c_AndroidApp.install') }}</a>
      <button type="button" class="android-bar-close" :aria-label="$t('common.close')" :title="$t('common.close')" @click="close">
        <span class="icon icon-close"/>
      </button>
    </aside>
  </template>
</template>

<style scoped>
.android-bar-space {
  height: calc(var(--space-4) * 4);
}

.android-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom)) var(--space-3);
  border-top: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 -4px 16px rgb(0 0 0 / 0.08);
}

.android-bar-logo {
  flex-shrink: 0;
}

.android-bar-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.android-bar-title,
.android-bar-sub {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.android-bar-title {
  font-size: var(--text-sm);
}

.android-bar-sub {
  font-size: var(--text-xs);
  color: var(--muted);
}

.android-bar-cta {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
}

.android-bar-close {
  display: inline-flex;
  flex-shrink: 0;
  padding: var(--space-2);
  color: var(--muted);
}
</style>
