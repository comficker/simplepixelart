import {ofetch} from "ofetch";
import {APIResponse, SharedPage} from "~/types";


const domain = "simplepixelart.com"

export default defineEventHandler(async (event) => {
    let out = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>'
    out = out + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    // Page through until exhausted (bounded for safety; one sitemap file stays
    // well under the 50k-URL limit). A failed fetch serves what we have so far
    // instead of a 500 to crawlers.
    const PER = 1000
    const MAX_PAGES = 40
    for (let page = 1; page <= MAX_PAGES; page++) {
        const res: APIResponse<SharedPage> | null = await ofetch(`https://touch.ninosaur.com/coloring/shared-pages/`, {
            query: {
                page_size: PER,
                status: 'public',
                is_template: true,
                page
            }
        }).catch(() => null)
        const results = res?.results || []
        results.forEach(item => {
            out = out + '<url>' +
                `<loc>https://${domain}/art/${item.id_string}</loc>` +
                `<lastmod>${item.updated}</lastmod>` +
                '<changefreq>daily</changefreq>' +
                '<priority>0.8</priority>' +
                '</url>'
        })
        if (!res?.links?.next || results.length < PER) break
    }
    out = out + '</urlset>'
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return out
})
