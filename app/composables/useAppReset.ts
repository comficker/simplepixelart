export async function resetAppData() {
  if (typeof window === 'undefined') return
  const ok = window.confirm(
      'Reset app data?\n\nThis clears local cache and storage — including any guest artwork or tilesets not yet synced — and reloads the page. Your signed-in account is not affected.',
  )
  if (!ok) return
  try { localStorage.clear() } catch { /* ignore */ }
  try { sessionStorage.clear() } catch { /* ignore */ }
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch { /* ignore */ }
  try {
    // @ts-ignore — databases() is not in every lib.dom yet
    if (indexedDB?.databases) {
      // @ts-ignore
      const dbs = await indexedDB.databases()
      await Promise.all((dbs || []).map((d: any) => d?.name && indexedDB.deleteDatabase(d.name)))
    }
  } catch { /* ignore */ }
  location.reload()
}
