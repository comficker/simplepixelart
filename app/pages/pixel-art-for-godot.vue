<script setup lang="ts">
// English only for now: locale copies canonical to this URL. Every step
// here is a real export: tileset-pack.ts / engine-export.ts write the
// TileSet, world-export.ts the scene and its README.
const URL = 'https://simplepixelart.com/pixel-art-for-godot'

const steps = [
  {name: 'Draw or import your tiles', text: 'Draw tiles in the pixel art editor, or cut an existing sheet into tiles with the tileset slicer.'},
  {name: 'Build the tileset', text: 'In the tileset editor, group tiles and generate autotile terrains: Wang 16 corner sets or blob 47 sets.'},
  {name: 'Export the TileSet', text: 'Choose “Export for Godot 4” to get a .tres TileSet with the atlas, terrain sets, collision and animated tiles filled in, plus the PNG.'},
  {name: 'Paint a level', text: 'Open the tileset in the tilemap editor, paint ground layers with terrains, and place props and characters on sprite layers.'},
  {name: 'Export the scene', text: 'Export the map for Godot 4: a zip with a ready .tscn scene, its .tres tileset, the images and a README.'},
  {name: 'Open it in Godot', text: 'Copy the files into your Godot 4.3+ project and open the .tscn. Set the default texture filter to Nearest for crisp pixels.'},
]

const faq = [
  {q: 'Can I export a tileset to Godot 4?', a: 'Yes. The tileset editor’s “Export for Godot 4” writes a TileSet (.tres) with the packed atlas PNG, terrain sets, collision on solid tiles and animated tiles already set up, so you can paint with terrains straight away.'},
  {q: 'Does it export a whole level?', a: 'Yes. The tilemap editor exports a Godot 4 zip with a .tscn scene: ground layers become TileMapLayers on the exported TileSet, sprite layers become Sprite2D or AnimatedSprite2D nodes, and object layers become Marker2D nodes.'},
  {q: 'Which Godot version do I need?', a: 'Godot 4.3 or newer, which has TileMapLayer nodes. The export does not target Godot 3.'},
  {q: 'How do I stop pixel art from looking blurry in Godot?', a: 'Open Project Settings › Rendering › Textures and set Default Texture Filter to Nearest. Keep the window or camera scale at whole numbers.'},
  {q: 'What autotile types are supported?', a: 'Wang 16 (corner) and blob 47 terrains, generated in the tileset editor and written to Godot as terrain sets in the matching mode.'},
  {q: 'Can I export animated characters too?', a: 'Yes. The pixel art editor exports a sprite sheet, an animated GIF, or a sheet with a JSON file of frames, timings and tags in the Aseprite format.'},
  {q: 'Does it also work with Tiled or other engines?', a: 'Yes. Tilesets export as Tiled .tsx with terrains as Wang sets, maps as Tiled .tmj, and a PNG + JSON option covers Unity, Phaser and custom engines.'},
]

useCustomSeoMeta({
  untranslated: true,
  title: 'Pixel Art for Godot 4: Tilesets & Autotile',
  description: 'Make pixel art for Godot 4 in the browser: draw tiles, build Wang 16 or blob 47 autotile terrains, and export a ready TileSet (.tres) and scene (.tscn). Free.',
  keywords: 'pixel art godot, godot tileset, godot 4 tileset pixel art, godot autotile, godot terrain tileset, export tileset to godot, godot tilemap pixel art',
  canonical: URL,
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'HowTo',
          name: 'How to make pixel art tiles and levels for Godot 4',
          step: steps.map(s => ({'@type': 'HowToStep', name: s.name, text: s.text})),
        },
        {
          '@type': 'FAQPage',
          mainEntity: faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
        },
      ],
    }),
  }],
})
</script>

