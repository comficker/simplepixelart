<script setup lang="ts">
// Fullscreen boot veil (see useEditorBoot). When navigating into the editor
// with fullscreen already on, cover the screen we're LEAVING with the loader
// the instant navigation starts, so the fullscreen layout re-flow never flashes
// a loader on the editor. PXEditor clears it once the canvas has painted.
const editorBoot = useEditorBoot()
// Paint the veil in the editor's desk colour so the reveal is a same-tone
// cross-fade instead of a bright→dark flash. Desk bg is persisted in
// workspace_desk; default to the desk dark (#1b1b1f).
const editorBootBg = ref('#1b1b1f')
if (import.meta.client) {
  const router = useRouter()
  const FS_KEY = 'editor_fullscreen'
  router.beforeEach((to, from) => {
    if (to.path !== '/editor') return
    // Skip a hard load (nothing to leave) — that path renders the fullscreen
    // layout pre-paint via the <html> class + head script, so no veil is needed.
    if (!from.matched.length || from.path === '/editor') return
    let fsOn = false
    try { const v = localStorage.getItem(FS_KEY); fsOn = !!v && v !== 'off' } catch { /* ignore */ }
    if (!fsOn) return
    try {
      const d = JSON.parse(localStorage.getItem('workspace_desk') || 'null')
      editorBootBg.value = (d && typeof d.bg === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.bg)) ? d.bg : '#1b1b1f'
    } catch { editorBootBg.value = '#1b1b1f' }
    editorBoot.value = true
  })
  // If navigation ends up somewhere other than the editor (redirect / cancel),
  // drop the veil so it can't get stuck up.
  router.afterEach((to) => {
    if (to.path !== '/editor') editorBoot.value = false
  })
}
</script>

<template>
  <div class="main-wrapper">
    <UiScrollProgress/>
    <PartialHeader/>
    <main class="main">
      <div class="container">
        <NuxtPage :transition="{ name: 'page', mode: 'out-in' }"/>
      </div>
    </main>
    <PartialFooter/>
    <UiCommandPalette/>
    <ClientOnly>
      <PartialConsentBanner/>
    </ClientOnly>
    <Teleport to="body">
      <UiSonner position="bottom-right"/>
    </Teleport>
    <Teleport to="body">
      <Transition name="editor-boot">
        <div v-if="editorBoot" class="editor-boot-veil" :style="{ background: editorBootBg }" aria-hidden="true">
          <div class="eb-loader">
            <span
                v-for="i in 9"
                :key="i"
                :style="{ animationDelay: ((Math.floor((i - 1) / 3) + (i - 1) % 3) * 0.11) + 's' }"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style>
/* Fullscreen boot veil — a global overlay raised over the outgoing screen while
   the editor comes up in fullscreen (see useEditorBoot). Above everything; it
   fades out once PXEditor clears it. */
.editor-boot-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1b1b1f; /* fallback; matched to the editor desk via inline style */
}
/* Gentle cross-fade on both ends: quick fade-in over the outgoing screen,
   slower fade-out onto the (colour-matched) editor so the reveal never flashes. */
.editor-boot-enter-active {
  transition: opacity 0.18s ease;
}
.editor-boot-enter-from {
  opacity: 0;
}
.editor-boot-leave-active {
  transition: opacity 0.45s ease;
}
.editor-boot-leave-to {
  opacity: 0;
}
.eb-loader {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}
.eb-loader span {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--primary, #5b6ee1);
  opacity: 0.18;
  transform: scale(0.7);
  animation: eb-pulse 1.15s ease-in-out infinite;
}
@keyframes eb-pulse {
  0%, 70%, 100% { opacity: 0.18; transform: scale(0.7); }
  35% { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .eb-loader span { animation-duration: 0s; opacity: 0.6; transform: none; }
}

.page-enter-active,
.page-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,.61,.36,1);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .page-enter-active,
  .page-leave-active {
    transition: none;
  }
  .page-enter-from,
  .page-leave-to {
    transform: none;
  }
}
</style>
