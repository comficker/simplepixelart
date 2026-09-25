/**
 * The locale bundles live at /_i18n/<build hash>/<code>/messages.json, so the URL
 * busts itself on every deploy -- but @nuxtjs/i18n serves them with `max-age=10`.
 * That made every visitor re-fetch 84 KB (en) to 215 KB (ru) of messages on
 * essentially every page view. The module sets that header inside its own
 * handler, so a routeRule cannot win; override it on the way out instead.
 */
export default defineNitroPlugin((nitro) => {
    nitro.hooks.hook('beforeResponse', (event) => {
        if (event.path?.startsWith('/_i18n/')) {
            setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
        }
    })
})
