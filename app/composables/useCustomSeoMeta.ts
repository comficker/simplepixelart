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
  script?: any[]
}

export const useCustomSeoMeta = (options: UseSeoMetaOptions) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.siteUrl || 'https://simplepixelart.com';

  if (!options.title) return
  const v = (g: V) => () => toValue(g)
  useHead({
    title: v(options.title),
    meta: [
      { name: 'description', content: v(options.description) },
      { name: 'keywords', content: v(options.keywords) },
      { name: 'author', content: () => toValue(options.author) || 'SimplePixelArt.com' },
      { name: 'robots', content: () => toValue(options.robots) || 'index, follow' },

      { property: 'og:title', content: v(options.title) },
      { property: 'og:description', content: v(options.description) },
      { property: 'og:type', content: () => toValue(options.ogType) || 'website' },
      { property: 'og:url', content: v(options.canonical) },
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
        ...options.canonical ? [{ rel: 'canonical', href: v(options.canonical) }] : [],
    ]
  });
};
