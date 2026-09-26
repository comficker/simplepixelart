/**
 * Uploading the work made while signed out is the user's call, not a side
 * effect of signing in — it publishes drawings to an account, and before this
 * it happened silently the moment the modal closed.
 *
 * Signing in calls `offer()`. If there is nothing local it does nothing at
 * all, so the common case stays quiet.
 */
export default function useLocalSync() {
  const open = useState('local-sync-open', () => false)
  const total = useState('local-sync-total', () => 0)
  const done = useState('local-sync-done', () => 0)
  const busy = useState('local-sync-busy', () => false)

  function offer() {
    if (!import.meta.client) return
    const editor = useEditor()
    const n = editor.localPendingCount()
    if (n === 0) return
    total.value = n
    done.value = 0
    busy.value = false
    open.value = true
  }

  function dismiss() {
    if (busy.value) return
    open.value = false
  }

  async function accept() {
    if (busy.value) return
    busy.value = true
    try {
      await useEditor().syncLocalToCloud((d, t) => {
        done.value = d
        total.value = t
      })
    } finally {
      busy.value = false
      open.value = false
    }
  }

  return {open, total, done, busy, offer, dismiss, accept}
}
