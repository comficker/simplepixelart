<script setup lang="ts">
import {debounce} from "~/helper/utils";

const store = useEditor()

const isModify = defineModel<boolean>('modify', {default: false})

const wrapperRef = ref<HTMLElement | null>(null)
watch(() => store.pickedColorIndex, (idx) => {
  if (idx == null) return
  const w = wrapperRef.value
  const el = w?.querySelector(`[data-ci="${idx}"]`) as HTMLElement | null
  if (!w || !el) return
  const left = el.offsetLeft
  const right = left + el.offsetWidth
  if (left < w.scrollLeft) w.scrollLeft = left
  else if (right > w.scrollLeft + w.clientWidth) w.scrollLeft = right - w.clientWidth
})

const handleChange = debounce((index: number, event: Event): void => {
  const target = event.target as HTMLInputElement
  if (target && target.value) {
    store.editorData.colors[index] = target.value.toUpperCase()
    store.saveState()
  }
}, 300)

function addColor() {
  store.editorData.colors.push('#000000')
}

function toggleModify() {
  isModify.value = !isModify.value
  if (!isModify.value) isMerge.value = false
}

function removeColor() {
  if (store.currentColorIndex < 0) return
  store.removeColor(store.currentColorIndex)
}

/* Merging colours. Only reachable from edit mode, which is where the rest
   of the destructive palette work lives. */
const isMerge = defineModel<boolean>('merge', {default: false})
const mergeMode = ref<'auto' | 'manual'>('auto')
const picked = ref<Set<number>>(new Set())

/* Higher pulls in colours that are further apart. The scale underneath is
   hexColorDelta's, where 1 means identical, and measured pairs put every
   useful threshold between 1.00 and 0.85: a near-duplicate scores 0.995,
   two shades of one hue 0.939, and a green against a blue 0.854. Linear
   travel would spend most of the slider past the point of ruin, so the
   curve gives the cautious end the room. 25 lands on 0.981, which takes
   near-duplicates and nothing else. */
const strength = ref(25)
const threshold = computed(() => 1 - 0.15 * Math.pow(strength.value / 100, 1.5))

const colorCount = computed(() => store.editorData.colors.length)
const usage = computed(() => isMerge.value ? store.colorUsage() : [])

const autoGroups = computed(() =>
    isMerge.value && mergeMode.value === 'auto' ? store.similarColorGroups(threshold.value) : [])
const autoRemaining = computed(() =>
    colorCount.value - autoGroups.value.reduce((n, g) => n + g.length - 1, 0))
const inAutoGroup = computed(() => new Set(autoGroups.value.flat()))

// One highlight rule for both modes: what a merge would take in.
function isFlagged(index: number) {
  return mergeMode.value === 'auto' ? inAutoGroup.value.has(index) : picked.value.has(index)
}

function toggleMerge() {
  isMerge.value = !isMerge.value
  picked.value = new Set()
}

