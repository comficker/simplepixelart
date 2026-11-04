<script setup lang="ts">
const features = [
  'Frame timeline with add, duplicate, reorder and per-frame duration',
  'Onion skin: faded previous and next frames while you draw',
  'Static background layer shared by every frame',
  'All-frames mode to paint or move across every frame at once',
  'Frame tags (idle, walk, jump) kept in the game export',
  'Export an animated GIF, a sprite sheet, or a sheet + JSON for game engines',
  'Import a sprite strip or several images as frames',
]
const steps = [
  {name: 'Draw the first frame', text: 'Sketch the pose on the canvas above; small grids such as 16×16 or 32×32 are the quickest to animate.'},
  {name: 'Add frames', text: 'Duplicate the frame in the timeline under the canvas and change only what moves. Onion skin shows the neighbouring frames faintly.'},
  {name: 'Set the timing', text: 'Pick a playback speed, or give a single frame its own duration to hold a pose longer.'},
  {name: 'Export', text: 'Download an animated GIF to share, or a sprite sheet with JSON for Unity, Godot or Phaser.'},
]
const faq = [
  {q: 'How do I make a pixel art animation?', a: 'Draw one frame, duplicate it, and change only the moving parts. A walk cycle usually needs 4 to 8 frames; an idle loop 2 to 4.'},
  {q: 'Can I export my animation as a GIF?', a: 'Yes. Download it as an animated GIF, or as a sprite sheet if it is going into a game.'},
  {q: 'How many frames can an animation have?', a: 'Up to 64 frames, each with its own duration if you need one.'},
  {q: 'Is it free?', a: 'Yes. It runs in your browser with no sign-up and no watermark.'},
]
</script>

<template>
  <EditorLanding
      path="/pixel-art-animation-maker"
      title="Pixel Art Animation Maker – Free Online GIF & Sprite Animator"
      description="Free pixel art animation maker: draw frame by frame with onion skin in your browser, then export an animated GIF or a sprite sheet for your game."
      keywords="pixel art animation maker, pixel art animator, pixel animation maker, pixel art gif maker, sprite animation maker, animate pixel art online"
      app-name="Pixel Art Animation Maker"
      :features="features"
      :steps="steps"
      :faq="faq"
  >
    <h1>Pixel Art Animation Maker</h1>
    <p>Animate pixel art frame by frame right here: the canvas above is a full editor with a timeline underneath. Draw a pose, duplicate the frame, change what moves, and export an animated GIF or a sprite sheet.</p>
  </EditorLanding>
</template>
