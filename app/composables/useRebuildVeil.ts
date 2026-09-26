/**
 * The full-screen veil shown while the app is re-made for a new theme or
 * language — the same loader the editor boots behind, so it is one visual
 * language rather than a second one invented for this.
 *
 * `run` keeps it up for `minMs` *and* until the work is finished, whichever
 * is later: a theme swap is instant and needs the floor to register as an
 * event at all, while switching language navigates and refetches, which can
 * outlast it.
 */
const MIN_MS = 3000

export default function useRebuildVeil() {
  const open = useState('rebuild-veil', () => false)
  const label = useState('rebuild-veil-label', () => '')

  async function run(text: string, work?: () => Promise<unknown>, minMs = MIN_MS) {
    if (open.value) return
    label.value = text
    open.value = true
    const floor = new Promise(resolve => setTimeout(resolve, minMs))
    try {
      await Promise.all([floor, work ? work().catch(() => {}) : Promise.resolve()])
    } finally {
      open.value = false
      label.value = ''
    }
  }

  return {open, label, run}
}
