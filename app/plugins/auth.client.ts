export default defineNuxtPlugin(async (nuxtApp) => {
  const auth = useAuthStore()
  const route = useRoute()

  // After OAuth redirect, sync local work to cloud
  if (auth.isLogged && route.query.access_token) {
    const editor = useEditor()
    await editor.syncLocalToCloud()
  }

  return {
    provide: {
      authClient: async () => {
      }
    }
  }
})
