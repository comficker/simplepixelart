/**
 * The links a creator can put on their profile, in the order both the
 * settings form and the public page show them.
 *
 * The keys mirror `_PROFILE_LINK_KEYS` in the backend's update_profile: it
 * ignores anything not on its own list, so a key added here without one added
 * there is silently dropped on save.
 */
export interface ProfileLink {
  key: string
  label: string
  placeholder: string
}

export const PROFILE_LINKS: ProfileLink[] = [
  {key: 'website', label: 'Website', placeholder: 'yoursite.com'},
  {key: 'artstation', label: 'ArtStation', placeholder: 'artstation.com/you'},
  {key: 'deviantart', label: 'DeviantArt', placeholder: 'deviantart.com/you'},
  {key: 'itch', label: 'itch.io', placeholder: 'you.itch.io'},
  {key: 'pixilart', label: 'Pixilart', placeholder: 'pixilart.com/you'},
  {key: 'lospec', label: 'Lospec', placeholder: 'lospec.com/you'},
  {key: 'behance', label: 'Behance', placeholder: 'behance.net/you'},
  {key: 'dribbble', label: 'Dribbble', placeholder: 'dribbble.com/you'},
  {key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/you'},
  {key: 'x', label: 'X', placeholder: 'x.com/you'},
  {key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@you'},
  {key: 'patreon', label: 'Patreon', placeholder: 'patreon.com/you'},
  {key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/you'},
]

/** The host, for showing a link without its scheme or trailing slash. */
export function linkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}
