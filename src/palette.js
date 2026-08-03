// minecraft map color palette (java edition).
// each base color is rendered with 4 brightness modifiers:
//   shade 0 = base * 180/255 (dark)
//   shade 1 = base * 220/255
//   shade 2 = base       (full)
//   shade 3 = base * 135/255 (very dark, used for transparent/edges)
// pixel rgb = base * mult / 255
// reference: https://minecraft.wiki/w/Map_item_format#Map_colors

// id -> { rgb: [r,g,b], block: representative block name }
const BASE = [
  { id: 0,  rgb: [0, 0, 0],         block: 'air' },
  { id: 1,  rgb: [127, 178, 56],    block: 'grass_block' },
  { id: 2,  rgb: [247, 233, 163],   block: 'sand' },
  { id: 3,  rgb: [199, 199, 199],   block: 'cobweb' },
  { id: 4,  rgb: [255, 0, 0],       block: 'lava' },
  { id: 5,  rgb: [160, 160, 255],   block: 'ice' },
  { id: 6,  rgb: [167, 167, 167],   block: 'iron_block' },
  { id: 7,  rgb: [0, 124, 0],       block: 'oak_leaves' },
  { id: 8,  rgb: [255, 255, 255],   block: 'snow' },
  { id: 9,  rgb: [164, 168, 184],   block: 'clay' },
  { id: 10, rgb: [151, 109, 77],    block: 'dirt' },
  { id: 11, rgb: [112, 112, 112],   block: 'stone' },
  { id: 12, rgb: [64, 64, 255],     block: 'water' },
  { id: 13, rgb: [143, 119, 72],    block: 'oak_planks' },
  { id: 14, rgb: [255, 252, 245],   block: 'quartz_block' },
  { id: 15, rgb: [216, 127, 51],    block: 'orange_wool' },
  { id: 16, rgb: [178, 76, 216],    block: 'magenta_wool' },
  { id: 17, rgb: [102, 153, 216],   block: 'light_blue_wool' },
  { id: 18, rgb: [229, 229, 51],    block: 'yellow_wool' },
  { id: 19, rgb: [127, 204, 25],    block: 'lime_wool' },
  { id: 20, rgb: [242, 127, 165],   block: 'pink_wool' },
  { id: 21, rgb: [76, 76, 76],      block: 'gray_wool' },
  { id: 22, rgb: [153, 153, 153],   block: 'light_gray_wool' },
  { id: 23, rgb: [76, 127, 153],    block: 'cyan_wool' },
  { id: 24, rgb: [127, 63, 178],    block: 'purple_wool' },
  { id: 25, rgb: [51, 76, 178],     block: 'blue_wool' },
  { id: 26, rgb: [102, 76, 51],     block: 'brown_wool' },
  { id: 27, rgb: [102, 127, 51],    block: 'green_wool' },
  { id: 28, rgb: [153, 51, 51],     block: 'red_wool' },
  { id: 29, rgb: [25, 25, 25],      block: 'black_wool' },
  { id: 30, rgb: [250, 238, 77],    block: 'gold_block' },
  { id: 31, rgb: [92, 219, 213],    block: 'diamond_block' },
  { id: 32, rgb: [74, 128, 255],    block: 'lapis_block' },
  { id: 33, rgb: [0, 217, 58],      block: 'emerald_block' },
  { id: 34, rgb: [129, 86, 49],     block: 'podzol' },
  { id: 35, rgb: [112, 2, 0],       block: 'netherrack' },
  { id: 36, rgb: [209, 177, 161],   block: 'white_terracotta' },
  { id: 37, rgb: [159, 82, 36],     block: 'orange_terracotta' },
  { id: 38, rgb: [149, 87, 108],    block: 'magenta_terracotta' },
  { id: 39, rgb: [112, 108, 138],   block: 'light_blue_terracotta' },
  { id: 40, rgb: [186, 133, 36],    block: 'yellow_terracotta' },
  { id: 41, rgb: [103, 117, 53],    block: 'lime_terracotta' },
  { id: 42, rgb: [160, 77, 78],     block: 'pink_terracotta' },
  { id: 43, rgb: [57, 41, 35],      block: 'gray_terracotta' },
  { id: 44, rgb: [135, 107, 98],    block: 'light_gray_terracotta' },
  { id: 45, rgb: [87, 92, 92],      block: 'cyan_terracotta' },
  { id: 46, rgb: [122, 73, 88],     block: 'purple_terracotta' },
  { id: 47, rgb: [76, 62, 92],      block: 'blue_terracotta' },
  { id: 48, rgb: [76, 50, 35],      block: 'brown_terracotta' },
  { id: 49, rgb: [76, 82, 42],      block: 'green_terracotta' },
  { id: 50, rgb: [142, 60, 46],     block: 'red_terracotta' },
  { id: 51, rgb: [37, 22, 16],      block: 'black_terracotta' },
  { id: 52, rgb: [189, 48, 49],     block: 'crimson_nylium' },
  { id: 53, rgb: [148, 63, 97],     block: 'crimson_stem' },
  { id: 54, rgb: [92, 25, 29],      block: 'crimson_hyphae' },
  { id: 55, rgb: [22, 126, 134],    block: 'warped_nylium' },
  { id: 56, rgb: [58, 142, 140],    block: 'warped_stem' },
  { id: 57, rgb: [86, 44, 62],      block: 'warped_hyphae' },
  { id: 58, rgb: [20, 180, 133],    block: 'warped_wart_block' },
  { id: 59, rgb: [100, 100, 100],   block: 'deepslate' },
  { id: 60, rgb: [216, 175, 147],   block: 'raw_iron_block' },
  { id: 61, rgb: [127, 167, 150],   block: 'glow_lichen' },
]

const SHADES = [180, 220, 255, 135]

function shade(c, mult) {
  return Math.floor((c * mult) / 255)
}

export const PALETTE = (() => {
  const out = []
  for (const base of BASE) {
    for (let s = 0; s < 4; s++) {
      const m = SHADES[s]
      const r = shade(base.rgb[0], m)
      const g = shade(base.rgb[1], m)
      const b = shade(base.rgb[2], m)
      out.push({
        paletteId: base.id * 4 + s,
        baseId: base.id,
        shade: s,
        block: base.block,
        rgb: [r, g, b],
      })
    }
  }
  return out
})()

const EXACT = new Map()
for (const p of PALETTE) {
  const key = (p.rgb[0] << 16) | (p.rgb[1] << 8) | p.rgb[2]
  if (!EXACT.has(key)) EXACT.set(key, p)
}

const NEAREST_CACHE = new Map()

export function lookup(r, g, b, a = 255) {
  if (a === 0) return null
  const key = (r << 16) | (g << 8) | b
  const exact = EXACT.get(key)
  if (exact) return exact
  const cached = NEAREST_CACHE.get(key)
  if (cached) return cached
  let best = PALETTE[0]
  let bestDist = Infinity
  for (const p of PALETTE) {
    const dr = p.rgb[0] - r
    const dg = p.rgb[1] - g
    const db = p.rgb[2] - b
    const d = dr * dr + dg * dg + db * db
    if (d < bestDist) {
      bestDist = d
      best = p
      if (d === 0) break
    }
  }
  NEAREST_CACHE.set(key, best)
  return best
}
