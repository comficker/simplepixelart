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
    const coverFailed = reactive<Record<number | string, boolean>>({})

    function firstItem(c: CoverRow) {
        return (Array.isArray(c.items) ? c.items : []).find((i): i is number => typeof i === 'number')
    }

    async function loadCovers() {
        // Reset alongside the covers: a one-off 404 used to pin a tile to its
        // placeholder for the rest of the session.
        for (const k of Object.keys(coverFailed)) delete coverFailed[k]
        const list = rows()
        const wanted = list.map(firstItem).filter((i): i is number => typeof i === 'number')
        if (!wanted.length) return
        try {
            const ids = [...new Set(wanted)]
            const res = await useNativeFetch<ResponseSharedPage>('/coloring/shared-pages/', {
                params: {ids: ids.join(','), page_size: ids.length},
            })
            const byId = new Map((res.results || []).map(a => [a.id, a]))
            const next: Record<number, string> = {}
            for (const c of list) {
                const first = firstItem(c)
                const art = first != null ? byId.get(first) : undefined
                if (art) next[c.id as number] = artImage(art as SharedPage)
            }
            covers.value = next
        } catch {
            // A cover is decoration; the tile falls back to its placeholder.
        }
    }

    return {covers, coverFailed, loadCovers}
}
