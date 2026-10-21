"""Mustang GLB -> a particle cloud, the same way engine-data/tools/sample.py
does the Coyote: only surfaces you can see from outside get points, and
sharp creases (panel lines, window frames, light outlines) get extra,
brighter points.

Glass is left out of the depth test so the cabin still shows through the
windows, faintly. Badges are skipped (no trademarks in the cloud).

The hood is its own part so the page can swing it on its hinge. Visibility
is tested twice, hood shut and hood open, so the hood's underside and the
engine bay get points too. The model's stock engine is dropped (the Coyote
goes there); its bounding box is kept as the place to mount it.

Usage: sample.py model.glb count edge_share cloud.npz
Writes pos (N,3, model frame, metres, hood shut), norm (N,3), lum (N),
part (N), kind (N: 0 surface, 1 edge), plus hinge (y, z), open_deg and
engine_box (2,3). Model frame: x across, y up, z towards the front.
"""
import sys
import time

import numpy as np
import trimesh
from scipy.spatial import cKDTree

src, COUNT, EDGE_SHARE, dst = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
rng = np.random.default_rng(7)
t0 = time.time()

# Part ids travel with the points so the page can move groups on their own.
BODY, GLASS, WHEELS, LIGHTS, CABIN, _, UNDER, GRILLE, HOOD, BAY = range(10)
# Weights are shares of points per m² of surface and per m of crease; light
# is brightness. Window and light outlines carry most of the read, so their
# creases get the most points.
PARTS = {
    # material: (part id, surface weight, edge weight, light)
    "Paint": (BODY, 1.0, 1.0, 1.0),
    "Coloured": (BODY, 0.9, 0.8, 0.95),
    "ColouredMtl": (BODY, 0.9, 0.8, 0.9),
    "paint1Mtl": (BODY, 0.9, 0.8, 0.9),
    "wire_141007058": (BODY, 0.8, 0.8, 0.9),
    "TexturedA": (BODY, 0.8, 0.8, 0.85),
    "Base": (UNDER, 0.5, 0.4, 0.6),
    "GlassMtl": (GLASS, 0.12, 3.0, 0.8),
    "GlassDarkMtl": (GLASS, 0.12, 3.0, 0.8),
    "GlassRedMtl": (LIGHTS, 1.2, 2.5, 1.0),
    "Lights": (LIGHTS, 1.4, 2.5, 1.0),
    "Wheel1A": (WHEELS, 1.6, 0.9, 1.0),
    "Wheel2A": (WHEELS, 1.0, 0.5, 0.75),
    "Grille1A": (GRILLE, 0.9, 1.5, 0.8),
    "Grille2A": (GRILLE, 0.9, 1.5, 0.8),
    "Grille3A": (GRILLE, 0.9, 1.5, 0.8),
    "Grille5A": (GRILLE, 0.9, 1.5, 0.8),
    "interior": (CABIN, 0.3, 0.15, 0.5),
    "interior_o": (CABIN, 0.3, 0.15, 0.5),
    "InteriorTillingColourZoneA": (CABIN, 0.3, 0.15, 0.5),
    "color1_o": (CABIN, 0.3, 0.15, 0.5),
    "color2_o": (CABIN, 0.3, 0.15, 0.5),
    "engine": (BAY, 0.45, 0.4, 0.6),
    "engine_o": (BAY, 0.45, 0.4, 0.6),
}
PART_W = {HOOD: (1.1, 1.3, 1.0), BAY: (0.8, 0.6, 0.65)}  # parts no material maps to
SKIP = {"BadgeA", "CalliperBadgeBMtl", "Grille4A"}  # badges and the plate
# The stock engine: whatever lies wholly inside this box (metres), mostly
# the "engine" mesh, plus its hoses and intake tubing, which snake out of the
# box across the bay.
ENGINE_BOX = np.array([[-0.4, 0.0, 0.88], [0.4, 0.9, 1.56]])
STOCK_PLUMBING = {"Grille2A"}
OPEN_DEG = 52  # how far the hood swings up

