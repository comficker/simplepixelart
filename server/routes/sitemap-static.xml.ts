const domain = "simplepixelart.com"

const staticPages = [
    {loc: '/', changefreq: 'daily', priority: '1.0'},
    {loc: '/easy-pixel-art', changefreq: 'monthly', priority: '0.9'},
    {loc: '/palettes', changefreq: 'daily', priority: '0.8'},
    {loc: '/arts', changefreq: 'daily', priority: '0.8'},
    {loc: '/creator', changefreq: 'daily', priority: '0.7'},
    {loc: '/about', changefreq: 'monthly', priority: '0.4'},
    {loc: '/contact', changefreq: 'yearly', priority: '0.3'},
    {loc: '/privacy', changefreq: 'yearly', priority: '0.3'},
    {loc: '/terms', changefreq: 'yearly', priority: '0.3'},
    {loc: '/guidelines', changefreq: 'yearly', priority: '0.3'},
    {loc: '/dmca', changefreq: 'yearly', priority: '0.3'},
]

// Locale codes are only listed for pages whose content is actually translated.
// Submitting /ja/privacy while it still reads in English would be asking Google
// to index a page that does not deliver what the URL promises.
const LOCALES = ['ja', 'zh', 'ko', 'es', 'pt', 'ru']
const TRANSLATED = new Set(['/', '/arts', '/palettes', '/easy-pixel-art', '/creator', '/about', '/contact'])

const localise = (loc: string, code: string) =>
    `https://${domain}/${code}${loc === '/' ? '' : loc}`

export default defineEventHandler((event) => {
    defaultContentType(event, "text/xml")
    setHeader(event, 'cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
    const lastmod = new Date().toISOString()
    const urls = staticPages.flatMap(p => {
        const translated = TRANSLATED.has(p.loc)
        const alts = !translated ? '' :
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
        return [
            entry(`https://${domain}${p.loc}`),
            ...(translated ? LOCALES.map(c => entry(localise(p.loc, c))) : []),
        ]
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`
})
