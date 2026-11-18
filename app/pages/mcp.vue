<script setup lang="ts">
// English only for now: locale copies canonical to this URL. The facts here
// mirror ../pixel-art-mcp (package simplepixelart-mcp): keep them in step
// when its tools change.
const URL = 'https://simplepixelart.com/mcp'
const NPM = 'https://www.npmjs.com/package/simplepixelart-mcp'
const GITHUB = 'https://github.com/comficker/pixel-art-mcp'
const ENDPOINT = 'https://mcp.simplepixelart.com/mcp'

const tools = [
  {name: 'pixelate_image', text: 'Turns an image into pixel art: shrinks it to a pixel grid (say 64 px wide), reduces it to N colors with median cut or maps it to a named palette, and saves a PNG, optionally upscaled for preview.'},
  {name: 'extract_palette', text: 'Pulls the main colors out of an image and returns the hex codes plus a GIMP / Aseprite .gpl palette file.'},
  {name: 'remap_palette', text: 'Recolors existing pixel art so every pixel uses a palette color — PICO-8, Sweetie 16, ENDESGA 32, Game Boy, 1-bit or your own hex list.'},
  {name: 'upscale_pixel_art', text: 'Upscales by a whole number with nearest-neighbor sampling, so pixels stay sharp.'},
  {name: 'list_palettes', text: 'Lists the built-in palettes.'},
]

const configJson = `{
  "mcpServers": {
    "pixel-art": {
      "command": "npx",
      "args": ["-y", "simplepixelart-mcp"]
    }
  }
}`
const claudeCode = 'claude mcp add pixel-art -- npx -y simplepixelart-mcp'
const hostedJson = `{
  "mcpServers": {
    "pixel-art": { "url": "${ENDPOINT}" }
  }
}`

const faq = [
  {q: 'Is the pixel art MCP server free?', a: 'Yes. It is free and open source under the MIT license. It runs on your own machine through npx, with no account and no API key.'},
  {q: 'Which clients does it work with?', a: 'Any MCP client: Claude Desktop, Claude Code, Cursor, Windsurf, VS Code and others. Most take the same JSON config with the npx command.'},
  {q: 'What do I need installed?', a: 'Node.js 18 or newer. The package has no native dependencies, so npx -y simplepixelart-mcp is all it takes.'},
  {q: 'Is there a hosted version?', a: `Yes: ${ENDPOINT} (Streamable HTTP, no auth). Images go in as a public URL or base64 and come back as PNG, with limits of 4 MB / 2048×2048 input, 1024 px output and 20 requests a minute.`},
  {q: 'Does it upload my images anywhere?', a: 'Not when you run it locally with npx: images are read and written on your machine. Only the hosted endpoint receives the images you send it.'},
  {q: 'What image formats does it read?', a: 'PNG and JPEG files, or image URLs.'},
  {q: 'Can I edit the result by hand?', a: 'Yes. Open the PNG in the free online pixel art editor on SimplePixelArt to fix details, add layers or animate it.'},
]

useCustomSeoMeta({
  untranslated: true,
  title: 'Free Pixel Art MCP Server for Claude & Cursor',
  description: 'simplepixelart-mcp: a free, open-source MCP server that gives AI assistants pixel art tools — pixelate images, extract and remap palettes, upscale without blur. No API key.',
  keywords: 'pixel art mcp, pixel art mcp server, mcp server image, claude pixel art, cursor mcp pixel art, simplepixelart-mcp, palette mcp',
  canonical: URL,
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: 'simplepixelart-mcp',
          url: URL,
          applicationCategory: 'DeveloperApplication',
          operatingSystem: 'Windows, macOS, Linux (Node.js 18+)',
          offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
          license: 'https://opensource.org/licenses/MIT',
          sameAs: [NPM, GITHUB],
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
    <p class="page-meta">For developers</p>
    <h1>Free Pixel Art MCP Server for Claude, Cursor and VS Code</h1>
    <p><code>simplepixelart-mcp</code> gives your AI assistant real pixel art tools: turn any image into pixel art, extract a palette, recolor sprites to PICO-8 or Game Boy colors, and upscale without blur. It is free and open source, runs locally through <code>npx</code>, and needs no API key or account.</p>
    <p>
      <a :href="GITHUB" class="btn primary" target="_blank" rel="noopener">View on GitHub</a>
      <a :href="NPM" class="btn" target="_blank" rel="noopener">npm package</a>
    </p>

    <h2>Install</h2>
    <h3>Claude Desktop, Cursor, Windsurf, VS Code</h3>
    <p>Add this to your client’s MCP config (<code>claude_desktop_config.json</code>, <code>.cursor/mcp.json</code> and so on):</p>
    <pre><code>{{ configJson }}</code></pre>
    <h3>Claude Code</h3>
    <pre><code>{{ claudeCode }}</code></pre>
    <h3>Hosted, nothing to install</h3>
    <p>A remote endpoint runs at <code>{{ ENDPOINT }}</code> (Streamable HTTP, no auth):</p>
    <pre><code>{{ hostedJson }}</code></pre>
    <p>Requires Node.js 18 or newer for the local server.</p>

    <h2>Tools</h2>
    <template v-for="t in tools" :key="t.name">
      <h3><code>{{ t.name }}</code></h3>
      <p>{{ t.text }}</p>
    </template>

    <h2>Example prompts</h2>
    <ul>
      <li>“Turn <code>~/photos/cat.jpg</code> into 48 px wide pixel art with the PICO-8 palette, and save an 8× preview.”</li>
      <li>“Extract a 6-color palette from this screenshot and give me the .gpl file.”</li>
      <li>“Recolor every sprite in <code>assets/</code> to the Game Boy palette.”</li>
      <li>“Upscale <code>hero.png</code> 10× for the store page.”</li>
    </ul>

    <h2>Finish it by hand</h2>
    <p>The tools give you a clean starting grid; the rest is pixel work. Open the PNG in the free <NuxtLinkLocale to="/editor">pixel art editor</NuxtLinkLocale>, or use the in-browser <NuxtLinkLocale to="/converter">image to pixel art converter</NuxtLinkLocale> when you want to tune size, colors and dithering with a live preview.</p>

    <QnA :items="faq"/>

    <h2>More for game developers</h2>
    <ul>
      <li><NuxtLink to="/pixel-art-for-godot">Pixel art for Godot 4</NuxtLink></li>
      <li><NuxtLink to="/compare">Compare pixel art editors</NuxtLink></li>
      <li><NuxtLinkLocale to="/palettes">Pixel art palettes</NuxtLinkLocale></li>
    </ul>
  </article>
</template>
