#!/usr/bin/env python3
"""
Prepara i dati per il Visualizzatore ipotesi visuali del paesaggio.

Input:
  --cluster   (obbligatorio, tranne con --statistiche) GeoTIFF a banda singola con il codice del cluster SuperSOM per cella
              (interi >= 1; 0 o il nodata del file = nessun dato)
  Variabili statistiche (quelle dei boxplot), in UNO dei tre formati:
  --statistiche CSV con le statistiche GIÀ CALCOLATE per cluster e variabile (formato consigliato, es.
              boxplot_stats_complete_k6.csv). Una riga per coppia cluster/variabile; colonne usate:
                cluster, variable, n, min, q1, median, q3, max, lower_whisker, upper_whisker,
                n_outliers_below, n_outliers_above   (le altre vengono ignorate)
              I valori sono disegnati così come sono (es. già standardizzati).
              Nomi leggibili, gruppi e unità delle variabili: data/etichette_variabili.json
              (creato al primo lancio se non esiste, poi modificabile a mano: non viene sovrascritto).
  --csv       tabella CSV con una riga per cella. Colonne riconosciute:
                cluster  codice del cluster della cella (nome colonna: --col-cluster, default "cluster")
                x, y     coordinate del centro cella nel CRS del raster, es. EPSG:3035 (--col-x / --col-y);
                         servono se manca la colonna cluster: il cluster viene letto dal raster
                tutte le altre colonne numeriche = variabili (oppure solo quelle elencate in --colonne)
              Separatore ( , ; tab ) e virgola decimale riconosciuti in automatico.
  --variabili GeoTIFF multibanda con le variabili (stessa griglia del raster dei cluster);
              i nomi delle bande vengono dalle descrizioni del file oppure da --nomi.
  --nomi      (opzionale) nomi delle variabili da mostrare, separati da virgola, nell'ordine di colonne/bande
  --colonne   (opzionale, CSV) colonne da usare come variabili, separate da virgola, nell'ordine voluto
  --unita     (opzionale) unità di misura, separate da virgola
  --out       cartella di output (default: ../data)
  --confine   (opzionale) GeoJSON del confine dell'area di studio in qualsiasi sistema di riferimento:
              viene riproiettato in EPSG:4326 e salvato come area_studio.geojson
  --wgs84     (opzionale) riproietta il raster dei cluster in EPSG:4326 invece di mantenerne la proiezione
  --confine-crs (opzionale) EPSG del confine se il file non lo dichiara (es. EPSG:32633)

Output (nella cartella --out):
  cluster.tif                raster dei cluster NELLA SUA PROIEZIONE ORIGINALE (es. EPSG:3035), senza ricampionamento,
                             convertito in uint8/uint16 con nodata=0 e compresso. Con --wgs84 viene invece
                             riproiettato in EPSG:4326 (vicino più prossimo).
  statistiche_cluster.json   quartili, baffi e outlier per variabile e per cluster + distribuzione globale
  etichette_variabili.json   (solo con --statistiche) nomi leggibili/gruppi/unità delle variabili -- NON sovrascritto
  cluster.json               elenco cluster (id, nome, colore, n. celle) -- NON sovrascritto se esiste già,
                             così i nomi e i colori che hai personalizzato restano

Dipendenze: numpy, rasterio
"""
import argparse, csv, io, json, os, re
import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling

PALETTE = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1",
           "#FF9DA7", "#9C755F", "#BAB0AC", "#2F4B7C", "#A05195", "#D45087", "#665191",
           "#FFA600", "#003F5C"]


def five_numbers(v, max_outliers=40):
    v = v[np.isfinite(v)]
    if v.size == 0:
        return None
    q1, med, q3 = np.percentile(v, [25, 50, 75])
    iqr = q3 - q1
    lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    inside = v[(v >= lo_f) & (v <= hi_f)]
    wlo, whi = (inside.min(), inside.max()) if inside.size else (q1, q3)
    out = v[(v < lo_f) | (v > hi_f)]
    if out.size > max_outliers:  # campiona gli outlier per tenere leggero il JSON
        out = np.random.default_rng(0).choice(out, max_outliers, replace=False)
    r = lambda x: float(round(float(x), 4))
    return {"n": int(v.size), "min": r(v.min()), "max": r(v.max()), "media": r(v.mean()), "ds": r(v.std()),
            "q1": r(q1), "mediana": r(med), "q3": r(q3), "baffo_inf": r(wlo), "baffo_sup": r(whi),
            "outlier": [r(x) for x in sorted(out)]}


