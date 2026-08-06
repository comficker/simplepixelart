import useStatefulCookie from "~/composables/useStatefulCookie";

export default defineNuxtPlugin(async (nuxtApp) => {
    const authTokenRefresh = useStatefulCookie('auth_token_refresh')
    const authStore = useAuthStore()
    authStore.authOAUTH()
    let retry = 0
    while (true) {
        const isSuccess = await authStore.fetchInfo()
        if (!isSuccess && authTokenRefresh.value) {
            await authStore.refreshToken(retry)
        }
        if (isSuccess || retry === 2) {
            break
        }
        retry++
    }
})