scene = trimesh.load(src)
pieces = []  # (mesh, part id)
for node in scene.graph.nodes_geometry:
    T, gname = scene.graph[node]
    g = scene.geometry[gname]
    mat = g.visual.material.name
    if mat in SKIP:
        continue
    m = trimesh.Trimesh(trimesh.transform_points(g.vertices, T), g.faces, process=False)
    m.merge_vertices(merge_tex=True, merge_norm=True)
    for q in m.split(only_watertight=False):
        pieces.append((q, PARTS[mat][0], mat))

# The hood is the big painted panel ahead of the windscreen; the stripe and
# vents lying on it go with it.
hood = max((q for q, _, mat in pieces if mat == "Paint" and q.bounds[0, 2] > 0.5 and q.bounds[1, 1] < 0.95),
           key=lambda q: q.area)
on_hood = cKDTree(hood.sample(200_000, seed=1))
# A piece rides on the hood if it's made of something a hood is made of,
# stays within its outline (the stripe runs right to its edges) and every
# vertex lies on the panel. Bay parts tuck in within millimetres under it,
# so only these materials count.
HOOD_SKIN = {"Paint", "Coloured", "wire_141007058", "Grille3A"}
STRIPE_X = 0.22  # m either side of the centreline
RECESS = 0.12  # m; how deep the recessed centre of the hood goes, with room
hlo, hhi = hood.bounds[0] - 0.01, hood.bounds[1] + 0.01
engine_lo, engine_hi = np.full(3, np.inf), np.full(3, -np.inf)
kept = []
for q, pid, mat in pieces:
    b = q.bounds
    if q is hood:
        pid = HOOD
    elif (b[0] >= ENGINE_BOX[0]).all() and (b[1] <= ENGINE_BOX[1]).all():
        engine_lo, engine_hi = np.minimum(engine_lo, b[0]), np.maximum(engine_hi, b[1])
        continue
    elif mat in STOCK_PLUMBING:
        continue
    elif mat in HOOD_SKIN and (b[0, [0, 2]] > hlo[[0, 2]]).all() and (b[1, [0, 2]] < hhi[[0, 2]]).all():
        dist = on_hood.query(q.vertices)[0]
        band = np.abs(q.triangles_center[:, 0]) < STRIPE_X
        # Down the middle the hood is recessed: its floor sits up to ~10 cm
        # under the skin and belongs to the hood too.
        near = (dist < 0.02)[q.faces].all(1) | (band & (dist < RECESS)[q.faces].all(1))
        if near.all():
            pid = HOOD
        else:
            # The stripe also comes with a copy of itself sunk ~17 cm into the
            # bay, which would be left lying there when the hood opens. Keep
            # what belongs to the hood; drop the rest of the stripe band.
            stray = ~near & band
            if stray.any():
                if near.any():
                    kept.append((q.submesh([np.flatnonzero(near)], append=True), HOOD))
                rest = np.flatnonzero(~near & ~stray)
                if len(rest):
                    kept.append((q.submesh([rest], append=True), pid))
                continue
    kept.append((q, pid))

# Hinge: just under the hood's rear edge.
rear = hood.vertices[hood.vertices[:, 2] < hood.bounds[0, 2] + 0.03]
hinge = np.array([rear[:, 1].max() - 0.01, hood.bounds[0, 2] + 0.02])  # y, z


def open_hood(p, deg=OPEN_DEG, about=hinge):
    """Rotate (N,3) points about the hinge, front edge up."""
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    q = p.copy()
    dy, dz = p[:, 1] - about[0], p[:, 2] - about[1]
    q[:, 1], q[:, 2] = about[0] + c * dy + s * dz, about[1] - s * dy + c * dz
    return q


