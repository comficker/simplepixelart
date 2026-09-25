const domain = "simplepixelart.com"

const toolPages = [
    {loc: '/editor', changefreq: 'weekly', priority: '0.9'},
    {loc: '/converter', changefreq: 'weekly', priority: '0.9'},
    {loc: '/generator', changefreq: 'weekly', priority: '0.9'},
    {loc: '/tilesets/editor', changefreq: 'weekly', priority: '0.8'},
    {loc: '/tilesets/slicer', changefreq: 'weekly', priority: '0.8'},
    {loc: '/tilemaps/editor', changefreq: 'weekly', priority: '0.8'},
    {loc: '/palettes/color-palette-from-image', changefreq: 'weekly', priority: '0.8'},
    {loc: '/palettes/color-palette-from-color', changefreq: 'weekly', priority: '0.8'},
]

// Every tool page is fully translated -- chrome, README and FAQ -- so each
// locale is a page of its own and belongs in the sitemap with its alternates.
const LOCALES = ['ja', 'zh', 'ko', 'es', 'pt', 'ru']
const localise = (loc: string, code: string) => `https://${domain}/${code}${loc}`

export default defineEventHandler((event) => {
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
    const lastmod = new Date().toISOString()
    const urls = toolPages.flatMap(p => {
        const alts =
            `<xhtml:link rel="alternate" hreflang="x-default" href="https://${domain}${p.loc}"/>` +
            `<xhtml:link rel="alternate" hreflang="en" href="https://${domain}${p.loc}"/>` +
            LOCALES.map(c => `<xhtml:link rel="alternate" hreflang="${c}" href="${localise(p.loc, c)}"/>`).join('')
        const entry = (loc: string) =>
            `<url>` +
            `<loc>${loc}</loc>` +
            `<lastmod>${lastmod}</lastmod>` +
            `<changefreq>${p.changefreq}</changefreq>` +
            `<priority>${p.priority}</priority>` +
            alts +
            `</url>`
        return [entry(`https://${domain}${p.loc}`), ...LOCALES.map(c => entry(localise(p.loc, c)))]
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`
})
