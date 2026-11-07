import type {ResponseSharedPage, SharedPage} from '~/types'

type CoverRow = { id?: number | string | null; items?: unknown[] | null }

/** Cover image per collection, keyed by collection id.
 *
 *  The list endpoint sends `items` as bare row ids, so there is nothing to
 *  build an image URL from: the first id of each collection is resolved in a
 *  single request for the whole page rather than one per tile. */
export const useCollectionCovers = (rows: () => CoverRow[]) => {
    const artImage = useArtImage()
    const covers = ref<Record<number, string>>({})
    // Up to four pieces per collection, for a mosaic cover.
    const mosaics = ref<Record<number, string[]>>({})
    const coverFailed = reactive<Record<number | string, boolean>>({})

    const idsOf = (c: CoverRow) => (Array.isArray(c.items) ? c.items : []).filter((i): i is number => typeof i === 'number')
    function firstItem(c: CoverRow) {
        return idsOf(c)[0]
    }

    async function loadCovers() {
        // Reset alongside the covers: a one-off 404 used to pin a tile to its
        // placeholder for the rest of the session.
        for (const k of Object.keys(coverFailed)) delete coverFailed[k]
        const list = rows()
        const wanted = list.flatMap(c => idsOf(c).slice(0, 4))
        if (!wanted.length) return
        try {
            const ids = [...new Set(wanted)]
            // The list endpoint caps a page, so a page of mosaics (four ids a
            // collection) goes in a few requests.
            const chunks: number[][] = []
            for (let i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40))
            const pages = await Promise.all(chunks.map(c => useNativeFetch<ResponseSharedPage>('/coloring/shared-pages/', {
                params: {ids: c.join(','), page_size: c.length},
            })))
            const byId = new Map(pages.flatMap(r => r.results || []).map(a => [a.id, a]))
            const next: Record<number, string> = {}
            const nextMosaic: Record<number, string[]> = {}
            for (const c of list) {
                const first = firstItem(c)
                const art = first != null ? byId.get(first) : undefined
                if (art) next[c.id as number] = artImage(art as SharedPage)
                const four = idsOf(c).slice(0, 4).map(i => byId.get(i)).filter(Boolean).map(a => artImage(a as SharedPage))
                if (four.length) nextMosaic[c.id as number] = four
            }
            covers.value = next
            mosaics.value = nextMosaic
        } catch {
            // A cover is decoration; the tile falls back to its placeholder.
        }
    }

    return {covers, mosaics, coverFailed, loadCovers}
}
