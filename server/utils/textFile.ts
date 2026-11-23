// Plain-text files (robots, llms, ads, the IndexNow key) live in
// server/assets/text rather than public/. nginx serves anything under public/
// straight from disk with a bare `text/plain`, so browsers read the UTF-8 in
// llms.txt as Latin-1. Served from here, they carry the charset.
export const textFile = (name: string) => defineEventHandler(async (event) => {
    const body = await useStorage('assets:server').getItemRaw(`text/${name}`)
    if (body == null) throw createError({statusCode: 404})
    setHeader(event, 'content-type', 'text/plain; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    return typeof body === 'string' ? body : new TextDecoder().decode(body)
})