def leggi_codici(src):
    """Codici dei cluster come interi, 0 = nessun dato (gestisce nodata numerico e NaN dei raster float)."""
    d = src.read(1).astype("float64")
    vuoto = ~np.isfinite(d)
    if src.nodata is not None and np.isfinite(src.nodata):
        vuoto |= d == src.nodata
    d[vuoto] = 0
    return np.rint(d).astype(np.int64)


EPSG_DASHBOARD = {4326, 3857, 3035, 25832, 25833, 32632, 32633, 32634, 6707, 6708}


def prepara_raster(src_path, dst_path, wgs84=False):
    with rasterio.open(src_path) as src:
        data = leggi_codici(src)
        dtype = "uint8" if data.max() < 255 else "uint16"
        data = data.astype(dtype)
        epsg = src.crs.to_epsg() if src.crs else None
        if not wgs84 or epsg == 4326:
            crs, transform, w, h, out = src.crs, src.transform, src.width, src.height, data
        else:
            transform, w, h = calculate_default_transform(src.crs, "EPSG:4326", src.width, src.height, *src.bounds)
            out = np.zeros((h, w), dtype=dtype)
            reproject(data, out, src_transform=src.transform, src_crs=src.crs, dst_transform=transform,
                      dst_crs="EPSG:4326", resampling=Resampling.nearest, src_nodata=0, dst_nodata=0)
            crs, epsg = "EPSG:4326", 4326
        prof = {"driver": "GTiff", "height": h, "width": w, "count": 1, "dtype": dtype, "crs": crs,
                "transform": transform, "nodata": 0, "compress": "deflate"}
        with rasterio.open(dst_path, "w", **prof) as dst:
            dst.write(out, 1)
    print(f"Raster cluster: EPSG:{epsg}, {w}x{h} celle")
    if epsg not in EPSG_DASHBOARD:
        print(f"ATTENZIONE: EPSG:{epsg} non è tra quelli predefiniti della dashboard: aggiungi la sua definizione "
              f"proj4 in data/config.json -> mappa.proj4 {{\"{epsg}\": \"+proj=...\"}} oppure usa --wgs84")
    return out


def confine_wgs84(src, dst, crs_forzato=None):
    from rasterio.warp import transform_geom
    with open(src, encoding="utf-8") as f:
        gj = json.load(f)
    crs = crs_forzato or (gj.get("crs") or {}).get("properties", {}).get("name") or "EPSG:4326"
    crs = crs.replace("urn:ogc:def:crs:", "").replace("::", ":").replace("OGC:1.3:CRS84", "EPSG:4326")
    feats = gj["features"] if gj.get("type") == "FeatureCollection" else [gj if gj.get("type") == "Feature" else {"type": "Feature", "properties": {}, "geometry": gj}]
    if crs != "EPSG:4326":
        for ft in feats:
            ft["geometry"] = transform_geom(crs, "EPSG:4326", ft["geometry"], precision=6)
    out = {"type": "FeatureCollection", "features": feats}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"Confine: {crs} -> EPSG:4326 ({len(feats)} elementi)")


ID_COLS = {"id", "fid", "objectid", "ogc_fid", "cella", "cell", "cell_id", "id_cella", "pixel", "row", "col", "riga", "colonna"}


def _num(v, dec_comma):
    v = v.strip()
    if dec_comma:
        v = v.replace(".", "").replace(",", ".") if re.match(r"^-?[\d.]*,\d+$", v) else v
    try:
        return float(v)
    except ValueError:
        return np.nan


