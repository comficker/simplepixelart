import {ofetch} from "ofetch";
import type {ResponsePalette} from "~/types";

const domain = "simplepixelart.com"
const api = "https://touch.ninosaur.com"

export default defineEventHandler(async (event) => {
    let out = '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>'
    out += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    const lastmod = new Date().toISOString()

    const tags = await ofetch<{ id_string: string }[]>(`${api}/coloring/palettes/tags/`).catch(() => [])

    for (const t of (tags || [])) {
        if (!t.id_string) continue
        out += '<url>' +
            `<loc>https://${domain}/palettes/tag/${t.id_string}</loc>` +
            `<lastmod>${lastmod}</lastmod>` +
            '<changefreq>weekly</changefreq><priority>0.6</priority></url>'
    }

    const PER = 500
    const MAX_PAGES = 25
    for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await ofetch<ResponsePalette>(`${api}/coloring/palettes/`, {
            query: {page_size: PER, ordering: '-score', page},
        }).catch(() => null)
        const results = res?.results || []
        for (const p of results) {
            if (!p.id_string) continue
            out += '<url>' +
                `<loc>https://${domain}/palettes/${p.id_string}</loc>` +
                `<lastmod>${p.updated || lastmod}</lastmod>` +
                '<changefreq>monthly</changefreq><priority>0.5</priority></url>'
        }
        if (!res?.links?.next || results.length < PER) break
    }

    out += '</urlset>'
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return out
})
