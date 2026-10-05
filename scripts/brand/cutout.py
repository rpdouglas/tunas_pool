"""Cut the checkerboard "transparency" painted into a flattened logo and write a real RGBA PNG.

usage: cutout.py in.png out.png [--holes]
Background = light, near-neutral pixels connected to the image edge. With --holes, enclosed patches (the
gaps in a facemask) are removed too when they contain the checkerboard's mid-grey squares. Use it
only where needed: it also catches silver or white artwork (the wordmark's PICK EM lettering). See docs/BRAND_ASSETS.md.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src, dst = sys.argv[1], sys.argv[2]
holes = "--holes" in sys.argv[3:]
im = np.asarray(Image.open(src).convert("RGB")).astype(int)
mx, mn = im.max(2), im.min(2)
light_neutral = (mn > 175) & ((mx - mn) < 14)
lab, n = ndi.label(light_neutral)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
remove = np.isin(lab, list(edge))

mid_grey = (mn >= 200) & (mn <= 220) & ((mx - mn) < 10)  # the darker checker squares
sizes = ndi.sum(light_neutral, lab, range(1, n + 1))
for i in range(1, n + 1) if holes else []:
    if i in edge or sizes[i - 1] < 400:
        continue
    patch = lab == i
    if mid_grey[patch].mean() > 0.12:
        remove |= patch

# Eat the 2px light halo around the artwork, then soften the edge.
remove |= ndi.binary_dilation(remove, iterations=2) & (mn > 120)
alpha = ndi.gaussian_filter(np.where(remove, 0, 255).astype(float), 0.8)
alpha = np.clip((alpha - 40) * 255 / 175, 0, 255).astype(np.uint8)
Image.fromarray(np.dstack([im.astype(np.uint8), alpha]), "RGBA").save(dst)