def leggi_csv(path, a, cl_raster, transform_raster):
    raw = open(path, "rb").read()
    try:
        txt = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        txt = raw.decode("cp1252")
    sep = csv.Sniffer().sniff(txt[:20000], delimiters=",;\t").delimiter
    rows = list(csv.reader(io.StringIO(txt), delimiter=sep))
    head = [h.strip() for h in rows[0]]
    body = [r for r in rows[1:] if any(c.strip() for c in r)]
    dec_comma = sep != "," and any(re.match(r"^-?\d+,\d+$", c.strip()) for r in body[:200] for c in r)
    low = {h.lower(): i for i, h in enumerate(head)}

    def trova(nome, alternative):
        if nome:
            if nome.lower() not in low:
                raise SystemExit(f"Colonna '{nome}' non trovata nel CSV. Colonne: {', '.join(head)}")
            return low[nome.lower()]
        return next((low[n] for n in alternative if n in low), None)

    ic = trova(a.col_cluster, ["cluster", "clust", "cluster_id", "id_cluster", "classe", "class"])
    ix = trova(a.col_x, ["x", "x_3035", "east", "easting", "xcoord", "coord_x"])
    iy = trova(a.col_y, ["y", "y_3035", "north", "northing", "ycoord", "coord_y"])
    escluse = {i for i in (ic, ix, iy) if i is not None} | {i for h, i in low.items() if h in ID_COLS}
    if a.colonne:
        iv = [trova(c.strip(), []) for c in a.colonne.split(",")]
    else:
        iv = [i for i in range(len(head)) if i not in escluse and
              sum(np.isfinite(_num(r[i], dec_comma)) for r in body[:200] if i < len(r)) > 0.8 * min(len(body), 200)]
    if not iv:
        raise SystemExit("Nessuna colonna numerica di variabili trovata nel CSV (usa --colonne)")
    get = lambda r, i: _num(r[i], dec_comma) if i < len(r) else np.nan
    X = np.array([[get(r, i) for i in iv] for r in body], dtype="float64")

    cl_xy = None
    if ix is not None and iy is not None:
        xs = np.array([get(r, ix) for r in body]); ys = np.array([get(r, iy) for r in body])
        inv = ~transform_raster
        cols, rws = inv * (xs, ys)
        cols, rws = np.floor(cols).astype(int), np.floor(rws).astype(int)
        ok = (rws >= 0) & (rws < cl_raster.shape[0]) & (cols >= 0) & (cols < cl_raster.shape[1])
        cl_xy = np.zeros(len(body), dtype=np.int64)
        cl_xy[ok] = cl_raster[rws[ok], cols[ok]]
        fuori = int((~ok).sum())
        if fuori:
            print(f"ATTENZIONE: {fuori} righe del CSV hanno coordinate fuori dal raster (CRS diverso?)")
    if ic is not None:
        cl = np.array([get(r, ic) for r in body])
        cl = np.where(np.isfinite(cl), cl, 0).astype(np.int64)
        if cl_xy is not None:
            m = (cl > 0) & (cl_xy > 0)
            print(f"Controllo coerenza CSV/raster: {100 * (cl[m] == cl_xy[m]).mean():.1f}% delle celle con lo stesso cluster")
    elif cl_xy is not None:
        cl = cl_xy
    else:
        raise SystemExit("Il CSV deve avere una colonna cluster oppure le coordinate x, y")
    print(f"CSV: {len(body)} righe, separatore '{sep}'{', virgola decimale' if dec_comma else ''}; "
          f"variabili: {', '.join(head[i] for i in iv)}")
    return cl, X, [head[i] for i in iv]


GRUPPI = {"visibility": "Visibilità", "morphology": "Morfologia", "ecology": "Ecologia"}


def etichetta_auto(codice):
    pre, _, nome = codice.rpartition(".")
    nome = re.sub(r"^vis_", "", nome).replace("_", " ")
    return {"codice": codice, "nome": nome[:1].upper() + nome[1:], "gruppo": GRUPPI.get(pre, pre.capitalize() if pre else "Altro"),
            "unita": ""}


