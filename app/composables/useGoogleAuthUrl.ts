export const useGoogleAuthUrl = () => {
    const config = useRuntimeConfig()
    const requestURL = useRequestURL()

    return computed(() => {
        const apiBase = (config.public.api as string) || ''
        const next = `${requestURL.origin}/auth/callback`
        return `${apiBase}/auth/google?state=${encodeURIComponent(next)}`
    })
}
