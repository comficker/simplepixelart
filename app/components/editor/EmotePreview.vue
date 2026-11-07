<script setup lang="ts">
// The emote preview mode: the board in a mock chat at the sizes the app
// really shows it -- Discord 22px inline, 48px alone, 16px as a reaction;
// Twitch 28px in chat with the 56 and 112px uploads. Apps smooth the scaling
// unless `crisp` asks to keep the pixels sharp.
import type {PreviewMeta} from '~/helper/previews'

const props = defineProps<{
  art: () => HTMLCanvasElement | null
  rev: number
  opts: PreviewMeta
}>()

const src = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
function refresh() {
  // toDataURL on every stroke is wasteful; a short debounce is enough.
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { src.value = props.art()?.toDataURL('image/png') || '' }, 120)
}
watch(() => props.rev, refresh)
onMounted(refresh)
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="emote" :class="[`chat-${opts.chat}`, `theme-${opts.chatTheme}`, {crisp: opts.crisp}]">
    <template v-if="opts.chat === 'discord'">
      <div class="msg">
        <span class="av"/>
        <div>
          <p class="who">pixelfan</p>
          <p class="line">nice one <img v-if="src" :src="src" alt="" width="22" height="22"></p>
        </div>
      </div>
      <div class="msg">
        <span class="av av2"/>
        <div>
          <p class="who">artist</p>
          <p class="line"><img v-if="src" :src="src" alt="" width="48" height="48"></p>
          <span class="react"><img v-if="src" :src="src" alt="" width="16" height="16"> 3</span>
        </div>
      </div>
    </template>
    <template v-else>
      <p class="line tw"><b>pixelfan</b>: GG <img v-if="src" :src="src" alt="" width="28" height="28"> <img v-if="src" :src="src" alt="" width="28" height="28"></p>
      <div class="sizes">
        <img v-if="src" :src="src" alt="" width="28" height="28">
        <img v-if="src" :src="src" alt="" width="56" height="56">
        <img v-if="src" :src="src" alt="" width="112" height="112">
      </div>
    </template>
  </div>
</template>

<style scoped>
.emote {
  position: absolute; inset: 0; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 10px;
  font: 13px/1.35 system-ui, sans-serif; border-radius: var(--radius-sm);
}
.theme-dark { background: #313338; color: #dbdee1; }
.theme-light { background: #ffffff; color: #313338; }
.chat-twitch.theme-dark { background: #18181b; color: #efeff1; }
.emote img { display: inline-block; vertical-align: middle; }
.crisp img { image-rendering: pixelated; }
.msg { display: flex; gap: 8px; align-items: flex-start; }
.av { flex: none; width: 24px; height: 24px; border-radius: 50%; background: #5865f2; }
.av2 { background: #23a55a; }
.who { font-weight: 600; font-size: 12px; margin: 0; }
.line { margin: 0; }
.react {
  display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 1px 6px; border-radius: 8px;
  font-size: 12px; background: rgba(88, 101, 242, 0.25); border: 1px solid #5865f2;
}
.tw b { color: #9147ff; }
.sizes { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
