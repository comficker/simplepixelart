// 301 redirect legacy API-style URLs that Google indexed as 404.
// GSC reported 106 pages under /coloring/* and /~partytown/ paths —
// these are API routes from the backend, never meant to be crawled.
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const path = url.pathname

  // /coloring/shared-pages/<slug>/ → /art/<slug>
  const sharedMatch = path.match(/^\/coloring\/shared-pages\/([^\/]+)\/?$/)
  if (sharedMatch && sharedMatch[1]) {
    return sendRedirect(event, `/art/${sharedMatch[1]}`, 301)
  }

  // /coloring/shared-pages/ or /coloring/shared-pages → /arts
  if (path === '/coloring/shared-pages/' || path === '/coloring/shared-pages') {
    return sendRedirect(event, '/arts', 301)
  }

  // /coloring/tags/ or /coloring/tags → /arts
  if (path === '/coloring/tags/' || path === '/coloring/tags') {
    return sendRedirect(event, '/arts', 301)
  }

  // /art/ empty → /arts
  if (path === '/art/' || path === '/art') {
    return sendRedirect(event, '/arts', 301)
  }

  // /~partytown/ legacy leftover → home
  if (path.startsWith('/~partytown')) {
    return sendRedirect(event, '/', 301)
  }
})
