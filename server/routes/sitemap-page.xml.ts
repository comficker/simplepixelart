import {ofetch} from "ofetch";

const domain = "simplepixelart.com"

type Row = { id_string: string; updated: string }

export default defineEventHandler(async (event) => {
    // Only the art the page will actually let Google index. This used to list
    // every public template, but /art/<slug> noindexes anything without a
    // description or matching the IP deny-list -- 190 of 393 URLs, which is
    // most of Search Console's "Excluded by 'noindex' tag". The backend owns
    // the rule (SharedPage.is_indexable) so the sitemap and the page cannot
    // disagree again.
    // A failed fetch serves a valid empty urlset rather than a 500 to crawlers.
    const rows: Row[] | null = await ofetch(
        `https://touch.ninosaur.com/coloring/shared-pages/indexable/`,
    ).catch(() => null)

    const lastmod = new Date().toISOString()
    const urls = (rows || []).map(r =>
        '<url>' +
        `<loc>https://${domain}/art/${r.id_string}</loc>` +
        `<lastmod>${r.updated || lastmod}</lastmod>` +
        '<changefreq>weekly</changefreq>' +
        '<priority>0.8</priority>' +
        '</url>',
    ).join('')

    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=3600, stale-while-revalidate=86400')
    return '<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>' +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
})
