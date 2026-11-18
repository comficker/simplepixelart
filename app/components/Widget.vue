<script setup lang="ts">
// `to` makes the title itself the link, so the row's own name is the anchor
// text rather than a generic "View all".
// `label`: the title names a control panel (a tool's "Size", "Colors"), not a
// section of content, so it is not a heading -- a page full of those buried
// the real outline under a dozen one-word h2s.
defineProps<{ title?: string, to?: string, label?: boolean }>()
</script>

<template>
  <div class="widget">
    <!-- No title and no controls: no head. ":empty" was meant to hide it,
         but the v-if comments inside count as content, so an untitled
         widget showed an empty band and a rule above its body. -->
    <div v-if="title || $slots.ctl" class="widget-head">
      <component :is="label ? 'div' : 'h2'" v-if="title" class="title">
        <NuxtLinkLocale v-if="to" :to="to" class="title-link">{{ title }}</NuxtLinkLocale>
        <template v-else>{{ title }}</template>
      </component>
      <slot name="ctl" v-if="$slots.ctl"/>
    </div>
    <div class="widget-body">
      <slot/>
    </div>
  </div>
</template>
