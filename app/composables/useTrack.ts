// GA4 events, sent through the Firebase Analytics instance the firebase
// plugin starts once the page settles. Events fired before it is up wait in
// a short queue; in dev (no analytics) they go nowhere. Names follow the
// mobile app's where the action is the same (new_canvas, art_remix), and
// GA's recommended ones otherwise (login, sign_up).
type TrackParams = Record<string, string | number | boolean | undefined>

let send: ((name: string, params?: TrackParams) => void) | null = null
const pending: [string, TrackParams | undefined][] = []

export function track(name: string, params?: TrackParams) {
  if (import.meta.server) return
  if (send) send(name, params)
  else if (pending.length < 50) pending.push([name, params])
}

export function setTracker(fn: (name: string, params?: TrackParams) => void) {
  send = fn
  for (const [name, params] of pending.splice(0)) fn(name, params)
}

// A short, low-cardinality reason for a *_failed event: the backend's error
// code when it sent one (ART_EMPTY...), else what kind of failure it was.
// Never the raw message -- that would put free text into GA.
export function failReason(e: any): string {
  const data = e?.response?._data ?? e?.data
  const code = Array.isArray(data) ? data[0] : undefined
  if (typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code)) return code
  const status = e?.statusCode ?? e?.response?.status
  if (status) return `http_${status}`
  if (e?.name === 'AbortError' || /timeout/i.test(e?.message || '')) return 'timeout'
  if (e?.name === 'FetchError') return 'network'
  if (e?.name === 'QuotaExceededError') return 'storage_full'
  return e?.name || 'error'
}
