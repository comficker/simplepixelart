<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{ guidelines?: boolean; toc?: boolean }>(), {
  guidelines: true,
  toc: true,
})

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
  <section ref="root" class="readme">
    <div class="readme-head">
      <div class="readme-tabs">
        <span class="readme-tab is-active"><span class="icon icon-file"/>README</span>
        <NuxtLink v-if="guidelines" to="/guidelines" class="readme-tab">Guidelines</NuxtLink>
      </div>
      <div v-if="toc" class="readme-actions">
        <button
            type="button"
            class="readme-toc-btn"
            title="Table of contents"
            aria-label="Table of contents"
            @click="openToc"
        >
          <span class="icon icon-list"/>
        </button>
      </div>
    </div>
    <div class="readme-body">
      <slot/>
    </div>

    <UiModal v-if="tocOpen" title="Table of contents" width="26rem" @close="tocOpen = false">
      <nav class="readme-toc">
        <button
            v-for="item in tocItems"
            :key="item.id"
            type="button"
            class="readme-toc-item"
            :class="`lvl-${item.level}`"
            @click="goTo(item.id)"
        >{{ item.text }}</button>
        <p v-if="!tocItems.length" class="readme-toc-empty">No sections.</p>
      </nav>
    </UiModal>
  </section>
</template>
