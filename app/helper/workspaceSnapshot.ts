// Heavy multi-board snapshot (`workspace_full`) storage.
//
// The snapshot inlines every board's pixel data, so with many/large boards it
// used to blow the ~5 MB localStorage quota and fail SILENTLY — freezing board
// positions/backgrounds at the last save that happened to fit. IndexedDB gives
// orders-of-magnitude more room, so the snapshot lives here instead.
//
// The tiny `workspace_layout` (positions + per-board bg/iso) stays in
// localStorage as the always-available fast-path overlay (see editor.store).

const DB_NAME = 'simplepixelart'
const STORE = 'kv'
const KEY = 'workspace_full'

let dbPromise: Promise<IDBDatabase> | null = null

function hasIdb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function idbGet(): Promise<any | null> {
  return openDb().then(db => new Promise((resolve) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
    r.onsuccess = () => resolve(r.result ?? null)
    r.onerror = () => resolve(null)
  }))
}

function idbPut(val: any): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(val, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

function idbDelete(): Promise<void> {
  return openDb().then(db => new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  }))
}

function lsRead(): any | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}

// Read the snapshot. Migrates (and clears) a legacy localStorage copy written by
// versions before the IndexedDB move, so existing multi-board workspaces survive.
export async function loadWorkspaceFull(): Promise<any | null> {
  if (typeof localStorage === 'undefined') return null
  if (!hasIdb()) return lsRead()
  try {
    let v = await idbGet()
    if (v == null) {
      const legacy = lsRead()
      if (legacy != null) {
        try { await idbPut(legacy) } catch { /* ignore */ }
        try { localStorage.removeItem(KEY) } catch { /* ignore */ }
        v = legacy
      }
    }
    return v
  } catch {
    return lsRead()
  }
}

export async function saveWorkspaceFull(payload: any): Promise<void> {
  if (!hasIdb()) {
    try { localStorage.setItem(KEY, JSON.stringify(payload)) } catch { /* quota */ }
    return
  }
  try { await idbPut(payload) } catch { /* ignore */ }
  // Never leave a stale legacy copy around to shadow the IndexedDB one.
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export async function clearWorkspaceFull(): Promise<void> {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  if (hasIdb()) { try { await idbDelete() } catch { /* ignore */ } }
}
