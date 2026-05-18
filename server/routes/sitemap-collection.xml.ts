import {ofetch} from "ofetch";
import {APIResponse, Collection} from "~/types";

const domain = "simplepixelart.com"

export default defineEventHandler(async (event) => {
    let out = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>'
    const res: APIResponse<Collection & {updated?: string}> = await ofetch(
        `https://touch.ninosaur.com/coloring/collections/`,
        {
            query: {
                page_size: 200,
                status: 'public',
                ordering: '-updated',
            },
        },
    )
    out = out + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    const lastmod = new Date().toISOString()
    res.results.forEach((item: any) => {
        if (!item.id_string) return
        out = out + '<url>' +
            `<loc>https://${domain}/collections/${item.id_string}</loc>` +
            `<lastmod>${item.updated || lastmod}</lastmod>` +
            '<changefreq>weekly</changefreq>' +
            '<priority>0.7</priority>' +
            '</url>'
    })
    out = out + '</urlset>'
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return out
})
