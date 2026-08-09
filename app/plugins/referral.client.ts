// Capture ?ref=<username or id> from the landing URL. It waits in localStorage
// until the visitor signs in, then attachPendingReferral()
// (composables/useReferral) binds the new account to its inviter. First ref
// wins — a later link can't steal the attribution.
export default defineNuxtPlugin(() => {
  const ref = useRoute().query.ref
  if (typeof ref !== 'string' || !/^[a-zA-Z0-9_.-]{1,30}$/.test(ref)) return
  try {
    if (!localStorage.getItem('spa_ref')) localStorage.setItem('spa_ref', ref)
  } catch { /* storage unavailable */ }
})
