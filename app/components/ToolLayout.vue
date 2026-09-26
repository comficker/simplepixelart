<script setup lang="ts">
import useStatefulCookie from '~/composables/useStatefulCookie'

withDefaults(defineProps<{ title: string; titleTag?: 'h1' | 'h2'; agent?: boolean }>(),
    {titleTag: 'h2', agent: false})

// 360 leaves the rail's ad unit 343px after the panel border and body padding,
// enough for a 336x280 -- at 300 it was 283 and the responsive unit had no
// standard size that fit.
const DOC_MIN = 360

const pageEl = ref<HTMLElement | null>(null)
const dragging = ref(false)

const docState = useStatefulCookie('tool_doc_w')
const docPx = computed(() => {
  const n = Number(docState.value)
  return Number.isFinite(n) && n >= DOC_MIN ? Math.round(n) : DOC_MIN
})

function clamp(px: number) {
  const w = pageEl.value?.getBoundingClientRect().width || 0
  return Math.round(Math.max(DOC_MIN, w ? Math.min(px, w / 2) : px))
}

function setFromX(clientX: number) {
  const r = pageEl.value?.getBoundingClientRect()
  if (!r || !r.width) return
  docState.value = String(clamp(r.right - clientX))
}

function onDown(e: PointerEvent) {
  dragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  e.preventDefault()
}

function onMove(e: PointerEvent) {
  if (dragging.value) setFromX(e.clientX)
}

function onUp(e: PointerEvent) {
  dragging.value = false
  ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
}

function nudge(step: number) {
  docState.value = String(clamp(docPx.value + step))
}
</script>

<template>
  <div ref="pageEl" class="page" :style="{'--doc-w': `${docPx}px`}">
    <div class="tool-main">
      <div class="widget-head">
        <component :is="titleTag" class="title">{{ title }}</component>
        <slot name="head"/>
      </div>
      <slot/>
      <div v-if="$slots.status" class="editor-foot">
        <slot name="status"/>
      </div>
    </div>
    <div
        class="tool-split"
        :class="{dragging}"
        role="separator"
        aria-orientation="vertical"
        :aria-label="$t('c_ToolLayout.resizeTheDocumentationColumn')"
        :aria-valuenow="docPx"
        :aria-valuemin="DOC_MIN"
        tabindex="0"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @dblclick="docState = String(DOC_MIN)"
        @keydown.left.prevent="nudge(24)"
        @keydown.right.prevent="nudge(-24)"
    />
    <div class="tool-doc">
      <slot name="aside"/>
      <!-- One ad per readme screen, in the rail above the readme. It is a
           direct child of .tool-doc like ToolReadme, so the rail's own rules
           give it the same flat panel and divider. -->
      <Widget v-if="$slots.doc" :title="$t('c_AdSlot.advertisement')">
        <AdSlot slot="7838948172" bare/>
      </Widget>
      <ToolReadme v-if="$slots.doc" :agent="agent">
        <slot name="doc"/>
      </ToolReadme>
    </div>
    <slot name="extra"/>
  </div>
</template>
