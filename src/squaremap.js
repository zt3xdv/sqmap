import { PNG } from 'pngjs'
import { PALETTE, lookup } from './palette.js'

const FLAT_BY_BASE = (() => {
  const out = new Map()
  for (const p of PALETTE) {
    if (p.shade === 2) out.set(p.baseId, p.rgb)
  }
  return out
})()

export const TILE_SIZE = 512

export function blocksPerTile(zoom, maxZoom) {
  return TILE_SIZE * Math.pow(2, maxZoom - zoom)
}

export async function fetchWorldSettings(baseUrl, world) {
  const url = `${baseUrl.replace(/\/$/, '')}/tiles/${world}/settings.json`
  const res = await fetch(url, { headers: { 'user-agent': 'sqmap/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

export function tileRange(centerX, centerZ, radius, zoom, maxZoom = 3) {
  const span = blocksPerTile(zoom, maxZoom)
  const xMin = centerX - radius
  const xMax = centerX + radius
  const zMin = centerZ - radius
  const zMax = centerZ + radius
  return {
    txMin: Math.floor(xMin / span),
    txMax: Math.floor(xMax / span),
    tzMin: Math.floor(zMin / span),
    tzMax: Math.floor(zMax / span),
    span,
    xMin, xMax, zMin, zMax,
  }
}

async function fetchTile(baseUrl, world, zoom, tx, tz, retries = 4) {
  const url = `${baseUrl.replace(/\/$/, '')}/tiles/${world}/${zoom}/${tx}_${tz}.png`
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'sqmap/0.1' } })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) return null
      if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null
      return buf
    } catch (e) {
      lastErr = e
      if (attempt === retries) break
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)))
    }
  }
  throw new Error(`failed ${url}: ${lastErr?.message || lastErr}`)
}

function decodePng(buf) {
  return new Promise((resolve, reject) => {
    new PNG().parse(buf, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

function flatten(png) {
  const { data } = png
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a === 0) continue
    const entry = lookup(data[i], data[i + 1], data[i + 2], a)
    if (!entry) continue
    const flat = FLAT_BY_BASE.get(entry.baseId)
    if (!flat) continue
    data[i]     = flat[0]
    data[i + 1] = flat[1]
    data[i + 2] = flat[2]
  }
}

function blendPixel(data, idx, r, g, b, a) {
  const dstA = data[idx + 3] / 255
  const srcA = a / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) return
  data[idx]     = Math.round((r * srcA + data[idx]     * dstA * (1 - srcA)) / outA)
  data[idx + 1] = Math.round((g * srcA + data[idx + 1] * dstA * (1 - srcA)) / outA)
  data[idx + 2] = Math.round((b * srcA + data[idx + 2] * dstA * (1 - srcA)) / outA)
  data[idx + 3] = Math.round(outA * 255)
}

function drawChunkGrid(png, { originX, originZ, pxPerBlock, color, alpha, chunkSize, style }) {
  const { width, height, data } = png
  const [r, g, b] = color
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
  const step = chunkSize * pxPerBlock
  if (step < 1) return

  if (style === 'fill') {
    for (let y = 0; y < height; y++) {
      const worldZ = Math.floor(y / pxPerBlock + originZ)
      const cz = Math.floor(worldZ / chunkSize)
      for (let x = 0; x < width; x++) {
        const worldX = Math.floor(x / pxPerBlock + originX)
        const cx = Math.floor(worldX / chunkSize)
        if (((cx + cz) & 1) === 0) continue
        blendPixel(data, (y * width + x) * 4, r, g, b, a)
      }
    }
    return
  }

  const firstChunkX = Math.ceil(originX / chunkSize) * chunkSize
  for (let cx = firstChunkX; ; cx += chunkSize) {
    const px = Math.round((cx - originX) * pxPerBlock)
    if (px >= width) break
    if (px < 0) continue
    for (let y = 0; y < height; y++) {
      blendPixel(data, (y * width + px) * 4, r, g, b, a)
    }
  }

  const firstChunkZ = Math.ceil(originZ / chunkSize) * chunkSize
  for (let cz = firstChunkZ; ; cz += chunkSize) {
    const py = Math.round((cz - originZ) * pxPerBlock)
    if (py >= height) break
    if (py < 0) continue
    const rowStart = py * width * 4
    for (let x = 0; x < width; x++) {
      blendPixel(data, rowStart + x * 4, r, g, b, a)
    }
  }
}

function encodePng(png) {
  return new Promise((resolve, reject) => {
    const chunks = []
    png.pack()
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject)
  })
}

