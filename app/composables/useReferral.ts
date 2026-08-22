export async function attachPendingReferral() {
  if (import.meta.server) return
  let ref: string | null = null
  try { ref = localStorage.getItem('spa_ref') } catch { return }
  if (!ref) return
  try {
    await useNativeFetch('/coloring/economy/referral/attach/', {
      method: 'POST', body: {ref},
    })
    localStorage.removeItem('spa_ref')
  } catch (e: any) {
    const s = e?.status ?? e?.response?.status
    if (s === 400 || s === 409) {
      try { localStorage.removeItem('spa_ref') } catch { /* ignore */ }
    }
  }
}
