/**
 * Rewrite the internal links inside a translated HTML string so they keep the
 * current locale prefix.
 *
 * Some copy carries its own markup and is rendered through v-html (i18n.config
 * sets escapeHtml: false for exactly this). The hrefs in it are written bare --
 * "/editor" -- so under /ja they sent the reader back to the English page. Doing
 * it here rather than prefixing the href in all seven locale files means a new
 * translated string cannot forget to.
 */
export function useLocalHtml() {
  const localePath = useLocalePath()
  // (?!\/) so a protocol-relative "//host" is left alone rather than treated
  // as a route.
  return (html?: string | null) =>
      (html || '').replace(/href="(\/(?!\/)[^"]*)"/g, (_, path) => `href="${localePath(path)}"`)
}
