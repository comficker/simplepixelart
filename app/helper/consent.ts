// The visitor's analytics consent, as the ConsentBanner and the Consent Mode
// defaults in nuxt.config decide it: a saved choice wins; with none, the
// regions that default to denied (EEA, UK, Switzerland -- read from the time
// zone, since the page has no geo lookup) stay denied until accepted.
export const CONSENT_KEY = 'sp_consent_v1'

export function asksForConsent(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    return tz.startsWith('Europe/') || /^Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)$/.test(tz)
  } catch {
    return true
  }
}

export function analyticsDenied(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (raw) return JSON.parse(raw).choice !== 'accepted'
  } catch {}
  return asksForConsent()
}
