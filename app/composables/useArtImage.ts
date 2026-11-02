type ArtRef = { id_string?: string | null; updated?: string | null } | string | null | undefined

export const useArtImage = () => {
    const config = useRuntimeConfig()

    return (art: ArtRef, size = 'art-original') => {
        const slug = typeof art === 'string' ? art : art?.id_string
        if (!slug) return ''

        // A version token makes the URL change whenever the art does, which is
        // what lets the API answer with an immutable, year-long cache instead
        // of revalidating every thumbnail on every visit. Without `updated`
        // (callers that only hold a slug) the URL stays bare and the API falls
        // back to a short TTL.
        const updated = typeof art === 'object' ? art?.updated : null
        const v = updated ? Date.parse(updated) : NaN
        const query = Number.isFinite(v) ? `?v=${v}` : ''

        return `${config.public.api}/coloring/files/${size}/${slug}.png${query}`
    }
}

/** Alt text for an art image: its name read as words, plus "pixel art", so
 *  Google Images gets "Moonstone Axe pixel art" instead of the slug
 *  "moonstone_axe". Unnamed art keeps the caller's fallback. */
export const useArtAlt = () => {
    const {t} = useI18n()

    return (name: string | null | undefined, fallback = '') => {
        const words = (name || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
        if (!words) return fallback
        // A lowercase slug-ish name reads better title-cased; a name the
        // author capitalised is left the way they wrote it.
        const label = /[A-Z]/.test(words) ? words : words.replace(/\b\p{L}/gu, c => c.toUpperCase())
        return /pixel art/i.test(label) ? label : t('common.artAlt', {name: label})
    }
}
