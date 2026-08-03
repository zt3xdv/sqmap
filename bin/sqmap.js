#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as ui from '../src/ui.js'
import { renderRegion, fetchWorldSettings } from '../src/squaremap.js'
import { decodeImage } from '../src/decode.js'

function printUsage() {
  ui.header()
  ui.section('usage')
  ui.write('node bin/sqmap.js render <base-url> <world> <x> <z> <radius> [options]')
  ui.write('node bin/sqmap.js decode <input.png> [options]')
  ui.write()
  
  ui.section('render options')
  ui.info('-o, --out <file>', 'output png path (default: region_<x>_<z>.png)', 21)
  ui.info('-z, --zoom <n>', 'zoom level (default: server max = max detail, 1px=1block)', 21)
  ui.info('-m, --max-zoom <n>', 'override server max zoom (auto-detected from settings.json)', 21)
  ui.info('-c, --concurrency <n>', 'parallel tile downloads (default: 6)', 21)
  ui.info('-s, --scale <n>', 'integer resize ratio (e.g. 2 = 2x bigger, -2 = 1/2x smaller)', 21)
  ui.info('--flat', 'remove terrain shading (snap each pixel to its base color)', 21)
  ui.info('--chunks', 'draw a chunk overlay (semi-transparent)', 21)
  ui.info('--chunk-style <type>', 'overlay style: border | fill (default: border)', 21)
  ui.info('--chunk-color <hex>', 'chunk overlay color (default: 000000)', 21)
  ui.info('--chunk-alpha <n>', 'overlay opacity 0-1 (default: 0.4)', 21)
  ui.info('--chunk-size <n>', 'blocks per chunk side (default: 16)', 21)
  ui.write()
  
  ui.section('decode options')
  ui.info('-o, --out <file>', 'output json path (default: <input>.json)', 21)
  ui.info('-x, --origin-x <n>', 'block x of top-left pixel (default: 0)', 21)
  ui.info('-Z, --origin-z <n>', 'block z of top-left pixel (default: 0)', 21)
  ui.info('--pretty', 'pretty-print json (default: compact)', 21)
  ui.write()
  
  ui.section('examples')
  ui.write('node bin/sqmap.js render https://squaremap-demo.jpenilla.xyz world 0 0 256')
  ui.write('node bin/sqmap.js decode region_0_0.png -x -256 -Z -256')
}

function parseScale(s) {
  if (s == null) return 1
  const n = Number(String(s).trim())
  if (!Number.isInteger(n) || n === 0) return null
  return n
}

function scaleFactor(n) {
  return n >= 0 ? n : 1 / Math.abs(n)
}

function parseHexColor(s) {
  const m = String(s).trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)]
}

function parseArgs(argv) {
  const positional = []
  const opts = { concurrency: 6, originX: 0, originZ: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-o': case '--out':
        opts.out = argv[++i]; break
      case '-z': case '--zoom':
        opts.zoom = Number(argv[++i]); break
      case '-m': case '--max-zoom':
        opts.maxZoom = Number(argv[++i]); break
      case '-c': case '--concurrency':
        opts.concurrency = Number(argv[++i]); break
      case '-s': case '--scale':
        opts.scale = argv[++i]; break
      case '-x': case '--origin-x':
        opts.originX = Number(argv[++i]); break
      case '-Z': case '--origin-z':
        opts.originZ = Number(argv[++i]); break
      case '--pretty':
        opts.pretty = true; break
      case '--flat':
        opts.flat = true; break
      case '--chunks':
        opts.chunks = true; break
      case '--chunk-style':
        opts.chunkStyle = argv[++i]; break
      case '--chunk-color':
        opts.chunkColor = argv[++i]; break
      case '--chunk-alpha':
        opts.chunkAlpha = Number(argv[++i]); break
      case '--chunk-size':
        opts.chunkSize = Number(argv[++i]); break
      case '-h': case '--help':
        printUsage(); process.exit(0)
      default:
        positional.push(a)
    }
  }
  return { positional, opts }
}

