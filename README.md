# sqmap

Fetch [squaremap](https://github.com/jpenilla/squaremap) tiles and stitch a region around given Minecraft coordinates into a single png

## install

```
npm install
```

## usage

```
node bin/sqmap.js help
```

## how it works

squaremap exposes `/tiles/<world>/<zoom>/<x>_<z>.png` (512x512 each)
At max zoom, one pixel equals one block, so a tile covers 512 blocks per side
sqmap computes which tiles overlap the requested window, downloads them in
parallel, composites them into a canvas, then crops to the exact area
This just downloads the already generated pngs from squaremap as mentioned above,
so it wont make anything to the server aside eating a few kb/s of bandwidth
