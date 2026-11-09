import useStatefulCookie from '~/composables/useStatefulCookie'

export const THEMES = [
  {
    // The id stays "light" so existing cookies keep working.
    id: 'light',
    i18n: 'theme.default', name: 'Default',
    colors: ['#fdfcfa', '#eae7e0', '#1c1a17', '#2550cf'],
  },
  {
    id: 'dark',
    i18n: 'theme.dark', name: 'Dark',
    colors: ['#0d0e11', '#232428', '#e6e8eb', '#3b82f6'],
  },
  {
    id: 'lofi',
    i18n: 'theme.lofi', name: 'Lofi',
    colors: ['#1f1c27', '#36313f', '#ebe3d6', '#f0a97e'],
  },
  {
    id: 'gameboy',
    i18n: 'theme.gameBoy', name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'kawaii',
    i18n: 'theme.kawaii', name: 'Kawaii',
    colors: ['#fff8fa', '#fbe1ea', '#4f3440', '#e8578c'],
  },
  {
    id: 'nature',
    i18n: 'theme.nature', name: 'Nature',
    colors: ['#ffffff', '#e6ede2', '#232b1e', '#1f9447'],
  },
] as const

export type ThemeId = typeof THEMES[number]['id']

const DEFAULT_THEME: ThemeId = 'light'

export function useTheme() {
  // No default written back: a Set-Cookie on every first visit would keep
  // those responses out of the HTML cache, and `current` falls back anyway.
  const cookie = useStatefulCookie('theme')

  const current = computed<ThemeId>(() => {
    const v = cookie.value as ThemeId
    return THEMES.some(t => t.id === v) ? v : DEFAULT_THEME
  })

  useHead({
    htmlAttrs: {
      'data-theme': current,
    },
  })

  function setTheme(id: ThemeId) {
    cookie.value = id
    // useHead writes the attribute on its next flush, a frame or more later;
    // the rebuild veil opens now and would paint the old theme's background
    // first. Set it straight away so the veil is the new theme from its
    // first frame.
    if (import.meta.client) document.documentElement.setAttribute('data-theme', id)
  }

  return {
    current,
    setTheme,
    themes: THEMES,
  }
}
