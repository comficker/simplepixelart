import type {ResponseSharedPage} from '~/types'

export function useArtListFetch(opts: {
    limit?: number
    status?: string
    ordering?: string
    exact?: boolean
    search?: Ref<string>
} = {}) {
    const route = useRoute()
    // Route identity, not URL building: on /ja/arts/size-16x16 the raw
    // route.path matches none of the patterns below and the gallery falls back
    // to listing everything.
    const path = useRoutePathNoLocale()
    const limit = opts.limit ?? 20
    const status = opts.status ?? 'public'
    const ordering = opts.ordering ?? ''
    const exact = opts.exact ?? false
    const search = opts.search ?? ref('')

    const {pageSize} = useResultsCols()

    const effectiveLimit = computed(() => (exact ? limit : pageSize(limit)))

    const isNewView = computed(() => path.value === '/arts/new')
    const isDetailView = computed(() => path.value.startsWith('/art/'))
    const relatedId = computed(() => isDetailView.value ? route.params.id_string?.toString() : undefined)

    const sizeSlugMatch = computed(() => path.value.match(/^\/arts\/size-(\d+)x(\d+)$/i))

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

    // Pieces their artists let others use elsewhere (CC BY or CC0).
    const openLicense = computed(() => route.query.license === 'open')
    const animOnly = computed(() => route.query.is_anim === '1')
    // The gallery's sorts. Popular is the default on /arts and its tag and
    // size pages; Newest has its own path; the other two ride on ?sort=.
    const isGallery = computed(() => path.value === '/arts' || (path.value.startsWith('/arts/') && !isNewView.value))
    const sort = computed<'popular' | 'trending' | 'following' | 'liked' | 'new'>(() => {
        if (isNewView.value) return 'new'
        const q = route.query.sort
        return q === 'trending' || q === 'following' || q === 'liked' ? q : 'popular'
    })

    const params = computed(() => ({
        status: isNewView.value ? 'public,pending' : status,
        slug: isNewView.value ? '/arts' : path.value,
        page: route.query.page ? Number.parseInt(route.query.page.toString()) : 1,
        page_size: effectiveLimit.value,
        search: search.value,
        ordering: ordering || (isNewView.value ? '-updated'
            : isGallery.value && sort.value === 'popular' ? '-score,-id' : undefined),
        trending: isGallery.value && sort.value === 'trending' ? 'true' : undefined,
        following: isGallery.value && sort.value === 'following' ? 'true' : undefined,
        liked: isGallery.value && sort.value === 'liked' ? 'true' : undefined,
        is_anim: animOnly.value ? 'true' : undefined,
        related: relatedId.value,
        width: !sizeSlugMatch.value && route.query.width ? route.query.width : undefined,
        height: !sizeSlugMatch.value && route.query.height ? route.query.height : undefined,
        is_iso: isoActive.value ? '1' : undefined,
        license: openLicense.value ? 'open' : undefined,
    }))












    const fetch = useAuthFetch<ResponseSharedPage>(`/coloring/shared-pages/`, {
        query: params,
        key: `item-list:${encodeURIComponent(route.fullPath)}:${ordering || 'default'}:${limit}`,
    })

    return {fetch, isNewView, sizeSlugMatch, currentSize, isoActive, openLicense, animOnly, sort, search, effectiveLimit}
}
