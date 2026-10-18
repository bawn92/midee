// Rasterise the Golden Hour marks in design/icons/ into public/icons/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'

const root = process.cwd()
const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

function raster(svgPath, size, outName) {
  const svg = readFileSync(resolve(root, svgPath))
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  })
  const png = resvg.render().asPng()
  writeFileSync(resolve(outDir, outName), png)
  console.log(`[icons] ${outName} ${size}px`)
}

raster('design/icons/src/mark-16.svg', 16, 'favicon-16.png')
raster('design/icons/favicon.svg', 32, 'favicon-32.png')
raster('design/icons/favicon.svg', 96, 'favicon-96.png')
raster('design/icons/src/icon-apple.svg', 180, 'apple-touch-icon.png')
raster('design/icons/src/icon-any.svg', 192, 'icon-192.png')
raster('design/icons/src/icon-any.svg', 512, 'icon-512.png')
raster('design/icons/src/icon-maskable.svg', 512, 'icon-maskable-512.png')
writeFileSync(resolve(outDir, 'favicon.svg'), readFileSync(resolve(root, 'design/icons/favicon.svg')))
console.log('[icons] favicon.svg')
