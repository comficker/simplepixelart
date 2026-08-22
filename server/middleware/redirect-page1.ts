export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  if (url.searchParams.get('page') !== '1') return
  if (!url.pathname.startsWith('/arts') && !url.pathname.startsWith('/creator')) return

  url.searchParams.delete('page')
  const target = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '')
  return sendRedirect(event, target, 301)
})
