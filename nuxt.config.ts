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
        }
    },
    app: {
        head: {
            titleTemplate: '%s - SimplePixelArt.com',
            title: "Simple Pixel Art - Discover pixel arts from creators worldwide!",
            htmlAttrs: {
                lang: 'en',
            },
            link: [
                {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
            ],
            meta: [
                {
                    name: 'viewport',
                    content: 'width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1, minimum-scale=1.0'
                },
                {
                    name: 'description',
                    content: "Discover trending pixel arts updated daily. Explore new creations, popular styles, and retro pixel designs."
                },
                {name: 'apple-touch-fullscreen', content: 'yes'},
                {name: 'apple-mobile-web-app-status-bar-style', content: 'default'},
            ],
            script: process.env.ENV == "dev" ? []: analytics
        }
    },
})