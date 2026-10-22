import {useEditor} from '~/stores/editor.store'

export async function resetAppData() {
  if (typeof window === 'undefined') return
  const ok = window.confirm(
      'Reset app data?\n\nThis clears local cache and storage — including any guest artwork or tilesets not yet synced — and reloads the page. Your signed-in account is not affected.',
  )
  if (!ok) return
  try { localStorage.clear() } catch {  }
  try { sessionStorage.clear() } catch {  }
  try {
    if (window.caches?.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))
    }
  } catch {  }
  try {
    // @ts-ignore — databases() is not in every lib.dom yet
    if (indexedDB?.databases) {
      // @ts-ignore
      const dbs = await indexedDB.databases()
      await Promise.all((dbs || []).map((d: any) => d?.name && indexedDB.deleteDatabase(d.name)))
    }
  } catch {  }
  location.reload()
}

// Local copies of work only -- the boards, their history and the workspace
// snapshot. Sign-in (cookies), theme, consent and other settings stay, so a
// signed-in user frees space without being logged out; their pieces come
// back from the cloud on the next load.
const LOCAL_WORK_KEYS = /^(workspaces|workspace_|histories$|spa_tileset_draft)/

export async function clearLocalWork(confirmText: string) {
  if (typeof window === 'undefined' || !window.confirm(confirmText)) return
  // Whatever is still waiting to save goes up first.
  try { await useEditor().flush() } catch {  }
  try {
    const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i))
    for (const k of keys) if (k && LOCAL_WORK_KEYS.test(k)) localStorage.removeItem(k)
  } catch {  }
  try { indexedDB.deleteDatabase('simplepixelart') } catch {  }
  location.reload()
}
