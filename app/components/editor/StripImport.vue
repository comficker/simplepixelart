<script setup lang="ts">
import {toast} from 'vue-sonner'
import {detectStripLayout, sliceStrip} from '~/helper/strip'

const open = defineModel<boolean>('open', {default: false})
const store = useEditor()

const MAX_FRAMES = 64

const dataUrl = ref('')
const fileName = ref('')
const imgEl = ref<HTMLImageElement | null>(null)
const imgW = ref(0)
const imgH = ref(0)
const cols = ref(1)
const rows = ref(1)
const importing = ref(false)

const frameCount = computed(() => cols.value * rows.value)
const frameW = computed(() => (cols.value > 0 ? imgW.value / cols.value : 0))
const frameH = computed(() => (rows.value > 0 ? imgH.value / rows.value : 0))
const cleanDivide = computed(() => Number.isInteger(frameW.value) && Number.isInteger(frameH.value))

const problem = computed(() => {
  if (!imgW.value) return ''
  if (cols.value < 1 || rows.value < 1) return 'Cols and rows must be at least 1.'
  if (!cleanDivide.value) return `${imgW.value}×${imgH.value}px doesn't divide evenly into ${cols.value}×${rows.value} frames.`
  if (frameCount.value > MAX_FRAMES) return `Max ${MAX_FRAMES} frames — reduce cols/rows.`
  return ''
})

function reset() {
  dataUrl.value = ''
  fileName.value = ''
  imgEl.value = null
  imgW.value = 0
  imgH.value = 0
  cols.value = 1
  rows.value = 1
}

function pickFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/webp,image/gif'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    fileName.value = file.name
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        imgEl.value = img
        imgW.value = img.naturalWidth
        imgH.value = img.naturalHeight
        dataUrl.value = url
        const guess = detectStripLayout(img.naturalWidth, img.naturalHeight, file.name)
        cols.value = guess.cols
        rows.value = guess.rows
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }
  input.click()
}

function doImport() {
  if (!imgEl.value || problem.value) return
  importing.value = true
  try {
    const frames = sliceStrip(imgEl.value, cols.value, rows.value)
    if (!frames.length) {
      toast.error('Could not read any frames from this image')
      return
    }
    store.loadAnimationFrames(frames)
    toast.success(frames.length > 1 ? `Imported ${frames.length} frames` : 'Imported 1 frame')
    open.value = false
    reset()
  } finally {
    importing.value = false
  }
}

function close() {
  open.value = false
  reset()
}

watch(open, (v) => { if (v) reset() })
</script>

<template>
  <UiModal v-if="open" class="si-modal" @close="close">
        <h3 class="publish-heading">Import sprite strip</h3>
        <p class="si-sub">Slice a spritesheet PNG into animation frames.</p>

        <button v-if="!dataUrl" type="button" class="si-drop" @click="pickFile">
          <span class="icon icon-upload"/>
          <span>Choose an image…</span>
          <span class="si-drop-hint">e.g. duck_strip4.png — frames laid out on a grid</span>
        </button>

        <template v-else>
          <div class="si-preview" title="Click to choose another image" @click="pickFile">
            <div class="si-frame">
              <img :src="dataUrl" :alt="fileName" class="si-img" draggable="false">
              <div
                  class="si-grid"
                  :style="{backgroundSize: `${100 / cols}% ${100 / rows}%`}"
              />
            </div>
          </div>

          <div class="si-controls">
            <label class="si-field">
              <span class="si-label">Cols</span>
              <input v-model.number="cols" type="number" min="1" :max="MAX_FRAMES">
            </label>
            <label class="si-field">
              <span class="si-label">Rows</span>
              <input v-model.number="rows" type="number" min="1" :max="MAX_FRAMES">
            </label>
            <div class="si-info">
              <template v-if="!problem">
                {{ frameCount }} {{ frameCount === 1 ? 'frame' : 'frames' }} ·
                {{ frameW }}×{{ frameH }}px each
              </template>
              <span v-else class="si-error">{{ problem }}</span>
            </div>
          </div>

          <p class="si-hint">Importing replaces the current artwork. Empty trailing cells are skipped.</p>
        </template>

        <div class="publish-actions">
          <button class="btn block" @click="close">Cancel</button>
          <button
              v-if="dataUrl"
              class="btn primary block"
              :disabled="!!problem || importing"
              @click="doImport"
          >
            {{ importing ? 'Importing…' : 'Import' }}
          </button>
        </div>
    </UiModal>
</template>

<style scoped>

.si-sub {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: -0.25rem 0 var(--space-4);
}

.si-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 2rem 1rem;
  background: transparent;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition), color var(--transition);
  margin-bottom: var(--space-4);
}

.si-drop:hover {
  color: var(--foreground);
}

.si-drop-hint {
  font-size: var(--text-2xs);
  font-weight: 400;
}

.si-preview {
  display: flex;
  justify-content: center;
  cursor: pointer;
  padding: var(--space-4);
  background:
      repeating-conic-gradient(var(--surface-2) 0 25%, transparent 0 50%)
      0 0 / 16px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-3);
  overflow: hidden;
}

.si-frame {
  position: relative;
  display: inline-block;
  line-height: 0;
  max-width: 100%;
}

.si-img {
  max-width: 100%;
  max-height: 220px;
  image-rendering: pixelated;
}

.si-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
      linear-gradient(to right, color-mix(in oklab, var(--primary) 70%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--primary) 70%, transparent) 1px, transparent 1px);
}

.si-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.si-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.si-field input {
  width: 64px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.si-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.si-info {
  font-size: var(--text-xs);
  color: var(--muted);
  min-width: 0;
}

.si-error {
  color: var(--danger);
}

.si-hint {
  font-size: var(--text-2xs);
  font-style: italic;
  color: var(--muted);
  margin: 0 0 var(--space-3);
}
</style>

<style>

.si-modal {
  max-width: 440px;
}
</style>
