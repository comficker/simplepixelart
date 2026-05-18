<script setup lang="ts">
import {debounce} from "~/helper/utils";

const store = useEditor()

const isModify = defineModel<boolean>('modify', {default: false})

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
    <div class="wrapper no-scrollbar">
      <div class="items">
        <div
            v-if="!isModify"
            class="item"
            @click="store.currentColorIndex = -1"
            :class="{ active: store.currentColorIndex === -1 }"
            title="Remove color"
        >
          <span class="icon icon-eraser"/>
        </div>
        <template v-if="!isModify">
          <div
              v-for="(color, index) in store.editorData.colors" :key="index"
              :style="{ backgroundColor: color }"
              :class="['item', { active: index === store.currentColorIndex }]"
              @click="store.currentColorIndex = index"
          />
        </template>
        <template v-else>
          <input
              type="color"
              v-for="(color, index) in store.editorData.colors" :key="index"
              :value="store.editorData.colors[index]"
              :class="['item', { active: index === store.currentColorIndex }]"
              @click="store.currentColorIndex = index"
              @input="handleChange(index, $event)"
          />
        </template>
        <div
            v-if="isModify && store.editorData.colors.length > 1"
            class="palette-remove"
            @click="removeColor"
            title="Remove current color"
        >
          <span class="icon icon-trash"/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette {
  height: 2.5rem;
  position: relative;
  font-size: var(--text-2xl);
  line-height: var(--text-2xl-lh);
}

.wrapper {
  position: absolute;
  inset: 0;
  overflow: auto;
}

.items {
  display: flex;
  gap: 0.125rem;
  flex-wrap: nowrap;
}

.item {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
}

input.item {
  border: 1px solid var(--border);
  padding: 0.25rem;
}

.item.active {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
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
    color: #fff;
    background: #ef4444;
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