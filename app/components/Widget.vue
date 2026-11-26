<script setup lang="ts">
import {K3_DESK} from '~/composables/useK3Desk'

// `to` makes the title itself the link, so the row's own name is the anchor
// text rather than a generic "View all".
// `label`: the title names a control panel (a tool's "Size", "Colors"), not a
// section of content, so it is not a heading -- a page full of those buried
// the real outline under a dozen one-word h2s.
// `win`: inside a K3 desk (useK3Desk), the widget is a floating window with
// that id -- dragged by its head, folded by a button in it. `winTitle` names
// a widget that has no title of its own. Windows are never closed, only
// folded (to a chip).
// Outside a desk these do nothing.
const props = defineProps<{
  title?: string
  to?: string
  label?: boolean
  win?: string
  winTitle?: string
}>()

const desk = inject(K3_DESK, null)
const k3 = computed(() => !!(desk && props.win))
const place = computed(() => (k3.value ? desk!.places[props.win!] : null))
const headTitle = computed(() => props.title || (k3.value ? props.winTitle : ''))
const root = ref<HTMLElement | null>(null)

onMounted(() => {
  if (k3.value && root.value) desk!.register(props.win!, root.value)
})
onBeforeUnmount(() => {
  if (k3.value) desk!.unregister(props.win!)
})

const winClass = computed(() => k3.value && {
  'k3-win': true,
  'k3-folded': place.value?.folded,
  'k3-chip-mode': place.value?.folded,
  'k3-unplaced': !place.value?.placed,
})
const winStyle = computed(() => {
  const p = place.value
  if (!k3.value || !p) return undefined
  const open = !p.folded
  return {
    left: `${p.x}px`,
    top: `${p.y}px`,
    zIndex: p.z,
    width: open && p.w ? `${p.w}px` : undefined,
    height: open && p.h ? `${p.h}px` : undefined,
  }
})

function onHeadDown(e: PointerEvent) {
  if (k3.value) desk!.startDrag(props.win!, e)
}

function onChipDown(e: PointerEvent) {
  desk!.startDrag(props.win!, e, () => desk!.toggleFold(props.win!))
}
</script>

<template>
  <div ref="root" class="widget" :class="winClass" :style="winStyle" @pointerdown.capture="k3 && desk!.lift(win!)">
    <button
        v-if="k3 && place?.folded"
        type="button"
        class="k3-chip"
        :title="headTitle"
        :aria-label="`${$t('c_Widget.expand')} ${headTitle}`"
        @pointerdown="onChipDown"
        @keydown.enter.prevent="desk!.toggleFold(win!)"
        @keydown.space.prevent="desk!.toggleFold(win!)"
    >
      <slot name="chip"><span class="k3-chip-txt">{{ (headTitle || '').slice(0, 2) }}</span></slot>
    </button>
    <!-- No title and no controls: no head. ":empty" was meant to hide it,
         but the v-if comments inside count as content, so an untitled
         widget showed an empty band and a rule above its body. -->
    <div v-if="headTitle || $slots.ctl" class="widget-head" @pointerdown="onHeadDown">
      <component :is="label ? 'div' : 'h2'" v-if="headTitle" class="title">
        <NuxtLinkLocale v-if="to" :to="to" class="title-link">{{ headTitle }}</NuxtLinkLocale>
        <template v-else>{{ headTitle }}</template>
      </component>
      <slot name="ctl" v-if="$slots.ctl"/>
      <button
          v-if="k3"
          type="button"
          class="k3-fold"
          :title="place?.folded ? $t('c_Widget.expand') : $t('c_Widget.collapse')"
          :aria-label="place?.folded ? $t('c_Widget.expand') : $t('c_Widget.collapse')"
          :aria-expanded="!place?.folded"
          @click="desk!.toggleFold(win!)"
      >
        <span :class="place?.folded ? 'k3-fold-mx' : 'k3-fold-mn'" aria-hidden="true"/>
      </button>
    </div>
    <div class="widget-body">
      <slot/>
    </div>
    <span
        v-if="k3 && !place?.folded"
        class="k3-grip"
        aria-hidden="true"
        @pointerdown="desk!.startResize(win!, $event)"
    />
  </div>
</template>
