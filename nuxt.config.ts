import tailwindcss from "@tailwindcss/vite";

const adsEnabled = process.env.NUXT_PUBLIC_ADS_ENABLED !== 'false';

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
            htmlAttrs: {
                lang: 'en',
            },
            link: [
                {rel: 'icon', type: 'image/x-icon', href: '/favicon.ico'},
                {rel: 'apple-touch-icon', href: '/favicon.png'},
                {rel: 'canonical', href: 'https://simplepixelart.com'},
                {rel: 'preconnect', href: 'https://touch.ninosaur.com'},
                {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
                {rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''},
                {rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap'},
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
                    content: 'ca-pub-7014744652532083'
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
            script: adsEnabled ? [
                // Consent Mode v2 default — denied until user accepts.
                {
                    innerHTML: `
                      window.dataLayer = window.dataLayer || [];
                      function gtag(){dataLayer.push(arguments);}
                      gtag('consent', 'default', {
                        'ad_storage': 'denied',
                        'ad_user_data': 'denied',
                        'ad_personalization': 'denied',
                        'analytics_storage': 'granted',
                        'functionality_storage': 'granted',
                        'security_storage': 'granted',
                        'wait_for_update': 500
                      });
                    `,
                    type: 'text/javascript',
                    tagPosition: 'head',
                },
                // Lazy-load AdSense after page idle to unblock LCP.
                {
                    innerHTML: `
                      (function(){
                        var load = function(){
                          if (window.__adsLoaded) return;
                          window.__adsLoaded = true;
                          var s = document.createElement('script');
                          s.async = true;
                          s.crossOrigin = 'anonymous';
                          s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7014744652532083';
                          document.head.appendChild(s);
                        };
                        if ('requestIdleCallback' in window) {
                          requestIdleCallback(load, { timeout: 3000 });
                        } else {
                          setTimeout(load, 3000);
                        }
                      })();
                    `,
                    type: 'text/javascript',
                    tagPosition: 'bodyClose',
                },
            ] : [],
        }
    },
})