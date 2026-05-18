const domain = "simplepixelart.com"

const staticPages = [
    {loc: '/', changefreq: 'daily', priority: '1.0'},
    {loc: '/editor', changefreq: 'weekly', priority: '0.9'},
    {loc: '/convert', changefreq: 'weekly', priority: '0.9'},
    {loc: '/arts', changefreq: 'daily', priority: '0.8'},
    {loc: '/about', changefreq: 'monthly', priority: '0.4'},
    {loc: '/contact', changefreq: 'yearly', priority: '0.3'},
    {loc: '/privacy', changefreq: 'yearly', priority: '0.3'},
    {loc: '/terms', changefreq: 'yearly', priority: '0.3'},
    {loc: '/guidelines', changefreq: 'yearly', priority: '0.3'},
    {loc: '/dmca', changefreq: 'yearly', priority: '0.3'},
]

export default defineEventHandler((event) => {
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
    const lastmod = new Date().toISOString()
    const urls = staticPages.map(p =>
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