<template>
  <article class="page prose">
    <p class="page-meta">Game dev guide</p>
    <h1>Pixel Art for Godot 4: Tilesets, Autotile and Ready Scenes</h1>
    <p>Draw your tiles, turn them into autotile terrains and paint a level — then export it for Godot 4 as a TileSet and a scene that open ready to use. Everything runs in the browser and is free: no plugin, no import script, no hand-wiring terrain bits in the TileSet panel.</p>
    <p>
      <NuxtLinkLocale to="/tilesets/editor" class="btn primary">Open the tileset editor</NuxtLinkLocale>
    </p>
    <figure>
      <img src="/images/godot/stone-age-river-valley.png" alt="A pixel art forest map with a river, clearings, cavemen and wolves, built from a tileset" width="512" height="384" class="pixelated">
      <figcaption><NuxtLink to="/worlds/stone-age-river-valley">Stone Age River Valley</NuxtLink>, a 64×48 world made from one tileset. Its page exports it for Godot 4 and Tiled.</figcaption>
    </figure>

    <h2>The workflow</h2>
    <ol>
      <li v-for="s in steps" :key="s.name"><strong>{{ s.name }}</strong> — {{ s.text }}</li>
    </ol>

    <h2>What lands in Godot</h2>
    <h3>A TileSet with terrains already set up</h3>
    <p>The tileset export packs every tile into one atlas and writes the <code>.tres</code> TileSet around it. Wang 16 terrains become terrain sets in Match Corners mode, blob 47 in Match Corners and Sides, so the TileMap panel’s terrain brush works the moment you open it. Solid tiles collide on physics layer 1, and animated tiles keep their frames.</p>
    <h3>A scene, not just an image</h3>
    <p>The map export is a zip with a <code>.tscn</code> scene on that same TileSet. Ground layers are TileMapLayers you can keep painting; sprites become Sprite2D or AnimatedSprite2D nodes, y-sorted as on the map; object layers become named Marker2D points for spawns and doors.</p>
    <h3>Characters and props</h3>
    <p>Animate characters in the <NuxtLinkLocale to="/editor">pixel art editor</NuxtLinkLocale> with frames, onion skin and frame tags, then export a sprite sheet for an AnimatedSprite2D, or a sheet with JSON in the Aseprite format.</p>

    <h2>Import settings for crisp pixels</h2>
    <ul>
      <li>Project Settings › Rendering › Textures › <strong>Default Texture Filter: Nearest</strong>.</li>
      <li>Keep the camera zoom and window stretch at whole numbers (2×, 3×, 4×).</li>
      <li>Use Godot 4.3 or newer for TileMapLayer nodes.</li>
    </ul>

    <h2>Tools for each step</h2>
    <ul>
      <li><NuxtLinkLocale to="/editor">Pixel art editor</NuxtLinkLocale> — tiles, sprites and animation</li>
      <li><NuxtLinkLocale to="/tilesets/slicer">Tileset slicer</NuxtLinkLocale> — cut an existing sheet into tiles</li>
      <li><NuxtLink to="/gif-to-sprite-sheet">GIF to sprite sheet</NuxtLink> — turn an animated GIF into a sheet for an AnimatedSprite2D</li>
      <li><NuxtLinkLocale to="/tilesets/editor">Tileset editor</NuxtLinkLocale> — terrains and the Godot 4 TileSet export</li>
      <li><NuxtLinkLocale to="/tilemaps/editor">Tilemap editor</NuxtLinkLocale> — levels and the Godot 4 scene export</li>
      <li><NuxtLinkLocale to="/tilesets">Community tilesets</NuxtLinkLocale> — start from someone else’s tiles</li>
      <li><NuxtLink to="/compare">Compare pixel art editors</NuxtLink> — how this stacks up against Aseprite, Piskel and Pixelorama</li>
    </ul>

    <QnA :items="faq"/>
  </article>
</template>

<style scoped>
.pixelated {
  image-rendering: pixelated;
  width: 100%;
  height: auto;
}
</style>
