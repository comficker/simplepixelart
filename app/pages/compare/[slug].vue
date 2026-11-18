<script setup lang="ts">
import {COMPETITORS, competitor} from '~/helper/compare'

// English only for now: locale copies canonical to this URL.
const route = useRoute()
const c = competitor(String(route.params.slug))
if (!c) throw createError({statusCode: 404, statusMessage: 'Not found', fatal: true})
const others = COMPETITORS.filter(x => x.slug !== c.slug)
const url = `https://simplepixelart.com/compare/${c.slug}`

useCustomSeoMeta({
  untranslated: true,
  title: c.title,
  description: c.description,
  keywords: c.keywords,
  canonical: url,
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'FAQPage',
          mainEntity: c.faq.map(f => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}})),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            {'@type': 'ListItem', position: 1, name: 'Home', item: 'https://simplepixelart.com/'},
            {'@type': 'ListItem', position: 2, name: 'Compare', item: 'https://simplepixelart.com/compare'},
            {'@type': 'ListItem', position: 3, name: `SimplePixelArt vs ${c.name}`, item: url},
          ],
        },
      ],
    }),
  }],
})
</script>

<template>
  <article class="page prose">
    <p class="page-meta"><NuxtLink to="/compare">Compare pixel art editors</NuxtLink></p>
    <h1>SimplePixelArt vs {{ c.name }}</h1>
    <p>{{ c.intro }}</p>
    <p>
      <NuxtLinkLocale to="/editor" class="btn primary">Try the free editor</NuxtLinkLocale>
    </p>

    <h2>Feature comparison</h2>
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr><th scope="col"/><th scope="col">SimplePixelArt</th><th scope="col">{{ c.name }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in c.rows" :key="r.label">
            <th scope="row">{{ r.label }}</th>
            <td>{{ r.spa }}</td>
            <td>{{ r.other }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-xs text-muted">Based on each tool’s own documentation, checked November 2026. Features change — check {{ c.name }}’s site for its latest release.</p>

    <h2>When to use which</h2>
    <h3>Pick {{ c.name }} if…</h3>
    <ul><li v-for="w in c.otherWins" :key="w">{{ w }}</li></ul>
    <h3>Pick SimplePixelArt if…</h3>
    <ul><li v-for="w in c.spaWins" :key="w">{{ w }}</li></ul>

    <h2>Try it on a real project</h2>
    <ul>
      <li><NuxtLinkLocale to="/editor">Pixel art editor</NuxtLinkLocale> — layers, animation, sprite sheet and GIF export</li>
      <li><NuxtLinkLocale to="/tilesets/editor">Tileset editor</NuxtLinkLocale> — Wang 16 / blob 47 terrains, Godot 4 and Tiled export</li>
      <li><NuxtLinkLocale to="/tilemaps/editor">Tilemap editor</NuxtLinkLocale> — paint levels and export a Godot scene or Tiled map</li>
      <li><NuxtLink to="/pixel-art-for-godot">Pixel art for Godot</NuxtLink> — the whole workflow from tiles to a scene</li>
      <li><NuxtLink to="/mcp">Free pixel art MCP server</NuxtLink> — pixel art tools for Claude, Cursor and VS Code</li>
    </ul>

    <QnA :items="c.faq"/>

    <h2>Other comparisons</h2>
    <ul>
      <li v-for="o in others" :key="o.slug"><NuxtLink :to="`/compare/${o.slug}`">SimplePixelArt vs {{ o.name }}</NuxtLink></li>
    </ul>
  </article>
</template>