function togglePick(index: number) {
  const next = new Set(picked.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  picked.value = next
}

function runAutoMerge() {
  if (!autoGroups.value.length) return
  store.mergeColorGroups(autoGroups.value)
  picked.value = new Set()
}

/* Each press merges what is ticked and clears the ticks: the palette is
   compacted by the merge, so the indices that were ticked no longer point
   at the same colours. */
function runManualMerge() {
  if (picked.value.size < 2) return
  store.mergeColorGroups([[...picked.value]])
  picked.value = new Set()
}

defineExpose({addColor, toggleModify, removeColor, toggleMerge})
</script>

<template>
  <div class="palette">
    <div class="palette-row">
    <div ref="wrapperRef" class="wrapper no-scrollbar">
      <div class="items">
        <button
            v-if="!isModify"
            type="button"
            class="item"
            @click="store.useColor(-1)"
            :class="{ active: store.currentColorIndex === -1 }"
            :aria-pressed="store.currentColorIndex === -1"
            :aria-label="$t('c_Palette.eraser')"
            :title="$t('c_Palette.eraserEPaintWithTransparencyTo')"
        >
          <span class="icon icon-eraser"/>
        </button>
        <button
            v-if="!isModify"
            type="button"
            class="item tool-item"
            :class="{ active: store.currentTool === 'picker' }"
            :aria-pressed="store.currentTool === 'picker'"
            :aria-label="$t('c_Palette.eyedropper')"
            @click="store.setTool(store.currentTool === 'picker' ? 'brush' : 'picker')"
            :title="$t('c_Palette.eyedropperClickAPixelToGrab')"
        >
          <span class="icon icon-eyedropper"/>
        </button>
        <template v-if="!isModify">
          <button
              v-for="(color, index) in store.editorData.colors" :key="index"
              type="button"
              :data-ci="index"
              :style="{ backgroundColor: color }"
              :class="['item', 'color-item', { active: index === store.currentColorIndex }]"
              :aria-pressed="index === store.currentColorIndex"
              :aria-label="$t('c_Palette.colorNHex', {n: index + 1, hex: color})"
              :title="color"
              @click="store.useColor(index)"
          />
        </template>
        <template v-else-if="!isMerge">
          <input
              type="color"
              v-for="(color, index) in store.editorData.colors" :key="index"
              :data-ci="index"
              :value="store.editorData.colors[index]"
              :class="['item', { active: index === store.currentColorIndex }]"
              @click="store.useColor(index)"
              @input="handleChange(index, $event)"
          />
        </template>
        <template v-else>
          <button
              v-for="(color, index) in store.editorData.colors" :key="index"
              type="button"
              :data-ci="index"
              :style="{ backgroundColor: color }"
              :class="['item', 'color-item', 'merge-item', { flagged: isFlagged(index) }]"
              :disabled="mergeMode === 'auto'"
              :aria-pressed="isFlagged(index)"
              :title="$t('c_Palette.colorNHexNPixels', {hex: color, count: usage[index] || 0})"
              @click="togglePick(index)"
          >
            <span v-if="isFlagged(index)" class="icon icon-check"/>
          </button>
        </template>
        <div
            v-if="isModify && !isMerge && store.editorData.colors.length > 1"
            class="palette-remove"
            @click="removeColor"
            :title="$t('c_Palette.removeCurrentColor')"
        >
          <span class="icon icon-trash"/>
        </div>
      </div>
    </div>
    </div>

    <div v-if="isMerge" class="palette-merge">
      <div class="pm-modes">
        <button
            type="button"
            :class="{ active: mergeMode === 'auto' }"
            :aria-pressed="mergeMode === 'auto'"
            @click="mergeMode = 'auto'"
        >
          <span class="icon icon-auto-fix"/>
          <span>{{ $t('common.auto') }}</span>
        </button>
        <button
            type="button"
            :class="{ active: mergeMode === 'manual' }"
            :aria-pressed="mergeMode === 'manual'"
            @click="mergeMode = 'manual'"
        >
          <span class="icon icon-selected"/>
          <span>{{ $t('common.manual') }}</span>
        </button>
      </div>

      <template v-if="mergeMode === 'auto'">
        <label class="pm-slider">
          <span>{{ $t('c_Palette.mergeSimilar') }}</span>
          <input type="range" min="0" max="100" step="1" v-model.number="strength">
        </label>
        <span class="pm-readout" aria-live="polite">
          {{ autoGroups.length ? `${colorCount} → ${autoRemaining}` : $t('c_Palette.nothingAlikeEnough') }}
        </span>
        <button
            type="button"
            class="btn primary pm-go"
            :disabled="!autoGroups.length"
            @click="runAutoMerge"
        >
          <span class="icon icon-merge"/>
          <span>{{ $t('common.merge') }}</span>
        </button>
      </template>

      <template v-else>
        <span class="pm-readout" aria-live="polite">
          {{ picked.size < 2 ? $t('c_Palette.pickTwoOrMoreColors') : $t('common.nColors', {count: picked.size}) }}
        </span>
        <button
            type="button"
            class="btn primary pm-go"
            :disabled="picked.size < 2"
            @click="runManualMerge"
        >
          <span class="icon icon-merge"/>
          <span>{{ $t('common.merge') }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.palette {
  position: relative;
}

/* The strip keeps the height it always had, so nothing shifts while merge
   mode is off. The font size sits here rather than on .palette because the
   swatch icons are sized in em and the bar below wants ordinary text. */
.palette-row {
  height: calc(2.5rem + 2 * var(--space-2));
  position: relative;
  font-size: var(--text-2xl);
}

.wrapper {
  position: absolute;
  inset: 0;
  overflow: auto;
}

.items {
  display: flex;
  gap: var(--space-2);
  flex-wrap: nowrap;
  padding: var(--space-2);
}

.item {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
}

input.item {
  border: 1px solid var(--border);
  padding: var(--space-1);
}

.color-item {
  box-shadow: inset 0 0 0 1px var(--border);
}

.item.active {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.tool-item {
  color: var(--muted);
  cursor: pointer;
}

.tool-item.active {
  color: var(--primary);
}

.palette .item {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.palette-remove {
  position: sticky;
  right: 0;
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--background);
  color: var(--muted);
  cursor: pointer;
  transition: color 160ms ease, background 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .palette-remove:hover {
    color: var(--danger-foreground);
    background: var(--danger);
  }
}

.merge-item {
  cursor: pointer;
  color: var(--primary-foreground, #fff);
}

.merge-item:disabled {
  cursor: default;
}

/* What a merge would take in. The mark is drawn over the swatch itself, so
   it has to read on a light and a dark colour alike. */
.merge-item.flagged {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.merge-item.flagged .icon {
  filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.9));
}

.palette-merge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  border-top: 1px solid var(--border);
  font-size: var(--text-xs);
}

.pm-modes {
  display: flex;
  flex: none;
}

.pm-modes button {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  color: var(--muted);
  cursor: pointer;
}

.pm-modes button + button {
  border-left: 0;
}

.pm-modes button.active {
  color: var(--primary);
  border-color: var(--primary);
}

.pm-slider {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1 1 8rem;
  min-width: 0;
  color: var(--muted);
}

.pm-slider input[type="range"] {
  flex: 1;
  min-width: 0;
}

.pm-readout {
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.pm-go {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
}

input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}

input[type="color"]::-webkit-color-swatch {
  border: none;
}
</style>