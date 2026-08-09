// Attach the pending referral (?ref= captured on landing) to the signed-in
// account. Safe to call repeatedly: no stored ref → no-op; the backend only
// accepts fresh, un-referred accounts, and definitive rejections clear the
// stored ref so we stop retrying.
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
    // 400/409 = rejected for good (own link, old account, already bound).
    if (s === 400 || s === 409) {
      try { localStorage.removeItem('spa_ref') } catch { /* ignore */ }
    }
  }
}
