const domain = "simplepixelart.com"

export default defineEventHandler(async (event) => {
    defaultContentType(event, "text/xml")
    return `<?xml version="1.0" encoding="UTF-8"?><?xml-stylesheet type="text/xsl" href="/sitemap-template.xsl"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://${domain}/sitemap-page.xml</loc>
    <lastmod>2023-9-20T01:41:21-07:00</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://${domain}/sitemap-tag.xml</loc>
    <lastmod>2023-9-20T01:41:21-07:00</lastmod>
  </sitemap>
</sitemapindex>
`
})
