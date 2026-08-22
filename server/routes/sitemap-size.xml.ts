import {ofetch} from "ofetch";

const domain = "simplepixelart.com"

export default defineEventHandler(async (event) => {
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')

    let sizes: { width: number; height: number; count: number }[] = []
    try {
        sizes = await ofetch(`https://touch.ninosaur.com/coloring/shared-pages/sizes/`)
    } catch {
        // Serve a valid empty urlset rather than a 500 — a broken sitemap is worse
        // than a stale one, and the next fetch will refill it.
    }

    const lastmod = new Date().toISOString()
    const urls = (sizes || [])
        .filter(s => s.count > 0 && s.width > 0 && s.height > 0)
        .map(s =>
            `<url>` +
            `<loc>https://${domain}/arts/size-${s.width}x${s.height}</loc>` +
            `<lastmod>${lastmod}</lastmod>` +
            `<changefreq>weekly</changefreq>` +
            // Sizes holding more art are the ones worth crawling most often.
            `<priority>${s.count >= 10 ? '0.8' : '0.6'}</priority>` +
            `</url>`
        ).join('')

    return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
})
