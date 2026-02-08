import tailwindcss from "@tailwindcss/vite";

const analytics = [
    {
        src: "https://www.googletagmanager.com/gtag/js?id=G-MKLR8GDG", async: true
    },
    {
        innerHTML: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-MKLR8GDG');`
    }
]
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
    compatibilityDate: '2025-07-15',
    devtools: {enabled: true},
    modules: ['@pinia/nuxt'],
    css: [
        './app/assets/css/main.css',
        './app/assets/fonts/ProtoMono/stylesheet.css',
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
        plugins: [
            tailwindcss(),
        ],
        build: {
            sourcemap: false
        }
    },
    runtimeConfig: {
        api: 'https://touch.ninosaur.com',
        public: {
            api: process.env.NUXT_PUBLIC_API || 'https://touch.ninosaur.com',
            siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://simplepixelart.com',
        }
    },
    app: {
        head: {
            titleTemplate: '%s - SimplePixelArt.com',
            title: "Simple Pixel Art - Create & Discover Pixel Art Online",
            htmlAttrs: {
                lang: 'en',
            },
            link: [
                {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
                {rel: 'apple-touch-icon', href: '/favicon.png'},
                {rel: 'canonical', href: 'https://simplepixelart.com'},
                {rel: 'preconnect', href: 'https://touch.ninosaur.com'},
            ],
            meta: [
                {
                    name: 'viewport',
                    content: 'width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1, minimum-scale=1.0'
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
                {property: 'og:image', content: 'https://simplepixelart.com/og-image.jpg'},
                {property: 'og:image:width', content: '1200'},
                {property: 'og:image:height', content: '630'},
                {property: 'og:image:alt', content: 'Simple Pixel Art - Create and Discover Pixel Art'},
                
                // Twitter Card tags
                {name: 'twitter:card', content: 'summary_large_image'},
                {name: 'twitter:site', content: '@comficker'},
                {name: 'twitter:creator', content: '@comficker'},
                {name: 'twitter:title', content: 'Simple Pixel Art - Create & Discover Pixel Art Online'},
                {name: 'twitter:description', content: 'Create and discover amazing pixel art online. Free pixel art editor with advanced tools.'},
                {name: 'twitter:image', content: 'https://simplepixelart.com/og-image.jpg'},
                {name: 'twitter:image:alt', content: 'Simple Pixel Art - Create and Discover Pixel Art'},
            ],
            script: process.env.ENV == "dev" ? []: analytics
        }
    },
})