tris, tri_part, edges, edge_part, edge_norm = [], [], [], [], []
for m, pid in kept:
    tris.append(m.triangles)
    tri_part.append(np.full(len(m.faces), pid))
    # Creases between faces, plus open boundaries (window and light edges).
    ang = m.face_adjacency_angles
    crease = m.face_adjacency_edges[ang > np.radians(32)]
    cn = m.face_normals[m.face_adjacency[ang > np.radians(32)]].sum(1)
    _, inv, cnt = np.unique(np.sort(m.edges, 1), axis=0, return_inverse=True, return_counts=True)
    open_ = m.edges[cnt[inv.ravel()] == 1]
    on = m.face_normals[m.edges_face[cnt[inv.ravel()] == 1]]
    e = np.concatenate([crease, open_])
    edges.append(m.vertices[e].reshape(-1, 2, 3))
    edge_part.append(np.full(len(e), pid))
    en = np.concatenate([cn, on]).reshape(-1, 3)
    edge_norm.append(en / np.maximum(np.linalg.norm(en, axis=1, keepdims=True), 1e-12))
tris, tri_part = np.concatenate(tris), np.concatenate(tri_part)
edges, edge_part, edge_norm = np.concatenate(edges), np.concatenate(edge_part), np.concatenate(edge_norm)
cr = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
area = np.linalg.norm(cr, axis=1) / 2
tnorm = cr / np.maximum(area[:, None] * 2, 1e-12)
elen = np.linalg.norm(edges[:, 1] - edges[:, 0], axis=1)
print(f"{len(tris)} tris, {len(edges)} crease segments, {elen.sum():.0f} m of edge, "
      f"hood {(tri_part == HOOD).sum()} tris, hinge y {hinge[0]:.3f} z {hinge[1]:.3f} ({time.time() - t0:.0f}s)", flush=True)

# --- dense candidates -----------------------------------------------------------
DENSE = 3_000_000
pick = rng.choice(len(tris), DENSE, p=area / area.sum())
r1, r2 = rng.random(DENSE), rng.random(DENSE)
s = np.sqrt(r1)
t = tris[pick]
spos = t[:, 0] * (1 - s)[:, None] + t[:, 1] * (s * (1 - r2))[:, None] + t[:, 2] * (s * r2)[:, None]
snorm, spart = tnorm[pick], tri_part[pick]
EDENSE = 600_000
pe = rng.choice(len(edges), EDENSE, p=elen / elen.sum())
u = rng.random(EDENSE)[:, None]
epos = edges[pe, 0] * (1 - u) + edges[pe, 1] * u
epart, enorm = edge_part[pe], edge_norm[pe]
pos = np.concatenate([spos, epos])
allpart = np.concatenate([spart, epart])

# --- visibility from many directions, hood shut and hood open ------------------
# Splat every candidate into a coarse depth buffer per direction; a point is
# seen if it's within TOL of the nearest occluder in its pixel.
PIX, TOL = 0.012, 0.02
centre = (pos.max(0) + pos.min(0)) / 2
occluder = allpart != GLASS
is_hood = allpart == HOOD
NDIR = 120
g = np.pi * (3 - np.sqrt(5))
dirs = []
for i in range(NDIR):
    y = 1 - 2 * (i + 0.5) / NDIR
    if y < -0.2:  # nobody looks at the car from underneath
        continue
    r = np.sqrt(1 - y * y)
    dirs.append((np.cos(g * i) * r, y, np.sin(g * i) * r))
dirs = np.array(dirs)


