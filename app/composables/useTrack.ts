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
