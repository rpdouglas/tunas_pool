#!/usr/bin/env bash
# Rebuild the web artwork from the originals in brand/originals/ (docs/BRAND_ASSETS.md).
# Needs ImageMagick (convert) and python3 with pillow, numpy and scipy:  pip install pillow numpy scipy
# Step 1 cuts the painted-in checkerboard out of each original. Step 2 writes the sized files.
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
for f in wordmark-tunas-pick-em badge-tuna-mascot-weekly-pool; do
  python3 scripts/brand/cutout.py "brand/originals/$f.png" "$tmp/$f.png"
done
# The helmet also has checkerboard showing through the facemask.
python3 scripts/brand/cutout.py brand/originals/helmet-pawn-shop-2na.png "$tmp/helmet-pawn-shop-2na.png" --holes
mkdir -p src/assets/brand
convert "$tmp/wordmark-tunas-pick-em.png"          -trim +repage -resize 720x -quality 88 src/assets/brand/wordmark.webp
convert "$tmp/badge-tuna-mascot-weekly-pool.png"   -trim +repage -resize 640x -quality 88 src/assets/brand/tuna-badge.webp
convert "$tmp/helmet-pawn-shop-2na.png"            -trim +repage -resize 640x -quality 88 src/assets/brand/pawn-shop-helmet.webp
B="$tmp/badge-tuna-mascot-weekly-pool.png"
convert "$B" -trim +repage -resize 32x32 public/favicon-32.png
convert "$B" -trim +repage -resize 64x64 public/favicon-64.png
convert "$B" -trim +repage -resize 150x150 -background '#241773' -gravity center -extent 180x180 -flatten public/apple-touch-icon.png
# Share image 1200x630: wordmark left, badge right, on the purple-to-black backdrop (#241773 family).
convert -size 1200x630 gradient:'#3b2aa0-#0d0a22' "$tmp/bg.png"
convert "$tmp/wordmark-tunas-pick-em.png" -trim +repage -resize 640x "$tmp/wm.png"
convert "$B" -trim +repage -resize 470x "$tmp/bd.png"
convert "$tmp/bg.png" "$tmp/wm.png" -gravity west -geometry +50+0 -composite "$tmp/bd.png" -gravity east -geometry +55+0 -composite -depth 8 -strip public/og-image.png
echo "Done. Review the images before committing."
