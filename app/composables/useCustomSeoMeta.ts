import {toValue, type MaybeRefOrGetter} from 'vue'

type V = MaybeRefOrGetter<string | undefined>

export interface UseSeoMetaOptions {
  title?: V;
  description?: V;
  keywords?: V;
  canonical?: V;
  ogImage?: V;
  ogType?: V;
  articleSection?: V;
  author?: V;
  publishedTime?: V;
  modifiedTime?: V;
  robots?: V;
  /**
   * The page's visible content is not localised -- artwork, tag, palette and
   * user names all come from the API in English, and the legal pages are
   * English-only by choice. Such a page exists under every locale prefix but
   * reads the same in all of them, so only the default locale is worth
   * indexing; the rest would compete as near-duplicates.
   */
  untranslated?: boolean;
  script?: any[]
}

export const useCustomSeoMeta = (options: UseSeoMetaOptions) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.siteUrl || 'https://simplepixelart.com';

  if (!options.title) return
  const v = (g: V) => () => toValue(g)

  // Pages pass a canonical without a locale in it, so on /ja every page was
  // pointing Google back at the English URL -- telling it the Japanese page was
  // a duplicate and should not be indexed at all. Put the prefix back.
  const {locale, defaultLocale} = useI18n()
  const localised = (g: V) => () => {
    const url = toValue(g)
    if (!url) return url
    const code = toValue(locale)
    if (!code || code === defaultLocale) return url
    try {
      const u = new URL(url, baseUrl)
      if (u.pathname.startsWith(`/${code}/`) || u.pathname === `/${code}`) return u.toString()
      u.pathname = `/${code}${u.pathname === '/' ? '' : u.pathname}`
      return u.toString().replace(/\/$/, '')
    } catch {
      return url
    }
  }
  useHead({
    title: v(options.title),
    meta: [
      { name: 'description', content: v(options.description) },
      { name: 'keywords', content: v(options.keywords) },
      { name: 'author', content: () => toValue(options.author) || 'SimplePixelArt.com' },
      { name: 'robots', content: () => {
        const own = toValue(options.robots) || 'index, follow'
        if (!options.untranslated) return own
        const code = toValue(locale)
        return !code || code === defaultLocale ? own : 'noindex, follow'
      } },

      { property: 'og:title', content: v(options.title) },
      { property: 'og:description', content: v(options.description) },
      { property: 'og:type', content: () => toValue(options.ogType) || 'website' },
      { property: 'og:url', content: localised(options.canonical) },
      { property: 'og:site_name', content: 'SimplePixelArt.com' },
      { property: 'og:image', content: () => toValue(options.ogImage) || `${baseUrl}/og-image.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: v(options.title) },

      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@comficker' },
      { name: 'twitter:creator', content: '@comficker' },
      { name: 'twitter:title', content: v(options.title) },
      { name: 'twitter:description', content: v(options.description) },
      { name: 'twitter:image', content: () => toValue(options.ogImage) || `${baseUrl}/og-image.png` },

      ...(options.articleSection ? [{ property: 'article:section', content: v(options.articleSection) }] : []),
      ...(options.publishedTime ? [{ property: 'article:published_time', content: v(options.publishedTime) }] : []),
      ...(options.modifiedTime ? [{ property: 'article:modified_time', content: v(options.modifiedTime) }] : [])
    ],
    script: options.script ?? [],
    link: [
        ...options.canonical ? [{ rel: 'canonical', href: localised(options.canonical) }] : [],
    ]
  });
};