def leggi_statistiche(path, out_dir):
    raw = open(path, "rb").read()
    try:
        txt = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        txt = raw.decode("cp1252")
    sep = csv.Sniffer().sniff(txt[:5000], delimiters=",;\t").delimiter
    rows = list(csv.DictReader(io.StringIO(txt), delimiter=sep))
    rows = [{k.strip().lower(): (v or "").strip() for k, v in r.items() if k} for r in rows]
    need = {"cluster", "variable", "q1", "median", "q3"}
    if not rows or not need <= set(rows[0]):
        raise SystemExit(f"Il CSV delle statistiche deve avere le colonne {sorted(need)}; trovate: {list(rows[0]) if rows else []}")
    dec_comma = sep != ","
    f = lambda r, k: (None if r.get(k) in (None, "", "NA", "NaN") else float(_num(r[k], dec_comma)))

    codici = list(dict.fromkeys(r["variable"] for r in rows))
    et_path = os.path.join(out_dir, "etichette_variabili.json")
    if os.path.exists(et_path):
        et = {e["codice"]: e for e in json.load(open(et_path, encoding="utf-8"))["variabili"]}
        ordine = [c for c in et if c in codici] + [c for c in codici if c not in et]
    else:
        et, ordine = {}, codici
    nuove = [c for c in codici if c not in et]
    for c in nuove:
        et[c] = etichetta_auto(c)
    if nuove:
        with open(et_path, "w", encoding="utf-8") as fh:
            json.dump({"_nota": "Modifica nome, gruppo e unita; l'ordine qui è l'ordine nel grafico. Rilancia prepara_dati.py per applicare.",
                       "variabili": [et[c] for c in ordine]}, fh, ensure_ascii=False, indent=2)
        print(f"Etichette: {len(nuove)} variabili aggiunte a {et_path} (personalizzale e rilancia)")

    vid = {c: f"v{i+1}" for i, c in enumerate(ordine)}
    variabili = [{"id": vid[c], "codice": c, "nome": et[c]["nome"], "gruppo": et[c].get("gruppo", ""), "unita": et[c].get("unita", "")}
                 for c in ordine]
    cl_stats, n_per_cl = {}, {}
    for r in rows:
        cid = str(int(float(r["cluster"])))
        s = {"n": int(f(r, "n") or 0), "min": f(r, "min"), "max": f(r, "max"), "q1": f(r, "q1"), "mediana": f(r, "median"),
             "q3": f(r, "q3"), "baffo_inf": f(r, "lower_whisker"), "baffo_sup": f(r, "upper_whisker"),
             "n_out_inf": int(f(r, "n_outliers_below") or 0), "n_out_sup": int(f(r, "n_outliers_above") or 0), "outlier": []}
        if s["baffo_inf"] is None:   # baffi mancanti: regola di Tukey limitata a min/max
            iqr = s["q3"] - s["q1"]
            s["baffo_inf"] = max(s["min"] if s["min"] is not None else -1e300, s["q1"] - 1.5 * iqr)
            s["baffo_sup"] = min(s["max"] if s["max"] is not None else 1e300, s["q3"] + 1.5 * iqr)
        cl_stats.setdefault(cid, {})[vid[r["variable"]]] = s
        n_per_cl[int(cid)] = max(n_per_cl.get(int(cid), 0), s["n"])
    print(f"Statistiche: {len(cl_stats)} cluster x {len(variabili)} variabili (separatore '{sep}')")
    return {"scala": "standardizzata", "variabili": variabili, "globale": None, "cluster": cl_stats}, n_per_cl


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cluster")
    ap.add_argument("--statistiche")
    ap.add_argument("--variabili")
    ap.add_argument("--csv")
    ap.add_argument("--col-cluster")
    ap.add_argument("--col-x")
    ap.add_argument("--col-y")
    ap.add_argument("--colonne")
    ap.add_argument("--nomi")
    ap.add_argument("--unita")
    ap.add_argument("--wgs84", action="store_true")
    ap.add_argument("--confine")
    ap.add_argument("--confine-crs")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    if sum(bool(x) for x in (a.statistiche, a.csv, a.variabili)) != 1:
        raise SystemExit("Indica le variabili con UNA sola tra --statistiche, --csv, --variabili")
    if not a.cluster and not a.statistiche:
        raise SystemExit("Serve --cluster (raster dei cluster)")

    cl_r = None
    if a.cluster:
        with rasterio.open(a.cluster) as c:
            cl_r = leggi_codici(c)
            tr = c.transform

    n_celle = {}
    if a.statistiche:
        stats, n_celle = leggi_statistiche(a.statistiche, a.out)
        ids = sorted(int(k) for k in stats["cluster"])
        if cl_r is not None:
            ids_r = sorted(int(i) for i in np.unique(cl_r) if i > 0)
            if ids_r != ids:
                print(f"ATTENZIONE: cluster nel raster {ids_r} diversi da quelli nel CSV {ids}")
            n_celle = {cid: int((cl_r == cid).sum()) for cid in ids_r}
            diff = [cid for cid in ids if n_celle.get(cid) != stats["cluster"][str(cid)][stats["variabili"][0]["id"]]["n"]]
            if diff:
                print(f"Nota: per i cluster {diff} il numero di celle del raster differisce da n del CSV")
            ids = sorted(set(ids) | set(ids_r))
    else:
        if a.csv:
            cl, X, nomi_col = leggi_csv(a.csv, a, cl_r, tr)        # cl: (n,), X: (n, k)
            nomi = a.nomi.split(",") if a.nomi else nomi_col
        else:
            with rasterio.open(a.variabili) as v:
                if (v.width, v.height) != (cl_r.shape[1], cl_r.shape[0]):
                    raise SystemExit("Il raster delle variabili deve avere la stessa griglia del raster dei cluster")
                stack = v.read(masked=True).astype("float64").filled(np.nan)
                descr = list(v.descriptions)
            cl = cl_r.ravel()
            X = stack.reshape(stack.shape[0], -1).T
            nomi = a.nomi.split(",") if a.nomi else [d or f"var_{i+1}" for i, d in enumerate(descr)]
        if len(nomi) != X.shape[1]:
            raise SystemExit(f"--nomi ha {len(nomi)} voci ma le variabili sono {X.shape[1]}")
        unita = a.unita.split(",") if a.unita else [""] * len(nomi)
        if len(unita) != len(nomi):
            raise SystemExit(f"--unita ha {len(unita)} voci ma le variabili sono {len(nomi)}")
        ids = sorted(int(i) for i in np.unique(cl_r) if i > 0)
        n_celle = {cid: int((cl_r == cid).sum()) for cid in ids}
        valid = cl > 0
        variabili = [{"id": f"v{i+1}", "nome": n.strip(), "unita": u.strip()} for i, (n, u) in enumerate(zip(nomi, unita))]
        stats = {"scala": "originale", "variabili": variabili, "globale": {}, "cluster": {}}
        for i, var in enumerate(variabili):
            stats["globale"][var["id"]] = five_numbers(X[valid, i])
        for cid in ids:
            m = cl == cid
            if not m.any():
                print(f"ATTENZIONE: il cluster {cid} è nel raster ma non ha righe nelle variabili")
                continue
            stats["cluster"][str(cid)] = {var["id"]: five_numbers(X[m, i]) for i, var in enumerate(variabili)}

    with open(os.path.join(a.out, "statistiche_cluster.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False)

    stesso = lambda x, y: os.path.abspath(x) == os.path.abspath(y)
    if a.cluster:
        if stesso(a.cluster, os.path.join(a.out, "cluster.tif")):
            raise SystemExit("Il raster di partenza non può essere data/cluster.tif (verrebbe sovrascritto): spostalo in dati_reali/")
        prepara_raster(a.cluster, os.path.join(a.out, "cluster.tif"), a.wgs84)
    else:
        print("Nota: raster dei cluster non indicato (--cluster): data/cluster.tif non aggiornato")
    if a.confine and stesso(a.confine, os.path.join(a.out, "area_studio.geojson")):
        raise SystemExit("Il confine di partenza non può essere data/area_studio.geojson (verrebbe sovrascritto): spostalo in dati_reali/")
    if a.confine:
        confine_wgs84(a.confine, os.path.join(a.out, "area_studio.geojson"), a.confine_crs)

    meta_path = os.path.join(a.out, "cluster.json")
    if not os.path.exists(meta_path):
        meta = {"cluster": [{"id": cid, "nome": f"Cluster {cid}", "colore": PALETTE[(cid - 1) % len(PALETTE)],
                             "descrizione": "", "n_celle": n_celle.get(cid, 0)} for cid in ids]}
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"OK: {len(ids)} cluster, {len(stats['variabili'])} variabili -> {os.path.abspath(a.out)}")


if __name__ == "__main__":
    main()
