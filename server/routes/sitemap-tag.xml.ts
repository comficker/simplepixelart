import {ofetch} from "ofetch";
import {APIResponse, SharedPage} from "~/types";

const domain = "simplepixelart.com"
const LOCALES = ['ja', 'zh', 'ko', 'es', 'pt', 'ru']

export default defineEventHandler(async (event) => {
    let out = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>'
    // has_pages=1 → only tags that actually have public artworks. Empty tag pages
    // 404, so listing them here would just feed crawlers 404s. (Backend ignores
    // the param if not yet deployed → falls back to listing all tags.)
    // A failed fetch serves an empty urlset instead of a 500 to crawlers.
    // Walk every page: the first 500 alone left 600+ tags (pumpkin among them)
    // out of the sitemap.
    const tags: any[] = []
    for (let page = 1; page <= 20; page++) {
        const res: APIResponse<SharedPage> | null = await ofetch(`https://touch.ninosaur.com/coloring/tags/`, {
            query: {page_size: 500, page, has_pages: 1}
        }).catch(() => null)
        tags.push(...(res?.results || []))
        if (!res?.results?.length || tags.length >= (res.count || 0)) break
    }
    // Tag pages are index,follow with a self canonical in every locale, so each
    // locale goes in as a page of its own with the full set of alternates --
    // only for tags that have public artworks, the same set as English.
    out = out + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'
    const lastmod = new Date().toISOString()
    ;tags.forEach((item: any) => {
        const path = `/arts/${item.id_string}`
        const alts =
            `<xhtml:link rel="alternate" hreflang="x-default" href="https://${domain}${path}"/>` +
            `<xhtml:link rel="alternate" hreflang="en" href="https://${domain}${path}"/>` +
            LOCALES.map(c => `<xhtml:link rel="alternate" hreflang="${c}" href="https://${domain}/${c}${path}"/>`).join('')
        ;['', ...LOCALES.map(c => `/${c}`)].forEach(prefix => {
            out = out + '<url>' +
                `<loc>https://${domain}${prefix}${path}</loc>` +
                `<lastmod>${item.updated || lastmod}</lastmod>` +
                '<changefreq>daily</changefreq>' +
                `<priority>${prefix ? '0.6' : '0.8'}</priority>` +
                alts +
                '</url>'
        })
    })
    out = out + '</urlset>'
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return out
})
