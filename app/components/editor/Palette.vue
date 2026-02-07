<script setup lang="ts">
import {debounce} from "~/helper/utils";

const store = useEditor()

const isModify = ref(false)

const handleChange = debounce((index: number, event: Event): void => {
  const target = event.target as HTMLInputElement
  if (target && target.value) {
    store.editorData.colors[index] = target.value
    store.saveState()
  }
}, 300)

const removeColor = () => {
  if (store.editorData.colors.length > 1) {
    const index = store.currentColorIndex
    store.editorData.colors.splice(index, 1)
    if (store.currentColorIndex >= store.editorData.colors.length) {
      store.currentColorIndex = store.editorData.colors.length - 1
    }
    store.saveState()
  }
}
</script>

<template>
  <div class="palette">
    <div class="wrapper no-scrollbar">
      <div class="items">
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
        <div class="ctl">
          <div class="item" @click="store.editorData.colors.push('#000000')" title="Add color">
            <span class="icon icon-plus"/>
          </div>
          <div 
              class="item" 
              @click="isModify = !isModify"
              :class="{ active: isModify }"
              title="Toggle edit mode"
          >
            <span class="icon icon-adjust"/>
          </div>
          <div 
              v-if="isModify && store.editorData.colors.length > 1"
              class="item" 
              @click="removeColor"
              title="Remove current color"
          >
            <span class="icon icon-trash"/>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.palette {
  @apply h-10 relative text-2xl;
}

.wrapper {
  @apply absolute inset-0 overflow-auto;
}

.items {
  @apply flex gap-0.5 flex-nowrap;
}

.item {
  @apply flex-none size-10;
}

input.item {
  @apply border p-1;
}

.item.active {
  @apply border border-black;
}

.palette .ctl {
  @apply sticky right-0 bg-white flex items-center gap-0;
}

.palette .ctl .item {
  @apply size-10 flex items-center justify-center;
}

.palette .ctl .item.active {
  @apply bg-gray-200;
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