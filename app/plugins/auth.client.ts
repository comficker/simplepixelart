export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const route = useRoute()

  if (auth.isLogged && route.query.access_token) {
    const editor = useEditor()
    editor.syncLocalToCloud().catch(() => { /* kept local */ })
  }
})
