export interface UseSeoMetaOptions {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: string;
  articleSection?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  robots?: string;
  script?: any[]
}

export const useCustomSeoMeta = (options: UseSeoMetaOptions) => {
  const config = useRuntimeConfig();
  const baseUrl = config.public.siteUrl || 'https://simplepixelart.com';
  
  // Set page title
  if (options.title) {
    useHead({
      title: options.title,
      meta: [
        // Basic SEO
        { name: 'description', content: options.description },
        { name: 'keywords', content: options.keywords },
        { name: 'author', content: options.author || 'SimplePixelArt.com' },
        { name: 'robots', content: options.robots || 'index, follow' },
        
        // Open Graph
        { property: 'og:title', content: options.title },
        { property: 'og:description', content: options.description },
        { property: 'og:type', content: options.ogType || 'website' },
        { property: 'og:url', content: options.canonical },
        { property: 'og:site_name', content: 'SimplePixelArt.com' },
        { property: 'og:image', content: options.ogImage || `${baseUrl}/og-image.svg` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:alt', content: options.title },
        
        // Twitter Card
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:site', content: '@SimplePixelArt' },
        { name: 'twitter:creator', content: '@SimplePixelArt' },
        { name: 'twitter:title', content: options.title },
        { name: 'twitter:description', content: options.description },
        { name: 'twitter:image', content: options.ogImage || `${baseUrl}/og-image.svg` },
        
        // Article specific (if applicable)
        ...(options.articleSection ? [{ property: 'article:section', content: options.articleSection }] : []),
        ...(options.publishedTime ? [{ property: 'article:published_time', content: options.publishedTime }] : []),
        ...(options.modifiedTime ? [{ property: 'article:modified_time', content: options.modifiedTime }] : [])
      ],
      script: options.script ?? [],
      link: [
          ...options.canonical ? [{ rel: 'canonical', href: options.canonical }] : [],
      ]
    });
  }
};