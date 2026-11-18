/**
 * Side-by-side comparisons with other pixel art editors (/compare/<slug>).
 *
 * Rules for this file: every SimplePixelArt claim must be something the code
 * does today, and every competitor claim must be from that tool's own
 * documentation. Where the other tool is better, the table says so -- these
 * pages are for people choosing a tool, and a one-sided table helps no one.
 * Checked November 2026.
 */

export interface CompareRow {
  label: string
  spa: string
  other: string
}

export interface Competitor {
  slug: string
  name: string
  /** One line for the hub card. */
  blurb: string
  title: string
  description: string
  keywords: string
  intro: string
  rows: CompareRow[]
  /** Where the other tool is the better pick. */
  otherWins: string[]
  /** Where SimplePixelArt is the better pick. */
  spaWins: string[]
  faq: { q: string, a: string }[]
}

// The SimplePixelArt column, shared so the three tables never disagree.
const SPA = {
  price: 'Free, with ads; no paid tier on the web',
  install: 'None — runs in the browser; Android app too',
  platforms: 'Any modern browser (Windows, macOS, Linux, ChromeOS, tablets); Android app',
  canvas: 'Up to 128×128 pixels',
  layers: 'Yes',
  animation: 'Frames, onion skin, frame tags, per-frame timing',
  tiles: 'Tileset editor with Wang 16 and blob 47 autotile terrains',
  maps: 'Tilemap editor: square and isometric grids, ground and sprite layers',
  engine: 'Godot 4 (.tres tileset, .tscn scene), Tiled (.tsx/.tmj), sprite sheet + JSON',
  export: 'PNG, GIF, SVG, sprite sheet, sheet + Aseprite-format JSON',
  scripting: 'No scripting; free MCP server for AI assistants',
  community: 'Public gallery: every piece opens in the editor to study or remix',
  photo: 'Built-in image to pixel art converter',
}