async function cmdRender(args) {
  const { positional, opts } = parseArgs(args)
  if (positional.length < 5) {
    ui.error('usage: sqmap render <base-url> <world> <x> <z> <radius>')
    process.exit(1)
  }
  const [baseUrl, world, xStr, zStr, rStr] = positional
  const x = Number(xStr), z = Number(zStr), radius = Number(rStr)
  if ([x, z, radius].some((n) => !Number.isFinite(n))) {
    ui.error('x, z, radius must be numbers')
    process.exit(1)
  }
  const out = opts.out
    ? resolve(opts.out)
    : resolve(process.cwd(), `region_${x}_${z}.png`)

  ui.header()
  ui.section('target')
  ui.info('server', baseUrl)
  ui.info('world', world)
  ui.info('center', `${x}, ${z}`)
  ui.info('radius', `${radius} blocks`)
  process.stdout.write('\n')

  const detect = ui.spinner('detecting world settings')
  let maxZoom
  try {
    const settings = await fetchWorldSettings(baseUrl, world)
    maxZoom = settings?.zoom?.max
    if (!Number.isFinite(maxZoom)) throw new Error('settings.json missing zoom.max')
    detect.stop(true)
  } catch (e) {
    detect.stop(false)
    ui.error(e.message || String(e))
    if (opts.maxZoom == null) process.exit(1)
    maxZoom = opts.maxZoom
  }
  if (opts.maxZoom != null) maxZoom = opts.maxZoom
  const zoom = opts.zoom != null ? opts.zoom : maxZoom
  if (zoom < 0 || zoom > maxZoom) {
    ui.error(`zoom must be between 0 and ${maxZoom}`)
    process.exit(1)
  }
  ui.info('zoom', `${zoom} (server max ${maxZoom})`)

  const scaleN = parseScale(opts.scale)
  if (scaleN === null) {
    ui.error('--scale must be a non-zero integer (e.g. 2 = 2x, -2 = 0.5x)')
    process.exit(1)
  }
  // negative limit: cannot scale below 1 px on the smallest dimension
  const baseSide = Math.max(1, Math.round((2 * radius + 1) * Math.pow(2, zoom - maxZoom)))
  if (scaleN < 0 && Math.abs(scaleN) > baseSide) {
    ui.error(`--scale ${scaleN} too small: would shrink ${baseSide}px dimension below 1px (min ${-baseSide})`)
    process.exit(1)
  }
  const scale = scaleFactor(scaleN)
  if (scale !== 1) ui.info('scale', scaleN > 0 ? `${scaleN}x` : `1/${Math.abs(scaleN)}x`)
  if (opts.flat) ui.info('flat', 'on (terrain shading removed)')

  let chunkGrid = null
  if (opts.chunks) {
    const color = parseHexColor(opts.chunkColor || '000000')
    if (!color) {
      ui.error(`invalid --chunk-color: ${opts.chunkColor}`)
      process.exit(1)
    }
    const alpha = opts.chunkAlpha != null ? opts.chunkAlpha : 0.4
    if (!(alpha >= 0 && alpha <= 1)) {
      ui.error('--chunk-alpha must be between 0 and 1')
      process.exit(1)
    }
    const chunkSize = opts.chunkSize ?? 16
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      ui.error('--chunk-size must be a positive number')
      process.exit(1)
    }
    const style = (opts.chunkStyle || 'border').toLowerCase()
    if (style !== 'border' && style !== 'fill') {
      ui.error(`--chunk-style must be 'border' or 'fill'`)
      process.exit(1)
    }
    chunkGrid = { color, alpha, chunkSize, style }
    const hex = color.map((c) => c.toString(16).padStart(2, '0')).join('')
    ui.info('chunks', `${style} #${hex} @ ${alpha} (${chunkSize}b)`)
  }
  process.stdout.write('\n')

  const start = Date.now()
  let lastDraw = 0
  let result
  try {
    result = await renderRegion({
      baseUrl,
      world,
      centerX: x,
      centerZ: z,
      radius,
      zoom,
      maxZoom,
      concurrency: opts.concurrency,
      chunkGrid,
      scale,
      flat: opts.flat,
      onProgress: (done, total, missing) => {
        const now = Date.now()
        if (now - lastDraw < 60 && done < total) return
        lastDraw = now
        ui.progress(`tiles${missing ? ` (${missing} missing)` : ''}`, done, total)
      },
    })
    process.stdout.write('\n')
  } catch (e) {
    process.stdout.write('\n')
    ui.error(e.message || String(e))
    process.exit(1)
  }

  await writeFile(out, result.buffer)
  const elapsed = ((Date.now() - start) / 1000).toFixed(2)

  process.stdout.write('\n')
  ui.section('result')
  ui.info('size', `${result.width} x ${result.height} px`)
  ui.info('tiles', `${result.tiles} (${result.missing} missing)`)
  ui.info('bytes', result.buffer.length.toLocaleString())
  ui.info('elapsed', `${elapsed}s`)
  ui.info('output', out)
  process.stdout.write('\n')
  ui.success('done')
  process.stdout.write('\n')
}

async function cmdDecode(args) {
  const { positional, opts } = parseArgs(args)
  if (positional.length < 1) {
    ui.error('usage: sqmap decode <input.png>')
    process.exit(1)
  }
  const input = resolve(positional[0])
  const out = opts.out
    ? resolve(opts.out)
    : input.replace(/\.png$/i, '') + '.json'

  ui.header()
  ui.section('decode')
  ui.write('note that this may not be accurate, as the minecraft map palette is limited (check src/palette.js)')
  ui.info('input', input)
  ui.info('origin', `${opts.originX}, ${opts.originZ}`)
  process.stdout.write('\n')

  const spin = ui.spinner('decoding image with map color palette')
  let result
  try {
    result = await decodeImage(input, { originX: opts.originX, originZ: opts.originZ })
    spin.stop(true)
  } catch (e) {
    spin.stop(false)
    ui.error(e.message || String(e))
    process.exit(1)
  }

  const json = opts.pretty
    ? JSON.stringify(result, null, 2)
    : JSON.stringify(result)
  await writeFile(out, json)

  process.stdout.write('\n')
  ui.section('result')
  ui.info('size', `${result.width} x ${result.height} px`)
  ui.info('palette', `${result.palette.length} blocks`)
  ui.info('bytes', json.length.toLocaleString())
  ui.info('output', out)
  process.stdout.write('\n')

  ui.section('top blocks')
  const total = result.width * result.height
  const top = Object.entries(result.histogram).slice(0, 8)
  for (const [block, count] of top) {
    const pct = ((count / total) * 100).toFixed(1).padStart(5)
    ui.info(block, `${pct}%  ${count.toLocaleString()}`)
  }
  process.stdout.write('\n')
  ui.success('done')
  process.stdout.write('\n')
}

const [, , cmd, ...rest] = process.argv
switch ((cmd || '').toLowerCase()) {
  case 'render':
    await cmdRender(rest)
    break
  case 'decode':
    await cmdDecode(rest)
    break
  case 'help': case '--help': case '-h': case undefined: case '':
    printUsage()
    if (!cmd) process.exit(1)
    break
  default:
    ui.error(`unknown command: ${cmd}`)
    printUsage()
    process.exit(1)
}
