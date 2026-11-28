// Every tag worth a page, for /tags: the same set the tag sitemap lists
// (public art, at least MIN_TAG_ARTS pieces), most-used first. Walking it
// takes a couple of 500-row calls, so it is done here once and cached rather
// than on every render of the page.
import {MIN_TAG_ARTS} from '~/helper/thin-tags'

const LANGS = new Set(['en', 'ja', 'zh', 'ko', 'es', 'pt', 'ru'])

export type TagIndexRow = { slug: string; title: string }

export default defineCachedEventHandler(async (event): Promise<TagIndexRow[]> => {
    const lang = langOf(event)
    const api = useRuntimeConfig().public.api as string
    const out: TagIndexRow[] = []
    for (let page = 1; page <= 10; page++) {
        const res = await $fetch<{ count?: number; results?: { id_string: string; title?: string; name?: string }[] }>(
            `${api}/coloring/tags/`, {
                query: {page_size: 500, page, popular: 1, has_pages: 1, min_pages: MIN_TAG_ARTS},
                headers: {'Accept-Language': lang},
                timeout: 10000,
            },
        )
        for (const t of res.results || []) out.push({slug: t.id_string, title: t.title || t.name || t.id_string})
        if (!res.results?.length || out.length >= (res.count || 0)) break
    }
    setResponseHeader(event, 'cache-control', 'public, max-age=600, s-maxage=21600, stale-while-revalidate=86400')
    return out
}, {
    name: 'tags-index',
    maxAge: 60 * 60 * 6,
    swr: true,
    getKey: event => langOf(event),
})

function langOf(event: Parameters<typeof getQuery>[0]): string {
    const l = String(getQuery(event).lang || 'en')
    return LANGS.has(l) ? l : 'en'
}
