import {ofetch} from "ofetch";
import {APIResponse, SharedPage} from "~/types";

const domain = "simplepixelart.com"
const site = `https://${domain}`
const api = "https://touch.ninosaur.com"

// A feed is read by people and by machines that repost it, so it stays short
// and fresh rather than complete — the sitemaps are what completeness is for.
const ITEMS = 50

// Text goes into XML, and a piece can be called "Tom & Jerry <3".
function xml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function cdata(s: string) {
  // The only sequence that can close a CDATA block.
  return `<![CDATA[${String(s ?? "").replace(/]]>/g, "]]&gt;")}]]>`
}

function rfc822(iso?: string) {
  const d = iso ? new Date(iso) : new Date()
  return (isNaN(d.getTime()) ? new Date() : d).toUTCString()
}

export default defineEventHandler(async (event) => {
  // The same pieces the galleries show: originals, not somebody's re-colour
  // and not a tileset part.
  const res: APIResponse<SharedPage> | null = await ofetch(`${api}/coloring/shared-pages/`, {
    query: {page_size: ITEMS, status: "public", is_template: true, ordering: "-updated"},
  }).catch(() => null)
  const items = (res?.results || []).filter(i => i.id_string && !i.is_tile)

  const body = items.map(i => {
    const link = `${site}/art/${i.id_string}`
    // The square render: the one drawn for sharing, art large and no text
    // baked in, so whatever reposts this can use it as-is.
    const image = `${api}/coloring/files/art-square/${i.id_string}.png`
    const title = i.name || i.id_string
    const size = i.width && i.height ? `${i.width}×${i.height}` : ""
    const summary = [size && `${size} pixel art`, "Open it in your browser and edit it."]
      .filter(Boolean).join(" · ")
    return "<item>" +
      `<title>${xml(title)}</title>` +
      `<link>${xml(link)}</link>` +
      `<guid isPermaLink="true">${xml(link)}</guid>` +
      `<pubDate>${rfc822(i.updated)}</pubDate>` +
      `<description>${cdata(`<p><img src="${image}" alt="Pixel art: ${title}"></p><p>${summary}</p>`)}</description>` +
      `<media:content url="${xml(image)}" medium="image" type="image/png"/>` +
      `<media:thumbnail url="${xml(image)}"/>` +
      "</item>"
  }).join("")

  const out = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" ' +
    'xmlns:media="http://search.yahoo.com/mrss/">' +
    "<channel>" +
    "<title>Simple Pixel Art — new pieces</title>" +
    `<link>${site}/arts</link>` +
    "<description>Free pixel art you can open and edit right in your browser.</description>" +
    "<language>en</language>" +
    `<lastBuildDate>${rfc822(items[0]?.updated)}</lastBuildDate>` +
    `<atom:link href="${site}/rss.xml" rel="self" type="application/rss+xml"/>` +
    // A raster: the RSS image element predates SVG and readers skip it.
    `<image><url>${site}/android-chrome-192x192.png</url>` +
    `<title>Simple Pixel Art</title><link>${site}</link></image>` +
    body +
    "</channel></rss>"

  defaultContentType(event, "application/rss+xml; charset=utf-8")
  setHeader(event, "cache-control", "public, max-age=900, stale-while-revalidate=86400")
  return out
})
