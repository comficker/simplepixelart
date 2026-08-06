import {toValue, type MaybeRefOrGetter} from 'vue'

// Fields accept plain strings OR refs/computeds/getters. Query-dependent values
// (robots/canonical on ?page= / ?id= …) MUST be passed reactively — client-side
// query navigation reuses the component without remounting, so a plain string
// captured at setup would go stale.
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
  // Getters keep every tag reactive; unhead drops tags that resolve nullish.
  const v = (g: V) => () => toValue(g)
  useHead({
    title: v(options.title),
    meta: [
      // Basic SEO
      { name: 'description', content: v(options.description) },
      { name: 'keywords', content: v(options.keywords) },
      { name: 'author', content: () => toValue(options.author) || 'SimplePixelArt.com' },
      { name: 'robots', content: () => toValue(options.robots) || 'index, follow' },

      // Open Graph
      { property: 'og:title', content: v(options.title) },
      { property: 'og:description', content: v(options.description) },
      { property: 'og:type', content: () => toValue(options.ogType) || 'website' },
      { property: 'og:url', content: v(options.canonical) },
      { property: 'og:site_name', content: 'SimplePixelArt.com' },
      { property: 'og:image', content: () => toValue(options.ogImage) || `${baseUrl}/og-image.jpg` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: v(options.title) },

      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:site', content: '@comficker' },
      { name: 'twitter:creator', content: '@comficker' },
      { name: 'twitter:title', content: v(options.title) },
      { name: 'twitter:description', content: v(options.description) },
      { name: 'twitter:image', content: () => toValue(options.ogImage) || `${baseUrl}/og-image.jpg` },

      // Article specific (if applicable)
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
