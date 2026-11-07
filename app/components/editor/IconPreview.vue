<script setup lang="ts">
// The icon preview mode: the board where an icon lives -- a browser tab and
// bookmark at 16px, a desktop shortcut at 32px, a phone home screen at 60px
// in the chosen mask. Smoothed like the OS scales it unless `crisp`.
import type {PreviewMeta} from '~/helper/previews'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  opts: PreviewMeta
}>()

const src = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
function refresh() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { src.value = props.art()?.toDataURL('image/png') || '' }, 120)
}
watch(() => props.rev, refresh)
onMounted(refresh)
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="icons" :class="[`theme-${opts.chatTheme}`, {crisp: opts.crisp}]">
    <div class="tabs">
      <div class="tab on"><img v-if="src" :src="src" alt="" width="16" height="16"><span>My site</span></div>
      <div class="tab"><span class="dot"/><span>Other</span></div>
    </div>
    <div class="bar"><img v-if="src" :src="src" alt="" width="16" height="16"><span>My site</span></div>
    <div class="home">
      <div class="app">
        <img v-if="src" :src="src" alt="" width="60" height="60" :class="`mask-${opts.iconShape}`">
        <span>My app</span>
      </div>
      <div class="app">
        <img v-if="src" :src="src" alt="" width="32" height="32">
        <span>32px</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.icons {
  position: absolute; inset: 0; overflow: auto; display: flex; flex-direction: column; gap: 8px;
  padding: 8px; font: 12px/1.3 system-ui, sans-serif; border-radius: var(--radius-sm);
}
.theme-dark { background: #202124; color: #e8eaed; --tab: #35363a; --bar: #2b2c2f; }
.theme-light { background: #f1f3f4; color: #202124; --tab: #ffffff; --bar: #ffffff; }
.icons img { display: inline-block; flex: none; }
.crisp img { image-rendering: pixelated; }
.tabs { display: flex; gap: 2px; }
.tab { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px 8px 0 0; min-width: 0; opacity: 0.7; }
.tab.on { background: var(--tab); opacity: 1; }
.tab span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 16px; height: 16px; border-radius: 50%; background: #9aa0a6; flex: none; }
.bar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 6px; background: var(--bar); width: fit-content; }
.home { display: flex; gap: 14px; align-items: flex-end; padding-top: 4px; }
.app { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; }
.mask-rounded { border-radius: 22%; }
.mask-circle { border-radius: 50%; }
</style>
