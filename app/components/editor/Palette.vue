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
}

function removeColor() {
  if (store.currentColorIndex < 0) return
  store.removeColor(store.currentColorIndex)
}

defineExpose({addColor, toggleModify, removeColor})
</script>

<template>
  <div class="palette">
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
        <template v-else>
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
        <div
            v-if="isModify && store.editorData.colors.length > 1"
            class="palette-remove"
            @click="removeColor"
            :title="$t('c_Palette.removeCurrentColor')"
        >
          <span class="icon icon-trash"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette {

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