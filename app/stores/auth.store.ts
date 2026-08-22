import {defineStore} from 'pinia'
import useStatefulCookie from "~/composables/useStatefulCookie";
import {useNativeFetch} from "~/composables/useCustomFetch";
import {clearWorkspaceFull} from "~/helper/workspaceSnapshot";
import type {User} from "~/types";

export const useAuthStore = defineStore('auth', () => {
    const route = useRoute()
    const authToken = useStatefulCookie('auth_token')
    const authTokenRefresh = useStatefulCookie('auth_token_refresh')
    const logged = ref<User | null>(null)

    const isLogged = computed(() => !!logged.value)

    const resetCookie = () => {
        authToken.value = ""
        authTokenRefresh.value = ""
    }

    const resetStorage = () => {
        localStorage.setItem('workspace_current', "")
        localStorage.setItem('histories', "{}")
        localStorage.setItem('workspaces', "{}")
        localStorage.removeItem('workspace_layout')
        localStorage.removeItem('sp_local_tilesets')
        void clearWorkspaceFull()
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
            const res = await useNativeFetch<{ refresh?: string, access: string }>("/auth/token/refresh", {
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
        isLogged,
        fetchInfo,
        logged,
        authOAUTH,
        logout,
        refreshToken
    }
})
