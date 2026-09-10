import type {ResponseSharedPage} from '~/types'

export function useArtListFetch(opts: {
    limit?: number
    status?: string
    ordering?: string
    hideIp?: boolean
    exact?: boolean
    search?: Ref<string>
} = {}) {
    const route = useRoute()
    const limit = opts.limit ?? 20
    const status = opts.status ?? 'public'
    const ordering = opts.ordering ?? ''
    const hideIp = opts.hideIp ?? false
    const exact = opts.exact ?? false
    const search = opts.search ?? ref('')

    const {pageSize} = useResultsCols()

    const effectiveLimit = computed(() => (exact ? limit : pageSize(limit)))

    const isNewView = computed(() => route.path === '/arts/new')
    const isDetailView = computed(() => route.path.startsWith('/art/'))
    const relatedId = computed(() => isDetailView.value ? route.params.id_string?.toString() : undefined)

    const sizeSlugMatch = computed(() => route.path.match(/^\/arts\/size-(\d+)x(\d+)$/i))

    const currentSize = computed(() => {
        if (sizeSlugMatch.value) {
            return {width: parseInt(sizeSlugMatch.value[1]!), height: parseInt(sizeSlugMatch.value[2]!)}
        }
        const w = route.query.width
        const h = route.query.height
        if (w && h) {
            const wn = parseInt(w.toString())
            const hn = parseInt(h.toString())
            if (!Number.isNaN(wn) && !Number.isNaN(hn)) return {width: wn, height: hn}
        }
        return null
    })

    const isoActive = computed(() =>
        route.query.is_iso === '1' || route.query.is_iso === 'true',
    )

    const params = computed(() => ({
        status: isNewView.value ? 'public,pending' : status,
        slug: isNewView.value ? '/arts' : route.path,
        page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
        page_size: hideIp ? effectiveLimit.value + 6 : effectiveLimit.value,
        search: search.value,
        ordering: ordering || (isNewView.value ? '-updated' : undefined),
        related: relatedId.value,
        width: !sizeSlugMatch.value && route.query.width ? route.query.width : undefined,
        height: !sizeSlugMatch.value && route.query.height ? route.query.height : undefined,
        is_iso: isoActive.value ? '1' : undefined,
    }))












    const fetch = useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
        query: params,
        key: `item-list:${encodeURIComponent(route.fullPath)}:${ordering || 'default'}:${limit}`,
    })

    return {fetch, isNewView, sizeSlugMatch, currentSize, isoActive, search, effectiveLimit}
}
