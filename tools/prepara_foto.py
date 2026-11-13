#!/usr/bin/env python3
"""
Prepara le foto reali geotaggate per la dashboard.

Assegna a ogni foto il cluster della cella del raster in cui è stata scattata e crea copie leggere per il web.
Le foto originali non vengono mai modificate. Due sorgenti possibili (anche insieme):

  --qgis2web progetto.zip   esportazione qgis2web (zip o cartella): usa i layer di punti con il campo "photo"
                            (posizioni dal layer, immagini dalla cartella images/ del progetto)
  --cartella /percorso      cartella di foto: posizioni lette dagli EXIF GPS (ripetibile)

Uso:
  python3 tools/prepara_foto.py --qgis2web dati_reali/qgis2web_....zip
Opzioni:
  --raster    raster dei cluster (default: data/cluster.tif, già preparato da prepara_dati.py)
  --out       cartella dei dati della dashboard (default: data)
  --lato-mini lato lungo delle miniature in px (default 480)
  --lato      lato lungo delle copie per l'ingrandimento in px (default 2000)

Correzioni manuali (facoltative): data/foto_correzioni.json
  {"spostamenti": [{"foto": ["nome1", "nome2"], "nord_m": 250, "est_m": 0, "nota": "perché"}],
   "escluse": ["android_20260529_135737"]}          <- foto da togliere (anche dalla mappa)
  Lo spostamento è in metri nel sistema del raster (es. EPSG:3035: nord = asse y della griglia). La posizione
  originale resta registrata in foto.geojson (posizione_originale) e la foto viene segnata come spostata.

Output:
  data/foto/<nome>.jpg, data/foto/<nome>_mini.jpg   copie ridotte, già ruotate secondo l'EXIF
  data/foto.geojson                                 un punto per foto (EPSG:4326) con cluster, data, quota, file
Le foto senza GPS vengono elencate e saltate. Rilanciando, le copie già fatte non vengono rigenerate.
Dipendenze: numpy, rasterio, Pillow
"""
import argparse, io, json, os, re, zipfile
from datetime import datetime
import numpy as np
import rasterio
from rasterio.warp import transform
from PIL import Image, ImageOps

ESTENSIONI = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic")


def leggi_exif(path):
    im = Image.open(path)
    ex = im.getexif()
    g = ex.get_ifd(0x8825)
    if not g or 2 not in g or 4 not in g:
        return None
    dms = lambda v: float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
    lat = dms(g[2]) * (-1 if g.get(1) == "S" else 1)
    lon = dms(g[4]) * (-1 if g.get(3) == "W" else 1)
    quota = float(g[6]) if 6 in g else None
    direzione = float(g[17]) if 17 in g else None
    quando = ex.get_ifd(0x8769).get(36867) or ex.get(306)
    if not quando:
        m = re.search(r"(20\d{6})_(\d{6})", os.path.basename(path))
        if m:
            quando = f"{m[1][:4]}:{m[1][4:6]}:{m[1][6:]} {m[2][:2]}:{m[2][2:4]}:{m[2][4:]}"
    try:
        quando = datetime.strptime(quando, "%Y:%m:%d %H:%M:%S").isoformat(timespec="minutes") if quando else None
    except ValueError:
        pass
    return {"lon": lon, "lat": lat, "quota": quota, "direzione": direzione, "data": quando}


def riduci(apri, uscite, mtime=None):
    """uscite = [(percorso, lato_lungo), ...]; l'immagine viene letta una volta sola."""
    da_fare = [(d, l) for d, l in uscite if not (os.path.exists(d) and (mtime is None or os.path.getmtime(d) >= mtime))]
    if not da_fare:
        return
    with apri() as fh:
        im = ImageOps.exif_transpose(Image.open(fh)).convert("RGB")
    for d, l in sorted(da_fare, key=lambda x: -x[1]):
        im.thumbnail((l, l), Image.LANCZOS)
        im.save(d, "JPEG", quality=84, optimize=True, progressive=True)


