<script setup lang="ts">
import { ref, watch, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  toc?: boolean
  agent?: boolean
  // A tool's own panel as the first tab (the tilemap's tile picker).
  panelLabel?: string
  panelIcon?: string
}>(), {
  toc: true,
  // Only the editor has art for an agent to edit, so only it asks for the tab.
  agent: false,
})

const hasPanel = !!useSlots().panel
const panelOpen = ref(false)

// Shared with the editor's toolbar button: either can open the tab. Asked for
// only when the page wants the tab — the panel reaches into the editor store,
// and every tool page renders a README, so reaching for it unconditionally
// built that whole store on pages with no canvas, Home among them.
const agentOpen = props.agent ? useAgentPanel().open : ref(false)
watch(agentOpen, (v) => { if (v) panelOpen.value = false })

function show(tab: 'panel' | 'readme' | 'agent') {
  panelOpen.value = tab === 'panel'
  agentOpen.value = tab === 'agent'
}

const root = ref<HTMLElement | null>(null)
const tocOpen = ref(false)
const tocItems = ref<{ text: string; level: number; id: string }[]>([])

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 64) || 'section'
}

function openToc() {
  const body = root.value?.querySelector('.readme-body')
  if (body) {
    const heads = Array.from(body.querySelectorAll('h1, h2, h3')) as HTMLElement[]
    const seen = new Set<string>()
    tocItems.value = heads
        .map((h) => {
          const text = h.textContent?.trim() || ''
          if (!h.id) {
            let id = slugify(text)
            while (seen.has(id)) id += '-x'
            h.id = id
          }
          seen.add(h.id)
          return { text, level: Number(h.tagName[1]), id: h.id }
        })
        .filter((e) => e.text)
  }
  tocOpen.value = true
}

function goTo(id: string) {
  tocOpen.value = false
  const el = root.value?.querySelector('#' + (window.CSS?.escape ? CSS.escape(id) : id))
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <section ref="root" class="readme" :class="{'is-agent': agent && agentOpen}">
    <div class="readme-head">
      <div class="readme-tabs">
        <button
            v-if="hasPanel"
            type="button"
            class="readme-tab"
            :class="{'is-active': panelOpen}"
            @click="show('panel')"
        ><span class="icon" :class="panelIcon || 'icon-grid'"/>{{ panelLabel }}</button>
        <button
            type="button"
            class="readme-tab"
            :class="{'is-active': !agentOpen && !panelOpen}"
            @click="show('readme')"
        ><span class="icon icon-file"/>{{ $t('c_ToolReadme.readme') }}</button>
        <button
            v-if="agent"
            type="button"
            class="readme-tab"
            :class="{'is-active': agentOpen}"
            @click="show('agent')"
        ><span class="icon icon-auto-fix"/>{{ $t('common.agent') }}</button>
      </div>
      <div v-if="agent && agentOpen" class="readme-actions">
        <button
            type="button"
            class="widget-ctl-btn"
            :aria-label="$t('c_ToolReadme.closeAgent')"
            :title="$t('c_ToolReadme.closeAgent')"
            @click="agentOpen = false"
        >
          <span class="icon icon-close"/>
        </button>
      </div>
      <div v-if="toc && !agentOpen && !panelOpen" class="readme-actions">
        <button
            type="button"
            class="widget-ctl-btn"
            :title="$t('c_ToolReadme.tableOfContents')"
            :aria-label="$t('c_ToolReadme.tableOfContents')"
            @click="openToc"
        >
          <span class="icon icon-list"/>
        </button>
      </div>
    </div>
    <!-- v-show: the panel keeps its state (a drawn canvas, a scroll
         position) while the readme is read. -->
    <div v-if="hasPanel" v-show="panelOpen" class="readme-panel">
      <slot name="panel"/>
    </div>
    <EditorAgentChat v-if="agent && agentOpen"/>
    <div v-else-if="!panelOpen" class="readme-body prose">
      <slot/>
    </div>

    <UiModal v-if="tocOpen" :title="$t('c_ToolReadme.tableOfContents')" width="26rem" @close="tocOpen = false">
      <nav class="readme-toc">
        <button
            v-for="item in tocItems"
            :key="item.id"
            type="button"
            class="readme-toc-item"
            :class="`lvl-${item.level}`"
            @click="goTo(item.id)"
        >{{ item.text }}</button>
        <p v-if="!tocItems.length" class="readme-toc-empty">{{ $t('c_ToolReadme.noSections') }}</p>
      </nav>
    </UiModal>
  </section>
</template>
