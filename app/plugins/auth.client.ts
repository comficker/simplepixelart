export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const route = useRoute()

  // After OAuth redirect, sync local work to cloud. Fire-and-forget: a slow or
  // failed sync must not block app boot — failed items stay local and the
  // store surfaces them via toast.
  if (auth.isLogged && route.query.access_token) {
    const editor = useEditor()
    editor.syncLocalToCloud().catch(() => { /* kept local */ })
  }
})
