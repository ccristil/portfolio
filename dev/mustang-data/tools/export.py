"""cloud.npz -> the compact binary the dev page loads. Same layout as
engine-data/coyote.bin, so one loader reads both.

Layout (little endian): uint32 N, int16 pos[N*3] (shape space * 32767),
int8 normal[N*3] (* 127), uint8 lum[N] (* 255), uint8 part[N].
Shape space is three.js style: x right, y up, z towards the camera, with the
car's nose facing the camera. Centred, longest side = 1 (the car is longer
than it is wide or tall, so x and y stay well inside ±0.5). Points are
shuffled, so any prefix is a fair sample (phones load fewer).

Parts: 0 body, 1 glass, 2 wheels, 3 lights, 4 cabin, 6 underbody,
7 grilles, 8 hood, 9 bay (only seen with the hood up). 5 is unused (it was
the stock engine).

Also writes out.json next to it, in the same shape space: the hood hinge
(y, z) and how far it opens, the axles' z (where the springs push), the box
the stock engine filled (where the Coyote mounts) and metres per unit.

Usage: export.py cloud.npz out.bin
"""
import json
import sys

import numpy as np

c = np.load(sys.argv[1])
rng = np.random.default_rng(3)
order = rng.permutation(len(c["pos"]))
pos, nrm = c["pos"][order].astype(np.float64), c["norm"][order].astype(np.float64)
# The GLB is already x across, y up, z towards the nose.
lo, hi = pos.min(0), pos.max(0)
mid, size = (lo + hi) / 2, (hi - lo).max()
pos = (pos - mid) / size
assert np.abs(pos).max() <= 1
with open(sys.argv[2], "wb") as f:
    f.write(np.uint32(len(pos)).tobytes())
    f.write(np.round(pos * 32767).astype("<i2").tobytes())
    f.write(np.round(np.clip(nrm, -1, 1) * 127).astype("i1").tobytes())
    f.write(np.round(np.clip(c["lum"][order], 0, 1) * 255).astype("u1").tobytes())
    f.write(c["part"][order].astype("u1").tobytes())
print("wrote", sys.argv[2], len(pos), "points, extent", (pos.max(0) - pos.min(0)).round(3))

wheels = pos[c["part"][order] == 2]
box = (c["engine_box"] - mid) / size
meta = {
    "metresPerUnit": round(float(size), 4),
    "hinge": {"y": round(float((c["hinge"][0] - mid[1]) / size), 5), "z": round(float((c["hinge"][1] - mid[2]) / size), 5)},
    "openDeg": float(c["open_deg"]),
    "axles": {"front": round(float(wheels[wheels[:, 2] > 0, 2].mean()), 5),
              "rear": round(float(wheels[wheels[:, 2] < 0, 2].mean()), 5)},
    "engineBox": {"min": box[0].round(5).tolist(), "max": box[1].round(5).tolist()},
}
json.dump(meta, open(sys.argv[2].removesuffix(".bin") + ".json", "w"), indent=1)
print(json.dumps(meta))
