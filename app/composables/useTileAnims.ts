import {buildTileAnim, type TileAnim} from '~/helper/tile-anim'

// One cache for the page: the tilemap editor and the world preview ask about
// the same tiles, and a tile's animation does not change while it is open.
const cache = new Map<number, Promise<TileAnim | null>>()

const CHUNK = 100

/**
 * Which of a map's tiles animate, and their frames.
 *
 * One list call says which tiles animate (`is_anim`, no frame data), then only
 * those are fetched in full. A tile that cannot be read — someone else's
 * draft — simply stays still on its first frame.
 */
export function useTileAnims() {
  const auth = useAuthStore()

  async function animatedIds(ids: number[]): Promise<number[]> {
    const found = new Map<number, boolean>()
    const ask = async (chunk: number[], user?: string) => {
      try {
        const res = await useNativeFetch<{ results: any[] }>('/coloring/shared-pages/', {
          params: {ids: chunk.join(','), page_size: chunk.length, ...(user ? {user} : {})},
        })
        for (const p of res?.results || []) found.set(Number(p.id), !!p.is_anim)
      } catch { /* left out of `found`: drawn still */ }
    }
    const me = auth.logged?.username
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      // Tiles are drafts as a rule, and a draft lists only for its owner
      // asking about their own; public art lists for anyone.
      if (me) await ask(chunk, me)
      const rest = chunk.filter(id => !found.has(id))
      if (rest.length) await ask(rest)
    }
    return ids.filter(id => found.get(id))
  }

  async function load(ids: number[]): Promise<Map<number, TileAnim>> {
    const unique = [...new Set(ids)]
    const fresh = unique.filter(id => !cache.has(id))
    if (fresh.length) {
      const animated = new Set(await animatedIds(fresh))
      for (const id of fresh) {
        cache.set(id, animated.has(id)
            ? useNativeFetch<any>(`/coloring/shared-pages/${id}/`).then(buildTileAnim).catch(() => null)
            : Promise.resolve(null))
      }
    }
    const out = new Map<number, TileAnim>()
    await Promise.all(unique.map(async (id) => {
      const a = await cache.get(id)
      if (a) out.set(id, a)
    }))
    return out
  }

  return {load}
}
