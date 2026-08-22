export default defineNuxtPlugin(() => {
  const ref = useRoute().query.ref
  if (typeof ref !== 'string' || !/^[a-zA-Z0-9_.-]{1,30}$/.test(ref)) return
  try {
    if (!localStorage.getItem('spa_ref')) localStorage.setItem('spa_ref', ref)
  } catch { /* storage unavailable */ }
})
