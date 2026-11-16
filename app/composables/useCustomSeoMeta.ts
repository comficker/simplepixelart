import {toValue, shallowRef, type MaybeRefOrGetter, type Ref} from 'vue'

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
   * reads the same in all of them: the locale copies canonicalise to the
   * English URL and advertise no hreflang alternates of their own.
   */
  untranslated?: boolean;
  script?: any[]
}

/**
 * Whether the current page should drop its non-default hreflang alternates.
 * app.vue owns the hreflang set; the page knows whether its localised copies
 * are worth anything. Kept on nuxtApp (per request on the server) rather than
 * useState because the getter reads the page's own reactive data.
 */
export const useSeoAlternatesFlag = () => {
  const nuxtApp = useNuxtApp() as any
  return (nuxtApp._seoAltFlag ||= shallowRef<{ path: string, hide: () => boolean } | null>(null)) as
    Ref<{ path: string, hide: () => boolean } | null>
}

export const useCustomSeoMeta = (options: UseSeoMetaOptions) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.siteUrl || 'https://simplepixelart.com';

  if (!options.title) return
  const v = (g: V) => () => toValue(g)
  // Search engines cut descriptions near 160 characters; end on a whole word.
  const desc = () => {
    const s = toValue(options.description)
    if (!s || s.length <= 160) return s
    return s.slice(0, 157).replace(/\s+\S*$/, '').replace(/[\s,.;:—–-]+$/, '') + '…'
  }

  // Pages pass a canonical without a locale in it, so on /ja every page was
  // pointing Google back at the English URL -- telling it the Japanese page was
  // a duplicate and should not be indexed at all. Put the prefix back.
  const {locale, defaultLocale} = useI18n()
  const localised = (g: V) => () => {
    const url = toValue(g)
    if (!url) return url
    // An untranslated page reads the same under /ja as under /, so its
    // localised copy is a duplicate: point it at the English original.
    if (options.untranslated) return url
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
  // GSC 16/11/2026: ~45K URLs "Excluded by noindex", 94% of them /ja,/ru,…
  // copies that Google found through hreflang on the English page. Only
  // advertise localised alternates when they are indexable.
  useSeoAlternatesFlag().value = {
    path: useRoute().path,
    hide: () => !!options.untranslated || /noindex/.test(toValue(options.robots) || ''),
  }

  useHead({
    title: v(options.title),
    meta: [
      { name: 'description', content: desc },
      { name: 'keywords', content: v(options.keywords) },
      { name: 'author', content: () => toValue(options.author) || 'SimplePixelArt.com' },
      // An untranslated page's locale copy is not noindex: its canonical
      // already points at the English URL, and noindex next to a canonical
      // elsewhere is a mixed signal Google reports as 45K excluded URLs.
      { name: 'robots', content: () => toValue(options.robots) || 'index, follow' },

      { property: 'og:title', content: v(options.title) },
      { property: 'og:description', content: desc },
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
      { name: 'twitter:description', content: desc },
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
