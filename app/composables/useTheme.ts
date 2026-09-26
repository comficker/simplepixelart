import useStatefulCookie from '~/composables/useStatefulCookie'

export const THEMES = [
  {
    id: 'cozy',
    i18n: 'theme.cozy', name: 'Cozy',
    colors: ['#f5e6d3', '#d4c4a8', '#d4854a', '#a8b89a'],
  },
  {
    id: 'gameboy',
    i18n: 'theme.gameBoy', name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'arcade',
    i18n: 'theme.arcade', name: 'Arcade',
    colors: ['#1a1033', '#4a2a7a', '#ffb800', '#ff3d7f'],
  },
  {
    id: 'nes',
    i18n: 'theme.nes', name: 'NES',
    colors: ['#000000', '#383838', '#e40058', '#0078f8'],
  },
  {
    id: 'synthwave',
    i18n: 'theme.synthwave', name: 'Synthwave',
    colors: ['#1a0033', '#8833ff', '#00f5ff', '#ff006e'],
  },
  {
    id: 'light',
    i18n: 'theme.light', name: 'Light',
    colors: ['#fdfcfa', '#eae7e0', '#1c1a17', '#2550cf'],
  },
  {
    id: 'dark',
    i18n: 'theme.dark', name: 'Dark',
    colors: ['#111111', '#1f1f1f', '#e5e5e5', '#3b82f6'],
  },
] as const

export type ThemeId = typeof THEMES[number]['id']

const DEFAULT_THEME: ThemeId = 'dark'

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
