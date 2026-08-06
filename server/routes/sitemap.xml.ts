export default defineEventHandler((event) => {
    // robots.txt points at /sitemap-index.xml, but crawlers and third-party SEO
    // tools probe /sitemap.xml unconditionally and were getting a 404. Redirect
    // instead of duplicating the index body, so there's still one source of truth.
    return sendRedirect(event, '/sitemap-index.xml', 301)
})
