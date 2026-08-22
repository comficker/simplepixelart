import type {ResponseSharedPage} from '~/types'

export function useArtListFetch(opts: {
    limit?: number
    status?: string
    ordering?: string
    hideIp?: boolean
    search?: Ref<string>
} = {}) {
    const route = useRoute()
    const limit = opts.limit ?? 20
    const status = opts.status ?? 'public'
    const ordering = opts.ordering ?? ''
    const hideIp = opts.hideIp ?? false
    const search = opts.search ?? ref('')

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
        page_size: hideIp ? limit + 6 : limit,
        search: search.value,
        ordering: ordering || (isNewView.value ? '-updated' : undefined),
        related: relatedId.value,
        width: !sizeSlugMatch.value && route.query.width ? route.query.width : undefined,
        height: !sizeSlugMatch.value && route.query.height ? route.query.height : undefined,
        is_iso: isoActive.value ? '1' : undefined,
    }))

    // Key includes the props that change the query (ordering/limit) so two lists
    // on the same route — e.g. homepage "What's new" vs another feed — never
    // share a cache entry and render identical data.
    //
    // The path is URI-encoded on purpose. This key ships inside the SSR payload,
    // and the previous form `/arts/steve|default|20` reads as a URL path —
    // Googlebot extracted it and crawled it as a real page. That page then
    // emitted its own key (`…|default|20|default|20`), which got crawled too: an
    // unbounded, self-feeding crawl trap of near-duplicate listings. Encoding
    // drops the slashes so nothing in the key can be mistaken for a path.
    // Don't "tidy" this back into a raw path.
    const fetch = useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
        query: params,
        key: `item-list:${encodeURIComponent(route.fullPath)}:${ordering || 'default'}:${limit}`,
    })

    return {fetch, isNewView, sizeSlugMatch, currentSize, isoActive, search}
}
