import useStatefulCookie from '~/composables/useStatefulCookie'

const MAX = 11

export function useHasWork() {
    const flag = useStatefulCookie('has_work')


    const count = computed(() => {
        const n = Number(flag.value ?? 0)
        return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), MAX) : 0
    })

    return {
        hasWork: computed(() => count.value > 0),
        workCount: count,
        
        markHasWork() {
            if (count.value < 1) flag.value = '1'
        },
        
        setWorkCount(n: number) {
            const v = n > 0 ? String(Math.min(n, MAX)) : null
            if (String(flag.value ?? '') !== String(v ?? '')) flag.value = v
        },
    }
}
