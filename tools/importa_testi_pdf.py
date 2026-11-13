#!/usr/bin/env python3
"""
Converte il PDF dell'agente interprete (Output_AgenteAI_Interprete_Cluster.pdf) nei file di testo della dashboard,
uno per cluster: data/testi/cluster_XX.txt.

Struttura attesa nel PDF, per ogni cluster:
  "Cluster N — Titolo"  + paragrafo introduttivo
  "1. Struttura centrale del cluster"
  "2. Eccezioni e tensioni interne"
  "3. Traduzione visuale della struttura centrale"
  "4. Traduzione visuale delle eccezioni e tensioni"

Corrispondenza con la dashboard:
  titolo + introduzione              -> TITOLO, DESCRIZIONE GENERALE (scheda sotto la testata)
  1. Struttura centrale              -> STRUTTURA CENTRALE (scheda, "leggi tutto")
  2. Eccezioni e tensioni            -> ECCEZIONI E TENSIONI (scheda, "leggi tutto")
  3. Traduzione visuale centrale     -> PARTE CENTRALE (testo sulla vista sferica)
  4. Traduzione visuale eccezioni    -> ECCEZIONE 1..4 = gli ultimi 4 paragrafi (uno per eccezione, nell'ordine
                                        della griglia 2x2); i paragrafi precedenti -> NOTE SULLE ECCEZIONI

Uso:  python3 tools/importa_testi_pdf.py Output_AgenteAI_Interprete_Cluster.pdf [--out data/testi]
Richiede pdftotext (poppler) oppure il modulo Python pypdf. I file esistenti vengono sovrascritti.
"""
import argparse, os, re, shutil, subprocess

SEZIONI = [(r"^\s*1\.\s*Struttura centrale", "STRUTTURA CENTRALE"),
           (r"^\s*2\.\s*Eccezioni e tensioni", "ECCEZIONI E TENSIONI"),
           (r"^\s*3\.\s*Traduzione visuale della struttura centrale", "PARTE CENTRALE"),
           (r"^\s*4\.\s*Traduzione visuale delle eccezioni", "ECCEZIONI")]


def testo_pdf(path):
    if shutil.which("pdftotext"):
        return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True).stdout
    from pypdf import PdfReader
    return "\n".join(p.extract_text() or "" for p in PdfReader(path).pages)


def paragrafi(righe):
    """Ricompone i paragrafi: riga vuota = nuovo paragrafo; anche una riga corta che finisce con un punto."""
    out, cur = [], []
    lungh = sorted(len(r.strip()) for r in righe if r.strip())
    tipica = lungh[int(len(lungh) * 0.8)] if lungh else 90
    for r in righe:
        t = r.strip()
        if not t:
            if cur: out.append(" ".join(cur)); cur = []
            continue
        cur.append(t)
        if t.endswith((".", ":", "”", "\"")) and len(t) < 0.8 * tipica:
            out.append(" ".join(cur)); cur = []
    if cur: out.append(" ".join(cur))
    return [re.sub(r"\s+", " ", p) for p in out]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "testi"))
    a = ap.parse_args()
    righe = [r.replace("\f", "") for r in testo_pdf(a.pdf).splitlines()]
    inizi = [i for i, r in enumerate(righe) if re.match(r"^\s*Cluster\s+\d+\s*[—–-]", r)]
    if not inizi:
        raise SystemExit("Nessun blocco 'Cluster N — ...' trovato nel PDF")
    os.makedirs(a.out, exist_ok=True)
    for k, i0 in enumerate(inizi):
        blocco = righe[i0:inizi[k + 1] if k + 1 < len(inizi) else len(righe)]
        n = int(re.match(r"^\s*Cluster\s+(\d+)", blocco[0]).group(1))
        # titolo: prima riga + righe brevi che seguono, fino all'introduzione
        tit = [re.sub(r"^\s*Cluster\s+\d+\s*[—–-]\s*", "", blocco[0]).strip()]
        j = 1
        while j < len(blocco) and blocco[j].strip() and len(blocco[j].strip()) < 70 and not re.match(r"^\s*(Il|Questo|La|Lo)\b", blocco[j].strip()):
            tit.append(blocco[j].strip()); j += 1
        titolo = " ".join(tit).strip(" “”\"")
        # sezioni
        marche = [(j, "DESCRIZIONE GENERALE")]
        for idx in range(j, len(blocco)):
            for rx, nome in SEZIONI:
                if re.match(rx, blocco[idx], re.I):
                    marche.append((idx, nome))
        marche.append((len(blocco), None))
        parti = [f"TITOLO: {titolo}", ""]
        for (s, nome), (e, _) in zip(marche, marche[1:]):
            corpo = paragrafi(blocco[s + (0 if nome == "DESCRIZIONE GENERALE" else 1):e])
            if nome == "ECCEZIONI" and len(corpo) >= 4:
                note, ecc = corpo[:-4], corpo[-4:]
                if note:
                    parti += ["NOTE SULLE ECCEZIONI", "", "\n\n".join(note), ""]
                for i, p in enumerate(ecc, 1):
                    parti += [f"ECCEZIONE {i}", "", p, ""]
            else:
                parti += [nome, "", "\n\n".join(corpo), ""]
        dst = os.path.join(a.out, f"cluster_{n:02d}.txt")
        with open(dst, "w", encoding="utf-8") as f:
            f.write("\n".join(parti).strip() + "\n")
        print(f"cluster {n}: «{titolo}» -> {dst} ({len(marche) - 2} sezioni)")


if __name__ == "__main__":
    main()
