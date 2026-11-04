<script setup lang="ts">
const features = [
  'Canvas from 8×8 up to 128×128 pixels, transparent background',
  'Brush, eraser, fill, line, selection, move and stamp tools',
  'Horizontal and vertical mirror drawing for symmetric characters',
  'Layers and custom palettes, or a ready-made palette from the library',
  'Frames, onion skin and frame tags (idle, walk, attack) for animated sprites',
  'Export a PNG, a sprite sheet, or a sheet + JSON for Phaser, Unity and Godot',
]
const steps = [
  {name: 'Pick a size', text: '16×16 and 32×32 are the usual sprite sizes; change it from the canvas settings at any time.'},
  {name: 'Draw the sprite', text: 'Block in the silhouette, then add shading with a small palette. Mirror mode draws both halves of a character at once.'},
  {name: 'Animate it if you like', text: 'Add frames in the timeline below the canvas and turn on onion skin to see the frame before and after.'},
  {name: 'Export', text: 'Download a PNG, a sprite sheet, or "Export for game" for a sheet with an Aseprite-format JSON file.'},
]
const faq = [
  {q: 'Is the sprite maker free?', a: 'Yes. It runs in your browser with no sign-up and no watermark; an account only adds cloud saving.'},
  {q: 'What size should a game sprite be?', a: 'Most pixel art games use 16×16 or 32×32 sprites. Smaller sprites are faster to draw and read well at a distance; 64×64 suits bosses and portraits.'},
  {q: 'Can I use the sprites in Unity, Godot or Phaser?', a: 'Yes. "Export for game" saves the sprite sheet plus a JSON file with frame durations and tags in the Aseprite format those engines import.'},
  {q: 'Can I make a whole tileset?', a: 'Yes. The tileset editor builds terrain tiles with the same tools, and the tilemap editor lays them out as a level.'},
]
</script>

<template>
  <EditorLanding
      path="/sprite-maker"
      title="Sprite Maker – Free Pixel Art Sprite Editor Online"
      description="Free online sprite maker: draw pixel art sprites for your game in the browser, animate them frame by frame and export a sprite sheet for Unity, Godot or Phaser."
      keywords="sprite maker, sprite editor, pixel sprite maker, game sprite maker, sprite sheet maker, 2d sprite maker"
      app-name="Sprite Maker"
      :features="features"
      :steps="steps"
      :faq="faq"
  >
    <h1>Sprite Maker</h1>
    <p>Draw pixel art sprites for your game right here: the canvas above is a full editor. Start from an empty 16×16 or 32×32 grid, animate the sprite frame by frame, and export a sprite sheet your engine can read.</p>
  </EditorLanding>
</template>
