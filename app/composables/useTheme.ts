import useStatefulCookie from '~/composables/useStatefulCookie'

export const THEMES = [
  {
    id: 'gameboy',
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'arcade',
    name: 'Arcade',
    colors: ['#1a1033', '#4a2a7a', '#ffb800', '#ff3d7f'],
  },
  {
    id: 'nes',
    name: 'NES',
    colors: ['#000000', '#383838', '#e40058', '#0078f8'],
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    colors: ['#1a0033', '#8833ff', '#00f5ff', '#ff006e'],
  },
  {
    id: 'light',
    name: 'Light',
    colors: ['#ffffff', '#e5e7eb', '#111827', '#2563eb'],
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: ['#111111', '#1f1f1f', '#e5e5e5', '#3b82f6'],
  },
] as const

export type ThemeId = typeof THEMES[number]['id']

const DEFAULT_THEME: ThemeId = 'gameboy'

export function useTheme() {
  const cookie = useStatefulCookie('theme')

  if (!cookie.value) {
    cookie.value = DEFAULT_THEME
  }

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
  }

  return {
    current,
    setTheme,
    themes: THEMES,
  }
}
