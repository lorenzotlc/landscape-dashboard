#!/usr/bin/env python3
"""
Prepara le immagini generate (IA) per la dashboard.

Sorgente (default dati_reali/output_IA_GEN_GPTs), una cartella per cluster:
  clusterN/centrale.jpg    immagine centrale            -> data/immagini/cluster_0N/fotosferica.jpg (copiata così com'è)
  clusterN/eccezioni.jpg   tavola con le 4 eccezioni    -> data/immagini/cluster_0N/eccezione_1..4.jpg
                           (griglia 2x2 con bordi bianchi, didascalie e ombre: i 4 riquadri fotografici vengono
                            trovati automaticamente; ordine 1 alto-sx, 2 alto-dx, 3 basso-sx, 4 basso-dx)

Didascalie delle eccezioni: se nella sorgente c'è didascalie_eccezioni.json (testo trascritto dalle tavole, chiavi
"1".."6" con intestazione, eccezioni[titolo, variabile, testo], nota) viene copiato per ogni cluster in
data/immagini/cluster_0N/didascalie.json: sono i testi che la dashboard usa per le eccezioni.

Uso:  python3 tools/prepara_immagini.py [--sorgente cartella] [--controllo dati_reali/_controllo_ritagli.jpg]
Con --controllo salva un'immagine di verifica con i riquadri trovati e numerati. Gli originali non vengono modificati.
Dipendenze: numpy, Pillow
"""
import argparse, json, os, re, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageOps

def runs(v, thr, minlen):
    out, s = [], None
    for i, x in enumerate(list(v) + [0]):
        if x > thr and s is None: s = i
        if x <= thr and s is not None:
            if i - s >= minlen: out.append((s, i))
            s = None
    return out

def riquadri(im):
    """4 riquadri fotografici di una tavola 2x2: righe/colonne con quasi tutti pixel 'non bianchi'."""
    a = np.asarray(im.convert("RGB")).astype(int)
    g, sat = a.mean(2), a.max(2) - a.min(2)
    nw = (g < 236) | (sat > 22)
    rowfrac = nw.mean(1)
    rr = runs(rowfrac, 0.75 * rowfrac.max(), 60)
    righe = np.zeros(len(g), bool)
    for r0, r1 in rr: righe[r0:r1] = True
    cc = runs(nw[righe].mean(0), 0.9, 60)
    if len(rr) != 2 or len(cc) != 2:
        raise ValueError(f"griglia non riconosciuta (righe {rr}, colonne {cc})")
    return [(c0 + 2, r0 + 2, c1 - 2, r1 - 2) for r0, r1 in rr for c0, c1 in cc]

def main():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sorgente", default=os.path.join(base, "dati_reali", "output_IA_GEN_GPTs"))
    ap.add_argument("--out", default=os.path.join(base, "data", "immagini"))
    ap.add_argument("--controllo")
    a = ap.parse_args()
    anteprime = []
    dp = os.path.join(a.sorgente, "didascalie_eccezioni.json")
    didascalie = json.load(open(dp, encoding="utf-8")) if os.path.exists(dp) else {}
    for d in sorted(os.listdir(a.sorgente)):
        m = re.match(r"cluster[_ ]?0*(\d+)$", d, re.I)
        if not m: continue
        n = int(m.group(1)); src = os.path.join(a.sorgente, d)
        dst = os.path.join(a.out, f"cluster_{n:02d}"); os.makedirs(dst, exist_ok=True)
        msg = []
        cen = next((f for f in os.listdir(src) if re.match(r"centrale\.(jpe?g|png|webp)$", f, re.I)), None)
        if cen:
            ext = os.path.splitext(cen)[1].lower().replace("jpeg", "jpg")
            shutil.copyfile(os.path.join(src, cen), os.path.join(dst, "fotosferica" + ext)); msg.append("fotosferica")
        ecc = next((f for f in os.listdir(src) if re.match(r"eccezioni\.(jpe?g|png|webp)$", f, re.I)), None)
        if ecc:
            im = ImageOps.exif_transpose(Image.open(os.path.join(src, ecc))).convert("RGB")
            try:
                bb = riquadri(im)
                for k, b in enumerate(bb, 1):
                    im.crop(b).save(os.path.join(dst, f"eccezione_{k}.jpg"), quality=92)
                msg.append("4 eccezioni " + " ".join(f"{b[2]-b[0]}x{b[3]-b[1]}" for b in bb))
                if a.controllo:
                    v = im.copy(); dr = ImageDraw.Draw(v)
                    for k, b in enumerate(bb, 1):
                        dr.rectangle(b, outline=(230, 0, 0), width=4); dr.text((b[0] + 10, b[1] + 8), str(k), fill=(255, 255, 0))
                    v.thumbnail((600, 600)); anteprime.append(v)
            except ValueError as e:
                msg.append(f"ECCEZIONI NON RITAGLIATE: {e}")
        if str(n) in didascalie:
            with open(os.path.join(dst, "didascalie.json"), "w", encoding="utf-8") as f:
                json.dump(didascalie[str(n)], f, ensure_ascii=False, indent=2)
            msg.append("didascalie")
        print(f"cluster {n}: " + "; ".join(msg))
    if a.controllo and anteprime:
        W = 610 * 3; H = 610 * ((len(anteprime) + 2) // 3)
        sh = Image.new("RGB", (W, H), "white")
        for i, v in enumerate(anteprime): sh.paste(v, ((i % 3) * 610 + 5, (i // 3) * 610 + 5))
        sh.save(a.controllo, quality=85); print(f"Controllo: {a.controllo}")

if __name__ == "__main__":
    main()
