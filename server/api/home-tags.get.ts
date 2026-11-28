// Popular tags for the home page, each with one cover art.
//
// The tag API carries no image, so a cover is the tag's top art. Done here
// rather than in the browser: one small cached response instead of a tag call
// plus one call per tag on every visit. The home page asks for it only once
// the section nears the viewport, so none of this is on its first render.
const LANGS = new Set(['en', 'ja', 'zh', 'ko', 'es', 'pt', 'ru'])
const LIMIT = 20

type Tag = { id_string: string; title?: string; name?: string }
type Art = { id_string: string; name?: string; updated?: string; width?: number | string; height?: number | string }

export type HomeTag = {
    slug: string
    title: string
    count: number
    cover: { slug: string; name: string; updated: string | null; w: number; h: number } | null
}

export default defineCachedEventHandler(async (event): Promise<HomeTag[]> => {
    const lang = langOf(event)
    const api = useRuntimeConfig().public.api as string
    const headers = {'Accept-Language': lang}

    const tags = await $fetch<{ results?: Tag[] }>(`${api}/coloring/tags/`, {
        query: {page_size: LIMIT, popular: 1},
        headers,
        timeout: 8000,
    }).then(r => r.results || [])

    // A few top arts per tag, so two tags whose best piece is the same art
    // (1-bit and icons) still show different covers.
    const lists = await Promise.all(tags.map(t =>
        $fetch<{ count?: number; results?: Art[] }>(`${api}/coloring/shared-pages/`, {
            query: {slug: `/arts/${t.id_string}`, status: 'public', page_size: 4, ordering: '-score,-id'},
            headers,
            timeout: 8000,
        }).catch(() => null),
    ))

    const used = new Set<string>()
    const rows: HomeTag[] = []
    tags.forEach((t, i) => {
        const res = lists[i]
        const arts = res?.results || []
        const a = arts.find(x => !used.has(x.id_string)) || arts[0]
        if (!res?.count || !a) return
        used.add(a.id_string)
        rows.push({
            slug: t.id_string,
            title: t.title || t.name || t.id_string,
            count: res.count,
            cover: {slug: a.id_string, name: a.name || '', updated: a.updated || null, w: Number(a.width) || 0, h: Number(a.height) || 0},
        })
    })

    setResponseHeader(event, 'cache-control', 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400')
    return rows
}, {
    name: 'home-tags-v3',
    maxAge: 60 * 60 * 6,
    swr: true,
    getKey: event => langOf(event),
})

function langOf(event: Parameters<typeof getQuery>[0]): string {
    const l = String(getQuery(event).lang || 'en')
    return LANGS.has(l) ? l : 'en'
}
