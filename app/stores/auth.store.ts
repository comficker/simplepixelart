import {defineStore} from 'pinia'
import useStatefulCookie from "~/composables/useStatefulCookie";
import {useNativeFetch} from "~/composables/useCustomFetch";
import type {User} from "~/types";

export const useAuthStore = defineStore('auth', () => {
    const route = useRoute()
    const authToken = useStatefulCookie('auth_token')
    const authTokenRefresh = useStatefulCookie('auth_token_refresh')
    const logs = ref<any[]>([])
    const activeAuth = ref('local')
    const logged = ref<User | null>(null)

    const isLogged = computed(() => !!logged.value)

    const logging = (message: any) => {
        console.log(message);
        logs.value.push(message)
    }

    const resetCookie = () => {
        authToken.value = ""
        authTokenRefresh.value = ""
    }

    const resetStorage = () => {
        localStorage.setItem('workspace_current', "")
        localStorage.setItem('histories', "{}")
        localStorage.setItem('workspaces', "{}")
    }

    const authOAUTH = () => {
        if (route.query.access_token) {
            authToken.value = route.query.access_token + ''
            if (route.query.refresh_token) {
                authTokenRefresh.value = route.query.refresh_token + ''
            }
        }
    }

    const refreshToken = async (retry = 0) => {
        if (authTokenRefresh.value && retry == 0) {
            const res = await useNativeFetch<{ refresh: string, access: string }>("/auth-refresh-token", {
                method: 'POST',
                body: {
                    "refresh": authTokenRefresh.value
                }
            }).catch(() => null)
            if (res) {
                authToken.value = res.access
                return
            }
        } else {
            authToken.value = ''
            authTokenRefresh.value = ''
        }
    }

    const authLocal = async (isRegister: boolean, form: {
        email: string,
        username: string,
        password: string,
        re_password?: string,
        invite_code?: string
    }) => {
        resetCookie()
        const path = isRegister ? '/auth/register' : '/auth/login'
        const res = await useNativeFetch<{ refresh: string, access: string }>(path, {
            method: 'POST',
            body: form
        }).catch(() => {
            return null
        })
        if (res) {
            authToken.value = res.access
            authTokenRefresh.value = res.refresh
        }
    }

    const logout = async () => {
        resetCookie()
        resetStorage()
        await useRouter().push('/')
        await fetchInfo()
    }

    async function fetchInfo() {
        if (authToken.value) {
            const res = await useNativeFetch<User>('/auth/user').catch(() => {
                authToken.value = ''
                return null
            })
            logged.value = res
            return res
        }
        logged.value = null
        return null
    }

    return {
        activeAuth,
        isLogged,
        fetchInfo,
        logged,
        logs,
        authLocal,
        authOAUTH,
        logout,
        logging,
        refreshToken
    }
})

