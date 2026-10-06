// The top bar (≥1024px) and the compact header (<1024px) both carry the bell
// and wallet; CSS hides one, but a hidden copy still mounts and fetches. This
// tells them which one is live. null until mounted: the server can't know.
export function useIsDesktop() {
  const desktop = useState<boolean | null>('is_desktop', () => null)
  onMounted(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => { desktop.value = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    onBeforeUnmount(() => mq.removeEventListener('change', sync))
  })
  return desktop
}