def visibility(p):
    rel = p - centre
    seen = np.zeros(len(p), np.int32)
    look = np.zeros((len(p), 3))  # sum of directions each point was seen from
    for d in dirs:
        a = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0])
        a /= np.linalg.norm(a)
        b = np.cross(d, a)
        pu = np.floor(rel @ a / PIX).astype(np.int64)
        pv = np.floor(rel @ b / PIX).astype(np.int64)
        depth = rel @ d  # larger = nearer the viewer
        pu -= pu.min()
        pv -= pv.min()
        nu, nv = pu.max() + 1, pv.max() + 1
        pix = pu * nv + pv
        front = np.full(nu * nv, -np.inf)
        np.maximum.at(front, pix[occluder], depth[occluder])
        # Fill pinholes: each pixel takes the nearest depth in its 3x3 block.
        f2 = front.reshape(nu, nv)
        pad = np.pad(f2, 1, constant_values=-np.inf)
        f2 = np.max([pad[i:i + nu, j:j + nv] for i in range(3) for j in range(3)], axis=0)
        hit = depth >= f2.ravel()[pix] - TOL
        seen += hit
        look[hit] += d
    return seen, look


seen_shut, look_shut = visibility(pos)
pos_open = pos.copy()
pos_open[is_hood] = open_hood(pos[is_hood])
seen_open, look_open = visibility(pos_open)
# The hood saw those directions while swung open; turn them back to its shut frame.
look_open[is_hood] = open_hood(look_open[is_hood], -OPEN_DEG, (0, 0))
vis = (seen_shut + seen_open) / (2 * len(dirs))
look = look_shut + look_open
# Whatever only shows with the hood up is the bay; the page hides it behind
# the hood while it's shut.
allpart[(seen_shut / len(dirs) < 0.02) & (seen_open / len(dirs) >= 0.02) & ~is_hood] = BAY
print(f"visibility over 2 x {len(dirs)} directions ({time.time() - t0:.0f}s)", flush=True)

# --- choose the final points ----------------------------------------------------
weight, eweight, light = np.zeros(10), np.zeros(10), np.zeros(10)
for pid, w_, ew, l_ in PARTS.values():
    weight[pid], eweight[pid], light[pid] = w_, ew, l_
for pid, (w_, ew, l_) in PART_W.items():
    weight[pid], eweight[pid], light[pid] = w_, ew, l_
ns = len(spos)
s_ok = np.flatnonzero(vis[:ns] > 0.02)
e_ok = np.flatnonzero(vis[ns:] > 0.02) + ns
n_edge = int(COUNT * EDGE_SHARE)
w = np.sqrt(vis[s_ok]) * weight[allpart[s_ok]]
chosen_s = rng.choice(s_ok, COUNT - n_edge, replace=False, p=w / w.sum())
we = eweight[allpart[e_ok]]
chosen_e = rng.choice(e_ok, n_edge, replace=False, p=we / we.sum())
idx = np.concatenate([chosen_s, chosen_e])
kind = np.r_[np.zeros(len(chosen_s), np.int8), np.ones(len(chosen_e), np.int8)]
part = allpart[idx]
norm = np.concatenate([snorm, enorm])[idx]
# The model's winding isn't reliable, so turn each normal to face the side
# it was seen from; the page dims points facing away from the camera.
flip = (norm * look[idx]).sum(1) < 0
norm[flip] *= -1
# Key light from above and in front.
key = np.array([0.3, 0.85, 0.45])
key /= np.linalg.norm(key)
lit = np.clip(norm[:len(chosen_s)] @ key * 0.6 + 0.4, 0, 1) ** 1.5
lum = np.r_[0.3 + 0.6 * lit * np.sqrt(vis[chosen_s]), 0.85 + 0.15 * np.sqrt(vis[chosen_e])] * light[part]
np.savez(dst, pos=pos[idx].astype(np.float32), norm=norm.astype(np.float32), lum=lum.astype(np.float32),
         part=part.astype(np.int16), kind=kind, hinge=hinge, open_deg=OPEN_DEG,
         engine_box=np.stack([engine_lo, engine_hi]))
print(f"saved {dst}: {len(chosen_s)} surface + {len(chosen_e)} edge, of {len(s_ok)} / {len(e_ok)} visible; "
      f"per part {np.bincount(part, minlength=10).tolist()}; engine box {np.round([engine_lo, engine_hi], 2).tolist()} "
      f"({time.time() - t0:.0f}s)")
