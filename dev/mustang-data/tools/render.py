"""Splat the car cloud roughly the way the site draws it.

Usage: render.py cloud.npz yaw_deg pitch_deg png [count] [back]
yaw 0 looks at the nose; positive turns the car to show its right side.
back is how bright back faces stay (the page's uBack), default 1.
"""
import sys

import numpy as np
from PIL import Image

src, yaw, pitch, png = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
c = np.load(src)
pts, lum, nrm = c["pos"].astype(np.float64), c["lum"].astype(np.float64), c["norm"].astype(np.float64)
BACK = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
if len(sys.argv) > 5:
    keep = np.random.default_rng(0).choice(len(pts), int(sys.argv[5]), replace=False)
    pts, lum, nrm = pts[keep], lum[keep], nrm[keep]

pts -= (pts.max(0) + pts.min(0)) / 2
pts /= np.abs(pts).max()


def view(v):
    cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw))
    x, y, z = v[:, 0] * cy + v[:, 2] * sy, v[:, 1], -v[:, 0] * sy + v[:, 2] * cy
    cp, sp = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    return x, y * cp - z * sp, y * sp + z * cp  # z: towards the viewer


x, up, depth = view(pts)
facing = view(nrm)[2]
lum = lum * (BACK + (1 - BACK) * np.clip(facing * 3 + 0.5, 0, 1))
W, H = 1200, 800
scale = 520 / (1 - depth * 0.12)
px, py = W / 2 + x * scale, H / 2 - up * scale

img = np.zeros((H, W))
xi, yi = np.round(px).astype(int), np.round(py).astype(int)
ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
np.add.at(img, (yi[ok], xi[ok]), lum[ok])
k = np.array([0.2, 0.6, 0.2])
img = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, img)
img = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 0, img) * 1.4
img = 1 - np.exp(-img)
bg, fg = np.array([3, 7, 18]), np.array([235, 225, 255])
Image.fromarray((bg + img[..., None] * (fg - bg)).clip(0, 255).astype(np.uint8)).save(png)
print("saved", png)
