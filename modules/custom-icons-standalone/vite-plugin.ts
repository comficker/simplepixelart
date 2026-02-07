import {promises as fs} from 'fs'
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
    const css = iconNames.map(cls => {
      return `.icon-${cls} {mask-image: url("/icons/${cls}.svg");}`
    }).join('\n')
    await fs.mkdir(path.dirname(output), {recursive: true})
    await fs.writeFile(output, css, 'utf8')
  }

  async function handleFileChanged(file: string) {
    if (!file.endsWith('.vue')) return
    if (!file.startsWith(path.join(root, 'pages')) &&
      !file.startsWith(path.join(root, 'components'))) return

    await readFileContent(file)
    await rebuildCSS()
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
      server.watcher.on('change', async (file) => {
        await handleFileChanged(file)
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
