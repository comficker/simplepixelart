<script setup lang="ts">
// Preview settings: which way the preview panel shows the board, and that
// mode's options. Changes apply live; the board keeps them (meta.preview).
import type {PreviewMeta, PreviewMode} from '~/helper/previews'

const props = defineProps<{
  opts: PreviewMeta
  modes: PreviewMode[]
}>()
const emit = defineEmits<{ update: [Partial<PreviewMeta>]; reset: []; close: [] }>()
const {t} = useI18n()

const set = (patch: Partial<PreviewMeta>) => emit('update', patch)
const k = (s: string) => t(`c_PreviewSettings.${s}`)
</script>

<template>
  <UiModal :title="k('title')" width="calc(var(--space-6, 0.9375rem) * 22)" @close="emit('close')">
    <div class="ps">
      <section class="ps-row">
        <label class="ps-label">{{ k('mode') }}</label>
        <div class="tm-seg ps-seg">
          <button v-for="m in modes" :key="m.id" type="button" :class="{active: opts.mode === m.id}" @click="set({mode: m.id})">
            {{ k('mode_' + m.id) }}
          </button>
        </div>
      </section>

      <!-- The emote mock brings its own chat background. -->
      <section v-if="opts.mode !== 'emote'" class="ps-row">
        <label class="ps-label">{{ k('background') }}</label>
        <div class="ps-inline">
          <div class="tm-seg ps-seg">
            <button v-for="b in ['none', 'checker', 'color']" :key="b" type="button" :class="{active: opts.bg === b}" @click="set({bg: b as any})">
              {{ k('bg_' + b) }}
            </button>
          </div>
          <input v-if="opts.bg === 'color'" type="color" class="ps-color" :value="opts.bgColor" @input="set({bgColor: ($event.target as HTMLInputElement).value.toUpperCase()})">
        </div>
      </section>

      <template v-if="opts.mode === 'flat'">
        <section class="ps-row">
          <label class="ps-label">{{ k('pixelPerfect') }}</label>
          <UiSwitch size="sm" :model-value="opts.pixelPerfect" @change="v => set({pixelPerfect: v})"/>
        </section>
      </template>

      <template v-if="opts.mode === 'tiled'">
        <section class="ps-row">
          <label class="ps-label">{{ k('repeat') }}</label>
          <div class="tm-seg ps-seg">
            <button v-for="n in [2, 3, 4, 6]" :key="n" type="button" :class="{active: opts.repeat === n}" @click="set({repeat: n})">{{ n }}×{{ n }}</button>
          </div>
        </section>
      </template>

      <template v-if="opts.mode === 'emote'">
        <section class="ps-row">
          <label class="ps-label">{{ k('chat') }}</label>
          <div class="tm-seg ps-seg">
            <button type="button" :class="{active: opts.chat === 'discord'}" @click="set({chat: 'discord'})">Discord</button>
            <button type="button" :class="{active: opts.chat === 'twitch'}" @click="set({chat: 'twitch'})">Twitch</button>
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('chatTheme') }}</label>
          <div class="tm-seg ps-seg">
            <button type="button" :class="{active: opts.chatTheme === 'dark'}" @click="set({chatTheme: 'dark'})">{{ k('themeDark') }}</button>
            <button type="button" :class="{active: opts.chatTheme === 'light'}" @click="set({chatTheme: 'light'})">{{ k('themeLight') }}</button>
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('crisp') }}</label>
          <UiSwitch size="sm" :model-value="opts.crisp" @change="v => set({crisp: v})"/>
        </section>
        <p class="text-2xs text-muted">{{ k('emoteHint') }}</p>
      </template>

      <template v-if="opts.mode === 'mc-block'">
        <section class="ps-row">
          <label class="ps-label">{{ k('shade') }}</label>
          <UiSwitch size="sm" :model-value="opts.shade" @change="v => set({shade: v})"/>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('spin') }}</label>
          <div class="ps-inline">
            <UiSwitch size="sm" :model-value="opts.spin" @change="v => set({spin: v})"/>
            <input v-if="opts.spin" type="range" min="1" max="30" step="1" class="ps-range" :value="opts.speed" :aria-label="k('speed')" @input="set({speed: +($event.target as HTMLInputElement).value})">
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('angle') }} <span class="text-muted">{{ opts.pitch }}°</span></label>
          <input type="range" min="-30" max="60" step="1" class="ps-range" :value="opts.pitch" @input="set({pitch: +($event.target as HTMLInputElement).value})">
        </section>
        <p class="text-2xs text-muted">{{ k('dragHint') }}</p>
      </template>

      <template v-if="opts.mode === 'mc-skin'">
        <section class="ps-row">
          <label class="ps-label">{{ k('arms') }}</label>
          <div class="tm-seg ps-seg">
            <button type="button" :class="{active: opts.arms === 'classic'}" @click="set({arms: 'classic'})">{{ k('armsClassic') }}</button>
            <button type="button" :class="{active: opts.arms === 'slim'}" @click="set({arms: 'slim'})">{{ k('armsSlim') }}</button>
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('pose') }}</label>
          <div class="tm-seg ps-seg">
            <button v-for="p in ['stand', 'walk', 'wave']" :key="p" type="button" :class="{active: opts.pose === p}" @click="set({pose: p as any})">
              {{ k('pose_' + p) }}
            </button>
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('framing') }}</label>
          <div class="tm-seg ps-seg">
            <button type="button" :class="{active: opts.framing === 'body'}" @click="set({framing: 'body'})">{{ k('framingBody') }}</button>
            <button type="button" :class="{active: opts.framing === 'head'}" @click="set({framing: 'head'})">{{ k('framingHead') }}</button>
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('outer') }}</label>
          <UiSwitch size="sm" :model-value="opts.outer" @change="v => set({outer: v})"/>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('shade') }}</label>
          <UiSwitch size="sm" :model-value="opts.shade" @change="v => set({shade: v})"/>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('spin') }}</label>
          <div class="ps-inline">
            <UiSwitch size="sm" :model-value="opts.spin" @change="v => set({spin: v})"/>
            <input v-if="opts.spin" type="range" min="1" max="30" step="1" class="ps-range" :value="opts.speed" :aria-label="k('speed')" @input="set({speed: +($event.target as HTMLInputElement).value})">
          </div>
        </section>
        <section class="ps-row">
          <label class="ps-label">{{ k('angle') }} <span class="text-muted">{{ opts.pitch }}°</span></label>
          <input type="range" min="-30" max="60" step="1" class="ps-range" :value="opts.pitch" @input="set({pitch: +($event.target as HTMLInputElement).value})">
        </section>
        <p class="text-2xs text-muted">{{ k('dragHint') }}</p>
      </template>

      <div class="ps-foot">
        <button type="button" class="btn" @click="emit('reset')">{{ k('reset') }}</button>
        <button type="button" class="btn primary" @click="emit('close')">{{ k('done') }}</button>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.ps { display: flex; flex-direction: column; gap: var(--space-3); }
.ps-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 30px; }
.ps-label { font-size: var(--text-sm); font-weight: 600; }
.ps-inline { display: flex; align-items: center; gap: var(--space-2); }
.ps-seg { --tm-ctl: 30px; grid-auto-columns: auto; }
.ps-seg button { padding: 0 var(--space-3); }
.ps-color { width: 30px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; }
.ps-range { width: 9rem; }
.ps-foot { display: flex; justify-content: flex-end; gap: var(--space-2); padding-top: var(--space-2); }
</style>
