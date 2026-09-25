export const TOOLS = [
  {key: 'draw', to: '/editor?new=true', icon: 'icon-pen', i18n: 'nav.draw', title: 'Draw', c1: '#7c8cff', c2: '#4f46e5'},
  {key: 'ai', to: '/generator', icon: 'icon-auto-fix', i18n: 'nav.generator', title: 'Generator', c1: '#a78bfa', c2: '#6d28d9'},
  {key: 'convert', to: '/converter', icon: 'icon-image', i18n: 'nav.converter', title: 'Converter', c1: '#34d399', c2: '#0d9488'},
  {key: 'slicer', to: '/tilesets/slicer', icon: 'icon-grid', i18n: 'nav.slicer', title: 'Slicer', c1: '#fbbf24', c2: '#d97706'},
  {key: 'tileset', to: '/tilesets/editor', icon: 'icon-grid', i18n: 'nav.tileset', title: 'Tileset', c1: '#c084fc', c2: '#7c3aed'},
  {key: 'tilemap', to: '/tilemaps/editor', icon: 'icon-rhombus', i18n: 'nav.tilemap', title: 'Tilemap', c1: '#fb7185', c2: '#e11d48'},
  {key: 'extract', to: '/palettes/color-palette-from-image', icon: 'icon-auto-fix', i18n: 'nav.extract', title: 'Extract', c1: '#f472b6', c2: '#db2777'},
] as const

export type ToolKey = typeof TOOLS[number]['key']
