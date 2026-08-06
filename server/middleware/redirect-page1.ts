// 301 redirect ?page=1 → canonical URL without query.
// GSC flagged 384 /arts/color-XXX?page=1 URLs as duplicates of
// /arts/color-XXX. Server-side redirect consolidates them.
export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (url.searchParams.get('page') !== '1') return
  if (!url.pathname.startsWith('/arts') && !url.pathname.startsWith('/creator')) return

  url.searchParams.delete('page')
  const target = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '')
  return sendRedirect(event, target, 301)
})
