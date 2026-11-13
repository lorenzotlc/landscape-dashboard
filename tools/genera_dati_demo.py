#!/usr/bin/env python3
"""Genera dati FITTIZI (area di Potenza) per provare la dashboard, poi lancia prepara_dati.py.
Simula 8 variabili di paesaggio e una classificazione a 9 cluster (k-means come surrogato della SuperSOM)."""
import json, os, subprocess, sys
import numpy as np
import rasterio
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter

here = os.path.dirname(os.path.abspath(__file__))
outdir = os.path.join(here, "demo_input"); os.makedirs(outdir, exist_ok=True)
rng = np.random.default_rng(42)
W, H, px = 160, 110, 0.002          # ~170 m per cella
x0, y0 = 15.68, 40.76                # angolo NW
T = from_origin(x0, y0, px, px)

def field(s, sig):
    f = gaussian_filter(rng.normal(size=(H, W)), sig); return (f - f.mean()) / f.std()

base_alt = field(1, 18); rough = field(2, 4)
yy, xx = np.mgrid[0:H, 0:W]
urban = np.exp(-(((xx - 75) / 14) ** 2 + ((yy - 50) / 10) ** 2)) + 0.5 * np.exp(-(((xx - 125) / 8) ** 2 + ((yy - 80) / 6) ** 2))
quota = 820 + 230 * base_alt + 40 * rough - 120 * urban
pend = np.clip(np.hypot(*np.gradient(quota)) * 0.9 + 3 * field(3, 3), 0, None)
edif = np.clip(100 * urban + 6 * field(4, 3), 0, 100)
ndvi = np.clip(0.55 - 0.4 * urban + 0.08 * field(5, 6) + 0.0002 * (quota - 800), 0.05, 0.9)
strade = np.clip(900 * (1 - urban) + 250 * field(6, 5), 10, None)
shannon = np.clip(1.1 + 0.35 * field(7, 7) + 0.4 * np.exp(-((urban - 0.3) ** 2) / 0.05), 0.1, 2.2)
apert = np.clip(0.6 + 0.0004 * (quota - 820) - 0.3 * urban - 0.01 * pend + 0.06 * field(8, 4), 0.05, 1)
framm = np.clip(40 + 25 * shannon + 15 * field(9, 5), 0, None)
vars_ = [ndvi, quota, pend, edif, strade, shannon, apert, framm]
nomi = ["NDVI medio", "Quota", "Pendenza", "Densità edificato", "Distanza da strade",
        "Diversità uso suolo (Shannon)", "Apertura visiva (sky view)", "Frammentazione (edge density)"]
unita = ["", "m", "°", "%", "m", "H'", "0-1", "m/ha"]

X = np.stack([(v - v.mean()) / v.std() for v in vars_], -1).reshape(-1, len(vars_))
k = 9; C = X[rng.choice(len(X), k, replace=False)]
for _ in range(60):
    lab = np.argmin(((X[:, None] - C[None]) ** 2).sum(-1), 1)
    C = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
cl = (lab + 1).reshape(H, W).astype("uint8")
cl[(xx - 5) ** 2 / 25 + (yy - 105) ** 2 / 36 < 1] = 0   # un po' di nodata ai bordi

prof = dict(driver="GTiff", width=W, height=H, crs="EPSG:4326", transform=T)
with rasterio.open(os.path.join(outdir, "cluster_supersom.tif"), "w", count=1, dtype="uint8", nodata=0, **prof) as d:
    d.write(cl, 1)
with rasterio.open(os.path.join(outdir, "variabili.tif"), "w", count=len(vars_), dtype="float32", **prof) as d:
    for i, v in enumerate(vars_):
        d.write(v.astype("float32"), i + 1); d.set_band_description(i + 1, nomi[i])

subprocess.check_call([sys.executable, os.path.join(here, "prepara_dati.py"),
                       "--cluster", os.path.join(outdir, "cluster_supersom.tif"),
                       "--variabili", os.path.join(outdir, "variabili.tif"),
                       "--unita", ",".join(unita), "--out", os.path.join(here, "..", "data")])
