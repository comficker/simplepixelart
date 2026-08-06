const domain = "simplepixelart.com"

// Interactive tool / function pages (the editor, converters, generators).
// Kept in their own segment so these high-value landing pages aren't buried
// among legal/info pages in sitemap-static.
const toolPages = [
    {loc: '/editor', changefreq: 'weekly', priority: '0.9'},
    {loc: '/convert', changefreq: 'weekly', priority: '0.9'},
    {loc: '/tilesets/slicer', changefreq: 'weekly', priority: '0.8'},
    {loc: '/tilemaps/editor', changefreq: 'weekly', priority: '0.8'},
    {loc: '/palettes/color-palette-from-image', changefreq: 'weekly', priority: '0.8'},
    {loc: '/palettes/color-palette-from-color', changefreq: 'weekly', priority: '0.8'},
]

export default defineEventHandler((event) => {
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
    const lastmod = new Date().toISOString()
    const urls = toolPages.map(p =>
        `<url>` +
        `<loc>https://${domain}${p.loc}</loc>` +
        `<lastmod>${lastmod}</lastmod>` +
        `<changefreq>${p.changefreq}</changefreq>` +
        `<priority>${p.priority}</priority>` +
        `</url>`
    ).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
})
