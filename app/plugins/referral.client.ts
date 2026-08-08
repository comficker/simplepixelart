// Capture ?ref=<user id> from the landing URL. It waits in localStorage until
// the visitor signs in, then attachPendingReferral() (composables/useReferral)
// binds the new account to its inviter. First ref wins — a later link can't
// steal the attribution.
export default defineNuxtPlugin(() => {
  const ref = useRoute().query.ref
  if (typeof ref !== 'string' || !/^\d+$/.test(ref)) return
  try {
    if (!localStorage.getItem('spa_ref')) localStorage.setItem('spa_ref', ref)
  } catch { /* storage unavailable */ }
})
