<script setup lang="ts">
import {computed, ref, onMounted, onBeforeUnmount} from 'vue'

const {isLoading, progress} = useLoadingIndicator({throttle: 150})

const navScale = computed(() => Math.min(1, progress.value / 100))
const navDone = computed(() => progress.value >= 100)

const scroll = ref(0)
let raf = 0

function update() {
  raf = 0
  const doc = document.documentElement
  const max = doc.scrollHeight - doc.clientHeight
  scroll.value = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0
}

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(update)
}

onMounted(() => {
  update()
  window.addEventListener('scroll', onScroll, {passive: true})
  window.addEventListener('resize', onScroll)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="top-progress" aria-hidden="true">
    <div
        v-show="isLoading"
        class="top-progress-bar is-nav"
        :class="{'is-done': navDone}"
        :style="{ transform: `scaleX(${navScale})` }"
    />
    <div v-show="!isLoading" class="top-progress-bar" :style="{ transform: `scaleX(${scroll})` }"/>
  </div>
</template>

<style scoped>
.top-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  z-index: 60;
  pointer-events: none;
  background: transparent;
}

.top-progress-bar {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  transform: scaleX(0);
  background: linear-gradient(
      90deg,
      color-mix(in oklab, var(--primary) 40%, transparent) 0%,
      var(--primary) 60%,
      color-mix(in oklab, var(--primary) 60%, #fff) 100%
  );
  will-change: transform;
}

.top-progress-bar.is-nav {
  transition: transform 150ms linear, opacity 300ms ease;
}

.top-progress-bar.is-done {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .top-progress-bar.is-nav { transition: opacity 300ms ease; }
}
</style>
