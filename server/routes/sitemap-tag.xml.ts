import {ofetch} from "ofetch";
import {APIResponse, SharedPage} from "~/types";

const domain = "simplepixelart.com"


export default defineEventHandler(async (event) => {
    let out = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>'
    // has_pages=1 → only tags that actually have public artworks. Empty tag pages
    // 404, so listing them here would just feed crawlers 404s. (Backend ignores
    // the param if not yet deployed → falls back to listing all tags.)
    // A failed fetch serves an empty urlset instead of a 500 to crawlers.
    const res: APIResponse<SharedPage> | null = await ofetch(`https://touch.ninosaur.com/coloring/tags/`, {
        query: {
            page_size: 500,
            has_pages: 1
        }
    }).catch(() => null)
    out = out + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    const lastmod = new Date().toISOString()
    ;(res?.results || []).forEach((item: any) => {
        out = out + '<url>' +
            `<loc>https://${domain}/arts/${item.id_string}</loc>` +
            `<lastmod>${item.updated || lastmod}</lastmod>` +
            '<changefreq>daily</changefreq>' +
            '<priority>0.8</priority>' +
            '</url>'
    })
    out = out + '</urlset>'
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return out
})
