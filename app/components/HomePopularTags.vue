<template>
  <Widget ref="root" class="home-tags" :title="$t('p_index.popularTags')">
    <template #ctl>
      <NuxtLinkLocale to="/tags" class="widget-ctl-btn">
        <span class="widget-ctl-name">{{ $t('p_index.viewAll') }}</span><span class="icon icon-angle-right"/>
      </NuxtLinkLocale>
    </template>
    <!-- Server render and first paint are the placeholder grid: the section
         takes its full height from the start (no shift) and costs the home
         page nothing until it nears the viewport. -->
    <TagTileGrid :tags="tags" :slots="SLOTS"/>
  </Widget>
</template>

<script setup lang="ts">
import type {HomeTag} from '~~/server/api/home-tags.get'

const SLOTS = 20
const {locale} = useI18n()
const root = ref<any>(null)
const tags = ref<HomeTag[] | null>(null)

async function load() {
  try {
    const rows = await $fetch<HomeTag[]>('/api/home-tags', {query: {lang: locale.value}})
    if (rows?.length) tags.value = rows.slice(0, SLOTS)
  } catch { /* keep the placeholder: the rest of the page is unaffected */ }
}

// Asked for only after the page has finished loading, once the section is
// within a few hundred px of the viewport, and in idle time: it never
// competes with the hero, the first ads or the art grid for the network.
let io: IntersectionObserver | null = null
function watchSection() {
  const el: HTMLElement | undefined = root.value?.$el
  if (!el || typeof IntersectionObserver === 'undefined') { load(); return }
  io = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting)) return
    io?.disconnect()
    io = null
    const idle = (window as any).requestIdleCallback as ((cb: () => void, o?: object) => number) | undefined
    if (idle) idle(load, {timeout: 1500})
    else setTimeout(load, 0)
  }, {rootMargin: '300px 0px'})
  io.observe(el)
}
onMounted(() => {
  if (document.readyState === 'complete') watchSection()
  else window.addEventListener('load', watchSection, {once: true})
})
onBeforeUnmount(() => {
  io?.disconnect()
  window.removeEventListener('load', watchSection)
})
watch(locale, () => { if (tags.value) load() })
</script>
