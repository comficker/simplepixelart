<script setup lang="ts">
// The editor above is the tool: "Import files…" reads an animated GIF into
// frames (helper/pixel/gif.ts via the store), and the File menu writes the
// sheet. English only, like /sprite-maker.
const features = [
  'Opens an animated GIF as editable frames, keeping each frame’s delay',
  'Reads upscaled GIFs back to their real pixels, so a 4× GIF gives 1× frames',
  'One crop shared by every frame, so a sprite that moves keeps its motion',
  'Exports a PNG sprite sheet, or a sheet + JSON with frame timings in the Aseprite format',
  'The other way round too: import a sprite sheet as frames and download an animated GIF',
  'Runs in your browser, no sign-up; up to 64 frames',
]
const steps = [
  {name: 'Import the GIF', text: 'In the editor above, open File › Import files… and pick your animated GIF. It is preselected to open on the current canvas; “New board” keeps your current work beside it.'},
  {name: 'Check the frames', text: 'Every frame lands in the timeline below the canvas with its own delay. Play it, fix pixels, or delete frames you do not need.'},
  {name: 'Export the sprite sheet', text: 'File › Download spritesheet saves one PNG with the frames side by side; Export for game (sheet + JSON) adds a JSON file with frame sizes, durations and tags.'},
  {name: 'Or go back to a GIF', text: 'Have a sheet instead? File › Import sprite strip slices it into frames by columns and rows, then Download GIF (animated) saves the animation.'},
]
const faq = [
  {q: 'How do I convert a GIF to a sprite sheet?', a: 'Import the GIF with File › Import files… in the editor on this page, then choose File › Download spritesheet. Every frame of the GIF becomes one cell of the sheet.'},
  {q: 'Does it keep the frame timing?', a: 'Yes. Each frame keeps the delay stored in the GIF. Export for game (sheet + JSON) writes those durations into the JSON so your engine can play the animation at the same speed.'},
  {q: 'Can I turn a sprite sheet into a GIF?', a: 'Yes. Use File › Import sprite strip, set the number of columns and rows, then File › Download GIF (animated).'},
  {q: 'My GIF is enlarged — will the frames be blurry?', a: 'No. The importer measures the pixel grid in the first frame and reads every frame back at its real size, so a 16×16 sprite saved at 8× imports as 16×16.'},
  {q: 'Are there limits?', a: 'Up to 64 frames per GIF. A GIF wider or taller than 256 pixels after its pixel grid is read back is treated as a photo and imported as a single still image.'},
  {q: 'Which browsers work?', a: 'Reading animated GIFs uses the browser’s ImageDecoder, which Chrome, Edge and other Chromium-based browsers support. In a browser without it, the GIF opens as one still frame.'},
  {q: 'Can I use the sheet in Godot, Unity or Phaser?', a: 'Yes. Use the PNG sheet with an AnimatedSprite2D in Godot, slice it in Unity’s Sprite Editor, or load the sheet + JSON in Phaser and other engines that read the Aseprite JSON format.'},
]
</script>

<template>
  <EditorLanding
      path="/gif-to-sprite-sheet"
      title="GIF to Sprite Sheet Converter — Free, Online"
      description="Convert an animated GIF to a sprite sheet in your browser: frames and timings kept, upscaled GIFs read back to real pixels, PNG sheet or sheet + JSON export. Free."
      keywords="gif to sprite sheet, gif to spritesheet, convert gif to sprite sheet, sprite sheet to gif, gif frames to png, animated gif to sprite sheet"
      app-name="GIF to Sprite Sheet Converter"
      :features="features"
      :steps="steps"
      :faq="faq"
  >
    <h1>GIF to Sprite Sheet Converter</h1>
    <p>Turn an animated GIF into a sprite sheet for your game: the editor above opens every frame of the GIF with its timing, lets you touch them up, and exports a PNG sheet or a sheet with JSON. It works the other way too — slice a sprite sheet into frames and save an animated GIF.</p>
  </EditorLanding>
</template>