export async function renderRegion({
  baseUrl,
  world,
  centerX,
  centerZ,
  radius,
  zoom = 3,
  maxZoom = 3,
  concurrency = 6,
  onProgress,
  chunkGrid = null,
  scale = 1,
  flat = false,
}) {
  const span = blocksPerTile(zoom, maxZoom)
  const range = tileRange(centerX, centerZ, radius, zoom, maxZoom)
  const tilesW = range.txMax - range.txMin + 1
  const tilesH = range.tzMax - range.tzMin + 1
  const total = tilesW * tilesH

  const canvasW = tilesW * TILE_SIZE
  const canvasH = tilesH * TILE_SIZE
  const canvas = new PNG({ width: canvasW, height: canvasH })
  canvas.data.fill(0)

  const jobs = []
  for (let tz = range.tzMin; tz <= range.tzMax; tz++) {
    for (let tx = range.txMin; tx <= range.txMax; tx++) {
      jobs.push({ tx, tz })
    }
  }

  let done = 0
  let missing = 0
  const queue = jobs.slice()

  async function worker() {
    while (queue.length) {
      const { tx, tz } = queue.shift()
      const buf = await fetchTile(baseUrl, world, zoom, tx, tz)
      if (buf) {
        const tile = await decodePng(buf)
        const dx = (tx - range.txMin) * TILE_SIZE
        const dy = (tz - range.tzMin) * TILE_SIZE
        tile.bitblt(canvas, 0, 0, TILE_SIZE, TILE_SIZE, dx, dy)
      } else {
        missing++
      }
      done++
      if (onProgress) onProgress(done, total, missing)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker())
  await Promise.all(workers)

  const pxPerBlock = TILE_SIZE / span
  const blockOriginX = range.txMin * span
  const blockOriginZ = range.tzMin * span

  const cropPxX = Math.floor((range.xMin - blockOriginX) * pxPerBlock)
  const cropPxZ = Math.floor((range.zMin - blockOriginZ) * pxPerBlock)
  const cropW = Math.max(1, Math.round((range.xMax - range.xMin + 1) * pxPerBlock))
  const cropH = Math.max(1, Math.round((range.zMax - range.zMin + 1) * pxPerBlock))

  const out = new PNG({ width: cropW, height: cropH })
  canvas.bitblt(out, cropPxX, cropPxZ, cropW, cropH, 0, 0)

  if (flat) flatten(out)

  if (chunkGrid) {
    drawChunkGrid(out, {
      originX: range.xMin,
      originZ: range.zMin,
      pxPerBlock,
      color: chunkGrid.color,
      alpha: chunkGrid.alpha,
      chunkSize: chunkGrid.chunkSize ?? 16,
      style: chunkGrid.style ?? 'border',
    })
  }

  const final = scale && scale !== 1 ? resizeNearest(out, scale) : out
  const png = await encodePng(final)
  return {
    buffer: png,
    width: final.width,
    height: final.height,
    tiles: total,
    missing,
    range,
  }
}

function resizeNearest(src, factor) {
  const w = Math.max(1, Math.round(src.width * factor))
  const h = Math.max(1, Math.round(src.height * factor))
  const dst = new PNG({ width: w, height: h })
  const { data: sd, width: sw } = src
  const dd = dst.data
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / factor))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(sw - 1, Math.floor(x / factor))
      const si = (sy * sw + sx) * 4
      const di = (y * w + x) * 4
      dd[di]     = sd[si]
      dd[di + 1] = sd[si + 1]
      dd[di + 2] = sd[si + 2]
      dd[di + 3] = sd[si + 3]
    }
  }
  return dst
}