def da_qgis2web(percorso):
    """Punti con campo 'photo' dai layer data/*.js di un'esportazione qgis2web (zip o cartella)."""
    if zipfile.is_zipfile(percorso):
        z = zipfile.ZipFile(percorso)
        nomi = [n for n in z.namelist() if not n.startswith("__MACOSX")]
        leggi = lambda n: z.read(n)
        apri_f = lambda n: (lambda: z.open(n))
    else:
        nomi = [os.path.relpath(os.path.join(d, f), percorso).replace(os.sep, "/")
                for d, _, fs in os.walk(percorso) for f in fs]
        leggi = lambda n: open(os.path.join(percorso, n), "rb").read()
        apri_f = lambda n: (lambda: open(os.path.join(percorso, n), "rb"))
    per_nome = {n.rsplit("/", 1)[-1]: n for n in nomi if "/images/" in "/" + n}
    voci, mancanti = [], []
    for n in nomi:
        if not (n.endswith(".js") and "/data/" in "/" + n):
            continue
        t = leggi(n).decode("utf-8")
        if '"photo"' not in t:
            continue
        gj = json.loads(t[t.index("{"):t.rstrip().rstrip(";").rindex("}") + 1])
        for f in gj["features"]:
            pr, g = f["properties"], f["geometry"]
            if not pr.get("photo") or not g:
                continue
            img = per_nome.get(re.sub(r"[/\\:]", "_", pr["photo"]))  # qgis2web: "/a/b/c.jpg" -> "_a_b_c.jpg"
            if not img:
                mancanti.append(pr["photo"]); continue
            ts = pr.get("timestamp")
            try:
                ts = datetime.strptime(ts[:19], "%Y/%m/%d %H:%M:%S").isoformat(timespec="minutes") if ts else None
            except ValueError:
                pass
            voci.append({"lon": g["coordinates"][0], "lat": g["coordinates"][1], "quota": pr.get("altitude"),
                         "direzione": pr.get("direction"), "data": ts, "apri": apri_f(img), "mtime": None,
                         "nome": re.sub(r"[^\w-]+", "_", "_".join(re.split(r"[/\\]", os.path.splitext(pr["photo"])[0])[-2:])),
                         "origine": pr["photo"], "layer": gj.get("name", "")})
        print(f"qgis2web: layer '{gj.get('name')}' -> {len(gj['features'])} punti")
    if mancanti:
        print(f"ATTENZIONE: {len(mancanti)} foto del layer non trovate in images/: {mancanti[:5]}")
    return voci


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    ap.add_argument("--cartella", action="append", default=[])
    ap.add_argument("--qgis2web", action="append", default=[])
    ap.add_argument("--raster", default=os.path.join(base, "data", "cluster.tif"))
    ap.add_argument("--out", default=os.path.join(base, "data"))
    ap.add_argument("--lato-mini", type=int, default=480)
    ap.add_argument("--lato", type=int, default=2000)
    a = ap.parse_args()
    if not a.cartella and not a.qgis2web:
        raise SystemExit("Indica almeno una sorgente: --qgis2web progetto.zip oppure --cartella /percorso/foto")
    out_foto = os.path.join(a.out, "foto"); os.makedirs(out_foto, exist_ok=True)

    voci, senza_gps = [], []
    for q in a.qgis2web:
        voci += da_qgis2web(q)
    for c in a.cartella:
        for f in sorted(os.listdir(c)):
            p = os.path.join(c, f)
            if not f.lower().endswith(ESTENSIONI) or f.startswith("."):
                continue
            try:
                e = leggi_exif(p)
            except Exception as err:
                senza_gps.append(f"{f} (illeggibile: {err})"); continue
            if not e:
                senza_gps.append(f); continue
            e.update({"apri": (lambda p=p: open(p, "rb")), "mtime": os.path.getmtime(p),
                      "nome": os.path.splitext(f)[0], "origine": p, "layer": ""})
            voci.append(e)
    # nomi unici
    visti = {}
    for v in voci:
        k = v["nome"]; visti[k] = visti.get(k, 0) + 1
        if visti[k] > 1:
            v["nome"] = f"{k}_{visti[k]}"

    corr_path = os.path.join(a.out, "foto_correzioni.json")
    correzioni, escluse = {}, set()
    if os.path.exists(corr_path):
        cj = json.load(open(corr_path, encoding="utf-8"))
        for sp in cj.get("spostamenti", []):
            for n in sp["foto"]:
                correzioni[n] = sp
        # "escluse": foto da togliere dalla dashboard (nome con o senza .jpg)
        escluse = {os.path.splitext(n)[0] for n in cj.get("escluse", [])}
    if escluse:
        tolte = [v["nome"] for v in voci if v["nome"] in escluse or v["nome"].split("_", 1)[-1] in escluse]
        voci = [v for v in voci if v["nome"] not in tolte]
        for n in tolte:   # elimina anche le copie già generate
            for suf in (".jpg", "_mini.jpg"):
                try: os.remove(os.path.join(out_foto, n + suf))
                except OSError: pass
        print(f"Foto escluse: {len(tolte)} {tolte}")
        mancanti = escluse - {n for n in tolte} - {n.split('_', 1)[-1] for n in tolte}
        if mancanti:
            print(f"ATTENZIONE: foto da escludere non trovate: {sorted(mancanti)}")

    with rasterio.open(a.raster) as R:
        dati = R.read(1).astype("float64")
        xs, ys = transform("EPSG:4326", R.crs, [v["lon"] for v in voci], [v["lat"] for v in voci])
        xs, ys = list(xs), list(ys)
        usate = set()
        for i, v in enumerate(voci):
            sp = correzioni.get(v["nome"])
            if not sp:
                continue
            usate.add(v["nome"])
            v["posizione_originale"] = [round(v["lon"], 6), round(v["lat"], 6)]
            v["nota_spostamento"] = sp.get("nota", "posizione corretta manualmente")
            xs[i] += float(sp.get("est_m", 0)); ys[i] += float(sp.get("nord_m", 0))
            lo, la = transform(R.crs, "EPSG:4326", [xs[i]], [ys[i]])
            v["lon"], v["lat"] = lo[0], la[0]
        if correzioni:
            print(f"Correzioni di posizione applicate a {len(usate)} foto")
            non_trovate = set(correzioni) - usate
            if non_trovate:
                print(f"ATTENZIONE: foto in foto_correzioni.json non trovate: {sorted(non_trovate)}")
        for v, x, y in zip(voci, xs, ys):
            r, c = R.index(x, y)
            val = dati[r, c] if 0 <= r < R.height and 0 <= c < R.width else np.nan
            v["cluster"] = int(round(val)) if np.isfinite(val) and val > 0 and val != R.nodata else None

    feats = []
    for i, v in enumerate(voci, 1):
        nome = v["nome"]
        try:
            riduci(v["apri"], [(os.path.join(out_foto, nome + ".jpg"), a.lato),
                               (os.path.join(out_foto, nome + "_mini.jpg"), a.lato_mini)], v["mtime"])
        except Exception as err:
            print(f"  {nome}: ERRORE nella lettura dell'immagine ({err}), saltata"); continue
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(v["lon"], 6), round(v["lat"], 6)]},
                      "properties": {"id": i, "nome": nome, "file": f"data/foto/{nome}.jpg", "mini": f"data/foto/{nome}_mini.jpg",
                                     "cluster": v["cluster"], "data": v["data"], "quota": v["quota"], "direzione": v["direzione"]}})  # il percorso locale ("origine") non viene pubblicato
        if v.get("posizione_originale"):
            feats[-1]["properties"].update({"spostata": True, "posizione_originale": v["posizione_originale"],
                                            "nota_spostamento": v["nota_spostamento"]})
        if i % 10 == 0 or i == len(voci):
            print(f"  {i}/{len(voci)} foto pronte", flush=True)
    with open(os.path.join(a.out, "foto.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, indent=1)

    from collections import Counter
    cnt = Counter(f["properties"]["cluster"] for f in feats)
    print(f"OK: {len(feats)} foto -> data/foto.geojson; per cluster: " +
          ", ".join(f"{k if k else 'fuori'}={n}" for k, n in sorted(cnt.items(), key=lambda kv: (kv[0] is None, kv[0] or 0))))
    if senza_gps:
        print(f"Senza coordinate GPS (saltate): {', '.join(senza_gps)}")


if __name__ == "__main__":
    main()
