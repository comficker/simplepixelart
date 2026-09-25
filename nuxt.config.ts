const adsEnabled = process.env.NUXT_PUBLIC_ADS_ENABLED !== 'false';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devtools: {enabled: true},
    modules: ['@pinia/nuxt', '@nuxtjs/i18n'],
    i18n: {
        // Subdirectories, not a cookie: a language only earns traffic if Google
        // has a URL of its own to index for it. English keeps the bare paths so
        // nothing it already ranks for moves.
        strategy: 'prefix_except_default',
        defaultLocale: 'en',
        // Message fallback is a vue-i18n option, not a module one -- the
        // module's own fallbackLocale belongs to browser detection.
        vueI18n: './i18n.config.ts',
        // The six markets where pixel art, retro games and indie dev are
        // strongest. `language` is what goes in hreflang.
        locales: [
            {code: 'en', language: 'en', name: 'English', file: 'en.json'},
            {code: 'ja', language: 'ja', name: '日本語', file: 'ja.json'},
            {code: 'zh', language: 'zh-Hans', name: '简体中文', file: 'zh.json'},
            {code: 'ko', language: 'ko', name: '한국어', file: 'ko.json'},
            {code: 'es', language: 'es', name: 'Español', file: 'es.json'},
            {code: 'pt', language: 'pt-BR', name: 'Português', file: 'pt.json'},
            {code: 'ru', language: 'ru', name: 'Русский', file: 'ru.json'},
        ],
        lazy: true,
        bundle: {optimizeTranslationDirective: false},
        // README/FAQ copy is prose with inline markup, rendered through v-html.
        // The compiler rejects HTML in messages by default, which 404s the locale chunk.
        compilation: {strictMessage: false, escapeHtml: false},
        // No automatic redirect: a visitor who lands on an English URL from
        // search should stay on it, or the ranking page bounces them away.
        detectBrowserLanguage: false,
        baseUrl: 'https://simplepixelart.com',
    },
    nitro: {
        // Pre-compress hashed assets at build; the node server (and gzip_static/
        // brotli_static in nginx) can serve .br/.gz without on-the-fly work.
        compressPublicAssets: {gzip: true, brotli: true},
        routeRules: {
            // Old color-tool slugs → keyword-rich slugs (permanent 301).
            '/palettes/extract': {redirect: {to: '/palettes/color-palette-from-image', statusCode: 301}},
            '/palettes/scheme': {redirect: {to: '/palettes/color-palette-from-color', statusCode: 301}},
            // Tools renamed after the thing they are, not the verb (301 so the
            // old URLs keep whatever they have earned).
            '/generate': {redirect: {to: '/generator', statusCode: 301}},
            '/convert': {redirect: {to: '/converter', statusCode: 301}},
        },
    },
    css: [
        './app/assets/css/main.css',
    ],
    typescript: {
        tsConfig: {
            compilerOptions: {
                noUnusedLocals: false,
                noUnusedParameters: false
            }
        }
    },
    vite: {
        build: {
            sourcemap: false
        }
    },
    $development: {
        nitro: {
            routeRules: {
                '/**': {
                    headers: {
                        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
                        'pragma': 'no-cache',
                        'expires': '0',
                    },
                },
            },
        },
        vite: {
            server: {
                headers: {
                    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
                },
            },
        },
    },
    runtimeConfig: {
        api: 'https://touch.ninosaur.com',
        public: {
            api: process.env.NUXT_PUBLIC_API || 'https://touch.ninosaur.com',
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://simplepixelart.com',
            adsEnabled,
            firebase: {
                apiKey: "AIzaSyCF1i7uBqd1OEeJEYfLAVgrs9XlKhLk8tQ",
                authDomain: "simplepixelart-78b18.firebaseapp.com",
                projectId: "simplepixelart-78b18",
                storageBucket: "simplepixelart-78b18.firebasestorage.app",
                messagingSenderId: "17213734973",
                appId: "1:17213734973:web:f589f41ae083d475776a54",
                measurementId: "G-2W3W9J4ER3",
            },
        }
    },
    app: {
        head: {
            titleTemplate: '%s - SimplePixelArt.com',
            title: "Simple Pixel Art - Create & Discover Pixel Art Online",
            link: [
                {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
                {rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png'},
                {rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png'},
                {rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96x96.png'},
                {rel: 'icon', type: 'image/png', sizes: '192x192', href: '/android-chrome-192x192.png'},
                {rel: 'icon', type: 'image/png', sizes: '512x512', href: '/android-chrome-512x512.png'},
                {rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png'},
                {rel: 'manifest', href: '/site.webmanifest'},
                {rel: 'preconnect', href: 'https://touch.ninosaur.com'},
            ],
            meta: [
                {
                    name: 'viewport',
                    content: 'width=device-width, initial-scale=1.0'
                },
                {
                    name: 'description',
                    content: "Create and discover amazing pixel art online. Free pixel art editor with advanced tools, daily updates, and a vibrant community of creators. Start your pixel art journey today!"
                },
                {
                    name: 'keywords',
                    content: 'pixel art, pixel editor, pixel art maker, create pixel art, pixel art online, retro art, 8-bit art, pixel drawing, pixel art tools, free pixel art'
                },
                {
                    name: 'author',
                    content: 'SimplePixelArt.com'
                },
                ...(adsEnabled ? [{
                    name: 'google-adsense-account',
                    content: 'ca-pub-7842478840527195'
                }] : []),
                {
                    name: 'robots',
                    content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
                },
                {name: 'apple-touch-fullscreen', content: 'yes'},
                {name: 'apple-mobile-web-app-status-bar-style', content: 'default'},
                {name: 'theme-color', content: '#6366f1'},
                {name: 'msapplication-TileColor', content: '#6366f1'},
                
                // Open Graph tags
                {property: 'og:type', content: 'website'},
                {property: 'og:site_name', content: 'SimplePixelArt.com'},
                {property: 'og:title', content: 'Simple Pixel Art - Create & Discover Pixel Art Online'},
                {property: 'og:description', content: 'Create and discover amazing pixel art online. Free pixel art editor with advanced tools and vibrant community.'},
                {property: 'og:url', content: 'https://simplepixelart.com'},
                {property: 'og:image', content: 'https://simplepixelart.com/og-image.png'},
                {property: 'og:image:width', content: '1200'},
                {property: 'og:image:height', content: '630'},
                {property: 'og:image:alt', content: 'Simple Pixel Art - Create and Discover Pixel Art'},
                
                // Twitter Card tags
                {name: 'twitter:card', content: 'summary_large_image'},
                {name: 'twitter:site', content: '@comficker'},
                {name: 'twitter:creator', content: '@comficker'},
                {name: 'twitter:title', content: 'Simple Pixel Art - Create & Discover Pixel Art Online'},
                {name: 'twitter:description', content: 'Create and discover amazing pixel art online. Free pixel art editor with advanced tools.'},
                {name: 'twitter:image', content: 'https://simplepixelart.com/og-image.png'},
                {name: 'twitter:image:alt', content: 'Simple Pixel Art - Create and Discover Pixel Art'},
            ],
            script: [
                // Restore the editor's fullscreen layout BEFORE first paint (no
                // flash on hard-reload). Scoped to /editor so other pages are
                // untouched; the component owns the class from mount onward.
                {
                    innerHTML: `try{if(location.pathname==='/editor'){var v=localStorage.getItem('editor_fullscreen');if(v&&v!=='off')document.documentElement.classList.add('editor-fullscreen')}}catch(e){}`,
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                ...(adsEnabled ? [
                // Consent Mode v2 default — denied until user accepts.
                {
                    innerHTML: `
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('consent', 'default', {
                        'ad_storage': 'denied',
                        'ad_user_data': 'denied',
                        'ad_personalization': 'denied',
                        'analytics_storage': 'denied',
                        'functionality_storage': 'granted',
                        'security_storage': 'granted',
                        'wait_for_update': 500
                      });
                    `,
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                // NOTE: adsbygoogle.js is no longer loaded here. It is lazy-injected
                // by the AdSlot component on mount, so the AdSense script (and any
                // Auto Ads it would place) only runs on content-rich pages where an
                // AdSlot actually renders — currently `/` and `/art/[id_string]`
                // with the hasOriginalContent guard. This satisfies AdSense's
                // "no ads on screens without publisher content" policy.
                ] : []),
            ],
        }
    },
})