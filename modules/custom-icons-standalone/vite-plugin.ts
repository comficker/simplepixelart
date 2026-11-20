import {promises as fs} from 'fs'
import {createHash} from 'crypto'
// @ts-ignore
import path from 'path'
import type {Plugin} from 'vite'

const TARGET_DIRS = ['app/pages', 'app/components']
const ICON_REGEX = /icon-([\w-]+)/g;

export default function iconStylesOptimized(options: {
  whiteList?: string[]
  output?: string
} = {}): Plugin {
  const root = process.cwd()
  const output = path.resolve(root, options.output ?? 'app/assets/css/icons.css')
  const iconNames: string[] = options.whiteList ?? []
  let lastCss: string | null = null

  async function initialScan() {
    for (const dir of TARGET_DIRS) {
      await walk(path.join(root, dir))
    }
    await rebuildCSS()
  }

  async function extractFromContent(content: string) {
    const set = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = ICON_REGEX.exec(content)) !== null) {
      // @ts-ignore
      if (!iconNames.includes(match[1])) {
        // @ts-ignore
        iconNames.push(match[1])
      }
    }
  }

  async function walk(dir: string) {
    let entries: any[] = []
    try {
      entries = await fs.readdir(dir, {withFileTypes: true})
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.nuxt', '.output'].includes(entry.name)) continue
        await walk(full)
      } else if (entry.isFile() && full.endsWith('.vue')) {
        await readFileContent(full)
      }
    }
  }

  async function readFileContent(file: string) {
    try {
      await extractFromContent(await fs.readFile(file, 'utf8'))
    } catch {}
  }

  async function rebuildCSS() {
    const rules: string[] = []
    for (const cls of iconNames) {
      try {
        // The file's own hash in the URL: /icons/*.svg is cached for a week
        // by Cloudflare and browsers, so a redrawn icon under the same URL
        // kept showing the old one. A changed file is a new URL.
        const svg = await fs.readFile(path.join(root, 'public/icons', `${cls}.svg`))
        const v = createHash('md5').update(svg).digest('hex').slice(0, 8)
        rules.push(`.icon-${cls} {mask-image: url("/icons/${cls}.svg?v=${v}");}`)
      } catch {}
    }
    const css = rules.join('\n')
    // Unchanged → leave the file alone: every write is an HMR update of a
    // global stylesheet, and most saves add no new icon.
    if (css === lastCss) return
    lastCss = css
    await fs.mkdir(path.dirname(output), {recursive: true})
    await fs.writeFile(output, css, 'utf8')
  }

  async function handleFileChanged(file: string) {
    if (!file.endsWith('.vue')) return
    if (!TARGET_DIRS.some(dir => file.startsWith(path.join(root, dir)))) return

    const before = iconNames.length
    await readFileContent(file)
    // Names are only ever added, so no new name means no new rule.
    if (iconNames.length !== before) await rebuildCSS()
  }

  return {
    name: 'vite:icon-style-optimized',
    enforce: 'post',

    async buildStart() {
      await initialScan()
    },

    configureServer(server) {
      server.watcher.on('add', async (file) => {
        if (file.endsWith('.vue')) {
          await handleFileChanged(file)
        }
      })
    },

    // @ts-ignore
    async handleHotUpdate(ctx) {
      const file = ctx.file
      await handleFileChanged(file)
      return null
    }
  }
}