export const COMPETITORS: Competitor[] = [
  {
    slug: 'aseprite',
    name: 'Aseprite',
    blurb: 'The standard paid desktop editor for pixel art and sprite animation.',
    title: 'Aseprite Alternative — Free, in the Browser',
    description: 'SimplePixelArt vs Aseprite compared honestly: price, install, animation, tilesets, Godot and Tiled export. A free browser alternative, and when Aseprite is still the better pick.',
    keywords: 'aseprite alternative, free aseprite alternative, aseprite online, free aseprite, aseprite vs, aseprite browser',
    intro: 'Aseprite is the tool most pixel artists end up with: a polished desktop editor with deep animation features and scripting. SimplePixelArt is a free editor that runs in the browser, with tilesets, tilemaps and Godot export built in. Here is how they compare, including where Aseprite is ahead.',
    rows: [
      {label: 'Price', spa: SPA.price, other: 'Paid one-time license (about $20); source available to compile yourself'},
      {label: 'Install', spa: SPA.install, other: 'Desktop app to install'},
      {label: 'Platforms', spa: SPA.platforms, other: 'Windows, macOS, Linux'},
      {label: 'Canvas size', spa: SPA.canvas, other: 'Large canvases, suited to big scenes'},
      {label: 'Layers', spa: SPA.layers, other: 'Yes, with groups and blend modes'},
      {label: 'Animation', spa: SPA.animation, other: 'Full timeline: frames, tags, onion skin, linked cels'},
      {label: 'Tiles', spa: SPA.tiles, other: 'Tilemap layers with tilesets'},
      {label: 'Maps for games', spa: SPA.maps, other: 'Tilemap layers inside a sprite'},
      {label: 'Game engine export', spa: SPA.engine, other: 'Sprite sheet + JSON; engines and plugins read .aseprite files'},
      {label: 'File format', spa: 'Saved in your account or browser; no .aseprite import', other: 'Own .aseprite / .ase format, widely supported'},
      {label: 'Scripting', spa: SPA.scripting, other: 'Lua scripting and a command-line interface for batch export'},
      {label: 'Community', spa: SPA.community, other: 'No built-in gallery'},
      {label: 'Photo to pixel art', spa: SPA.photo, other: 'Not built in'},
    ],
    otherWins: [
      'You animate a lot: Aseprite’s timeline, linked cels and tag tools are deeper.',
      'You want scripting or command-line batch export in your build pipeline.',
      'You work on large canvases or need .aseprite files for an engine plugin.',
      'You prefer a desktop app that works fully offline.',
    ],
    spaWins: [
      'You want to start now, free, on any computer — including a school or work machine where you cannot install software.',
      'You are building a tileset with autotile terrains and want a ready Godot 4 TileSet or Tiled file out of it.',
      'You want to lay out levels in a tilemap editor next to your sprites.',
      'You learn by remixing: every piece in the gallery opens in the editor.',
    ],
    faq: [
      {q: 'Is there a free Aseprite alternative online?', a: 'Yes. SimplePixelArt runs in the browser with no download and no sign-up: layers, animation with onion skin, sprite sheet and GIF export, plus tileset and tilemap editors. It does not have Aseprite’s scripting or its .aseprite file format.'},
      {q: 'Can SimplePixelArt open .aseprite files?', a: 'No. Export a PNG or a sprite sheet from Aseprite and import that instead — a horizontal or grid sprite sheet can be imported as animation frames.'},
      {q: 'Can I export for Aseprite?', a: '“Export for game” saves a sprite sheet with a JSON file in the Aseprite sprite-sheet format, which engines and libraries that read Aseprite’s JSON can load.'},
      {q: 'Is Aseprite free?', a: 'Aseprite is sold as a paid license. Its source code is available, so you can compile it yourself for personal use under its license terms.'},
      {q: 'Which is better for game tilesets?', a: 'Both handle tiles. SimplePixelArt adds a dedicated tileset editor that generates Wang 16 and blob 47 terrains and exports a Godot 4 TileSet with the terrains already set up, or a Tiled tileset.'},
      {q: 'Does SimplePixelArt work offline?', a: 'The editor runs in your browser and keeps work in local storage, but it is a website, not a desktop app. If you need guaranteed offline work, Aseprite is the safer pick.'},
    ],
  },
  {
    slug: 'piskel',
    name: 'Piskel',
    blurb: 'A free, open-source browser editor for sprites and animated GIFs.',
    title: 'Piskel Alternative — Free Pixel Art Editor',
    description: 'SimplePixelArt vs Piskel: two free browser pixel art editors compared on animation, layers, tilesets, tilemaps and export, with a clear take on when to use which.',
    keywords: 'piskel alternative, piskel vs, free piskel alternative, piskel online, sites like piskel',
    intro: 'Piskel is a free, open-source editor for sprites and animated GIFs, and one of the first good pixel art tools on the web. SimplePixelArt is also free and in the browser, and adds tilesets, tilemaps, game engine export and a community gallery. Here is an honest side-by-side.',
    rows: [
      {label: 'Price', spa: SPA.price, other: 'Free and open source'},
      {label: 'Install', spa: SPA.install, other: 'None in the browser; optional offline desktop app'},
      {label: 'Platforms', spa: SPA.platforms, other: 'Browser; desktop app for Windows, macOS, Linux'},
      {label: 'Layers', spa: SPA.layers, other: 'Yes'},
      {label: 'Animation', spa: SPA.animation, other: 'Frames, onion skin, live preview'},
      {label: 'Tiles', spa: SPA.tiles, other: 'Not built in'},
      {label: 'Maps for games', spa: SPA.maps, other: 'Not built in'},
      {label: 'Game engine export', spa: SPA.engine, other: 'Sprite sheet PNG'},
      {label: 'Export', spa: SPA.export, other: 'GIF, PNG sprite sheet, ZIP of frames'},
      {label: 'Source code', spa: 'Closed source; the MCP server is MIT', other: 'Open source (Apache 2.0)'},
      {label: 'Community', spa: SPA.community, other: 'Public gallery of sprites'},
      {label: 'Photo to pixel art', spa: SPA.photo, other: 'Not built in'},
    ],
    otherWins: [
      'You want an open-source tool you can self-host or modify.',
      'You only need quick animated GIFs and like a minimal interface.',
      'You want an offline desktop build of the same editor.',
    ],
    spaWins: [
      'You are making a game: tilesets with autotile terrains, a tilemap editor and Godot 4 / Tiled export.',
      'You want to start from a photo with the built-in converter.',
      'You want sheet + JSON export for engines, or SVG for print and web.',
    ],
    faq: [
      {q: 'What is a good free alternative to Piskel?', a: 'SimplePixelArt is free and runs in the browser like Piskel, with layers, animation, onion skin and GIF export, plus tileset and tilemap editors for game work.'},
      {q: 'Can I import a Piskel animation?', a: 'Export the animation from Piskel as a PNG sprite sheet, then use “Import strip” in the SimplePixelArt editor to load it back as frames.'},
      {q: 'Is Piskel still free?', a: 'Yes. Piskel is free and open source, and runs at piskelapp.com or as a desktop download.'},
      {q: 'Which one is better for animated GIFs?', a: 'Both export animated GIFs with per-frame timing. Piskel’s interface is simpler; SimplePixelArt adds frame tags and a sprite sheet + JSON export for games.'},
      {q: 'Do I need an account?', a: 'Neither tool needs one to start. A SimplePixelArt account adds cloud saving and publishing to the gallery.'},
    ],
  },
  {
    slug: 'pixelorama',
    name: 'Pixelorama',
    blurb: 'A free, open-source pixel art editor built with the Godot engine.',
    title: 'Pixelorama vs SimplePixelArt — Comparison',
    description: 'SimplePixelArt vs Pixelorama: two free pixel art editors compared on platforms, animation, tiles, Godot export and open source, and which suits your project.',
    keywords: 'pixelorama vs, pixelorama alternative, pixelorama online, free pixel art editor godot',
    intro: 'Pixelorama is a free, open-source pixel art editor made with the Godot engine, available for desktop and in the browser. SimplePixelArt is a free browser editor focused on game assets, with tilesets, tilemaps and Godot 4 export. Here is how they line up.',
    rows: [
      {label: 'Price', spa: SPA.price, other: 'Free and open source (MIT)'},
      {label: 'Install', spa: SPA.install, other: 'Desktop download, or a web version'},
      {label: 'Platforms', spa: SPA.platforms, other: 'Windows, macOS, Linux, web'},
      {label: 'Layers', spa: SPA.layers, other: 'Yes, with groups and blend modes'},
      {label: 'Animation', spa: SPA.animation, other: 'Timeline with frames, tags and onion skin'},
      {label: 'Tiles', spa: SPA.tiles, other: 'Tile mode for drawing seamless patterns'},
      {label: 'Maps for games', spa: SPA.maps, other: 'No separate tilemap editor'},
      {label: 'Game engine export', spa: SPA.engine, other: 'PNG, sprite sheets and GIF'},
      {label: 'Source code', spa: 'Closed source; the MCP server is MIT', other: 'Open source, extensible'},
      {label: 'Community', spa: SPA.community, other: 'No built-in gallery'},
      {label: 'Photo to pixel art', spa: SPA.photo, other: 'Not built in'},
    ],
    otherWins: [
      'You want an open-source desktop app that also works offline.',
      'You want blend modes, layer groups and a fuller drawing toolset.',
      'You like to extend or contribute to the tool itself.',
    ],
    spaWins: [
      'You want the tileset to arrive in Godot 4 with terrains and collision already set up.',
      'You want to paint levels in a tilemap editor and export a ready Godot scene or Tiled map.',
      'You want a gallery to browse, remix and publish to, and a photo converter built in.',
    ],
    faq: [
      {q: 'Which is better for Godot games?', a: 'Pixelorama is built with Godot but exports images. SimplePixelArt exports Godot 4 files directly: a TileSet (.tres) with terrains, collision and animated tiles, and a map as a ready .tscn scene.'},
      {q: 'Are both free?', a: 'Yes. Pixelorama is free and open source; SimplePixelArt is free to use in the browser, supported by ads.'},
      {q: 'Can I use either on a Chromebook?', a: 'Yes. Both have a browser version; SimplePixelArt runs in any modern browser with nothing to install.'},
      {q: 'Can I move work between them?', a: 'Use PNG or sprite sheets. SimplePixelArt imports a sprite strip as animation frames and exports sheets that Pixelorama can open as images.'},
    ],
  },
]

export const competitor = (slug: string) => COMPETITORS.find(c => c.slug === slug)
