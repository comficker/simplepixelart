// Shared "entering the editor" veil. Raised at navigation start — over the
// screen you're LEAVING — when you open the editor with fullscreen already on,
// so the fullscreen layout re-flow is hidden from the moment you click, instead
// of flashing a loader on the editor itself. Raised by the router guard in
// app.vue; cleared by PXEditor once its canvas has painted (and by app.vue if
// the navigation ends up somewhere other than the editor).
export function useEditorBoot() {
  return useState<boolean>('editor-boot', () => false)
}
