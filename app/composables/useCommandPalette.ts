/**
 * The ⌘K palette, opened from anywhere.
 *
 * The palette is 740 lines and sat in the entry chunk of every page because
 * app.vue mounted it unconditionally — to listen for one keystroke. The state
 * lives here instead, so app.vue can keep the listener and load the component
 * itself the first time it is actually wanted.
 *
 * `useState`, not a module-level ref: a module ref is shared by every SSR
 * request in the same process, so one visitor opening the palette would render
 * it open for whoever was served next.
 */
export default function useCommandPalette() {
  const open = useState('cmdk-open', () => false)
  // Sticks once the palette has been opened, so the chunk is fetched once and
  // the component keeps its state between openings.
  const loaded = useState('cmdk-loaded', () => false)

  return {
    open,
    loaded,
    show() {
      loaded.value = true
      open.value = true
    },
    hide() {
      open.value = false
    },
    toggle() {
      if (open.value) open.value = false
      else { loaded.value = true; open.value = true }
    },
  }
}
