import useStatefulCookie from '~/composables/useStatefulCookie'

export const RESULTS_COLS = [4, 6, 8, 10, 12] as const

export const RESULTS_ROWS = 4

export type ResultsCols = typeof RESULTS_COLS[number] | 'auto'

export const useResultsCols = () => {
    const cookie = useStatefulCookie('results_cols')

    const current = computed<ResultsCols>(() => {
        const n = Number(cookie.value)
        return (RESULTS_COLS as readonly number[]).includes(n) ? (n as ResultsCols) : 'auto'
    })

    return {
        current,
        options: RESULTS_COLS,

        style: computed(() => (current.value === 'auto' ? '' : `--results-cols: ${current.value}`)),

        pageSize: (fallback: number, rows = RESULTS_ROWS) =>
            current.value === 'auto' ? fallback : (current.value as number) * rows,

        setResultsCols(v: ResultsCols) {
            cookie.value = v === 'auto' ? null : String(v)
        },
    }
}
