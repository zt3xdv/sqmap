import { readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { lookup } from './palette.js'

function decodePng(buf) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buf, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

export async function decodeImage(path, { originX = 0, originZ = 0 } = {}) {
  const buf = await readFile(path)
  const png = await decodePng(buf)
  const { width, height, data } = png

  const seen = new Map()
  let nextId = 0
  const ids = new Uint16Array(width * height)
  const counts = new Map()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
      const entry = lookup(r, g, b, a)
      const block = entry ? entry.block : 'air'
      let id = seen.get(block)
      if (id === undefined) {
        id = nextId++
        seen.set(block, id)
      }
      ids[y * width + x] = id
      counts.set(block, (counts.get(block) || 0) + 1)
    }
  }

  const palette = Array.from(seen.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([block]) => block)

  const rows = new Array(height)
  for (let y = 0; y < height; y++) {
    const row = new Array(width)
    for (let x = 0; x < width; x++) row[x] = ids[y * width + x]
    rows[y] = row
  }

  return {
    width,
    height,
    origin: { x: originX, z: originZ },
    palette,
    grid: rows,
    histogram: Object.fromEntries(
      [...counts.entries()].sort((a, b) => b[1] - a[1])
    ),
  }
}
