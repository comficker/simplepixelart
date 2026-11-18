<script setup lang="ts">
import {COMPETITORS} from '~/helper/compare'

useCustomSeoMeta({
  untranslated: true,
  title: 'Pixel Art Editor Comparison — Free vs Paid Tools',
  description: 'Compare SimplePixelArt with Aseprite, Piskel and Pixelorama: price, platforms, animation, tilesets and game engine export, written to help you pick the right pixel art tool.',
  keywords: 'best pixel art editor, pixel art software comparison, aseprite alternative, piskel alternative, pixelorama vs, free pixel art editor',
  canonical: 'https://simplepixelart.com/compare',
})
</script>

<template>
  <article class="page prose">
    <h1>Compare pixel art editors</h1>
    <p>Choosing a pixel art tool? These pages put SimplePixelArt next to the editors people usually weigh it against — price, platforms, animation, tilesets and game engine export — and say plainly where each one is the better pick.</p>
    <ul>
      <li v-for="c in COMPETITORS" :key="c.slug">
        <NuxtLink :to="`/compare/${c.slug}`"><strong>SimplePixelArt vs {{ c.name }}</strong></NuxtLink> — {{ c.blurb }}
      </li>
    </ul>

    <h2>What SimplePixelArt is built for</h2>
    <p>A free editor that runs in the browser, aimed at small game assets: sprites with layers and animation, tilesets with autotile terrains, and tilemaps that export straight to Godot 4 and Tiled. Every piece in the public gallery opens in the editor, so you can learn by remixing.</p>
    <p>
      <NuxtLinkLocale to="/editor" class="btn primary">Open the editor</NuxtLinkLocale>
    </p>
  </article>
</template>
