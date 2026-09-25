/**
 * `route.path` without the locale prefix.
 *
 * Every route gained a `/ja`, `/es`, ... prefix when the site went multilingual,
 * which silently broke anything that compares the path against a literal:
 * `/ja/arts/size-16x16` stopped matching the size pattern, and the `slug` the
 * gallery sends the API stopped matching its `/arts/...` branches, so locale
 * tag and size pages listed the whole gallery instead of their own artwork.
 *
 * Use this wherever the path is being *read* as a route identity. Keep
 * `route.path` itself for anything that builds a URL, where the prefix belongs.
 */
export default function useRoutePathNoLocale() {
  const route = useRoute()
  const {locales} = useI18n()
  const codes = new Set((locales.value as { code: string }[]).map(l => l.code))

  return computed(() => {
    const [, first, ...rest] = route.path.split('/')
    return first && codes.has(first) ? '/' + rest.join('/') : route.path
  })
}
