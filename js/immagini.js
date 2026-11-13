// Pannelli immagini: vista sferica (immagine centrale del cluster, fotosferica.jpg) e matrice 2x2 delle eccezioni.
// Cerca i file secondo la convenzione in data/immagini/LEGGIMI.txt; se mancano mostra un segnaposto.
VP.immagini = (() => {
  const cache = new Map();       // "id/nome" -> url risolto o null
  const didascalie = new Map();  // id -> oggetto didascalie
  let token = 0;

  function cartella(id) { return `${VP.stato.config.immagini.cartella}/cluster_${VP.pad2(id)}`; }

  function prova(url) {
    return new Promise(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = url; });
  }
  async function trova(id, nome) {
    const k = id + "/" + nome;
    if (cache.has(k)) return cache.get(k);
    let found = null;
    for (const ext of VP.stato.config.immagini.estensioni) {
      const url = `${cartella(id)}/${nome}.${ext}`;
      if (await prova(url)) { found = url; break; }
    }
    cache.set(k, found);
    return found;
  }
  async function caricaDidascalie(id) {
    if (didascalie.has(id)) return didascalie.get(id);
    let d = {};
    try { const r = await fetch(`${cartella(id)}/didascalie.json`); if (r.ok) d = await r.json(); } catch (e) {}
    didascalie.set(id, d); return d;
  }

  // Segnaposto SVG: paesaggio stilizzato nei toni del cluster, deterministico per (cluster, slot)
  function segnaposto(id, nome, etichetta) {
    const neutro = id == null;
    const c = neutro ? VP.COLORE_NEUTRO : VP.stato.clusters.get(id)?.colore || "#888";
    let s = (id ?? 3) * 97 + [...nome].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const col = d3.color(c);
    const layers = [0.15, 0.35, 0.6].map((t, i) => {
      const yb = 210 + i * 45; let p = `M0 ${yb}`;
      for (let xk = 0; xk <= 640; xk += 40) p += ` L${xk} ${yb - rnd() * (60 - i * 12)}`;
      p += " L640 400 L0 400 Z";
      return `<path d="${p}" fill="${d3.interpolateRgb("#e8efe9", col.darker(i * 0.6))(0.35 + t)}"/>`;
    }).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice">
      <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${neutro ? "#c3b6b9" : "#cfdde6"}"/><stop offset="1" stop-color="${neutro ? "#f1ecec" : "#f3efe6"}"/></linearGradient></defs>
      <rect width="640" height="400" fill="url(#s)"/>${layers}
      <text x="320" y="150" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="#1f2328" fill-opacity=".8">${etichetta}</text>
      <text x="320" y="174" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#1f2328" fill-opacity=".6">${neutro ? "seleziona un cluster sulla mappa" : `segnaposto · cluster_${VP.pad2(id)}/${nome}.jpg`}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // Ritaglia l'immagine composita delle eccezioni in righe x colonne riquadri (ordine: da sinistra a destra,
  // dall'alto in basso). spaziatura_px / margine_px = bordi bianchi tra i riquadri e attorno, in pixel originali.
  const ritagli = new Map();
  function ritaglia(url) {
    if (ritagli.has(url)) return ritagli.get(url);
    const o = Object.assign({ colonne: 2, righe: 2, spaziatura_px: 0, margine_px: 0 }, VP.stato.config.immagini.eccezioni_composita);
    const pr = new Promise(res => {
      const im = new Image();
      im.onload = async () => {
        const m = o.margine_px, g = o.spaziatura_px;
        const w = (im.naturalWidth - 2 * m - (o.colonne - 1) * g) / o.colonne;
        const h = (im.naturalHeight - 2 * m - (o.righe - 1) * g) / o.righe;
        const out = [];
        for (let r = 0; r < o.righe; r++) for (let c = 0; c < o.colonne; c++) {
          const cv = document.createElement("canvas"); cv.width = Math.round(w); cv.height = Math.round(h);
          cv.getContext("2d").drawImage(im, m + c * (w + g), m + r * (h + g), w, h, 0, 0, cv.width, cv.height);
          out.push(await new Promise(ok => cv.toBlob(b => ok(URL.createObjectURL(b)), "image/jpeg", 0.92)));
        }
        res(out);
      };
      im.onerror = () => res([]);
      im.src = url;
    });
    ritagli.set(url, pr);
    return pr;
  }

  function imposta(img, url) {
    if (img.getAttribute("src") === url) return;
    img.style.opacity = 0;
    img.onload = () => (img.style.opacity = 1);
    img.src = url;
  }

  // pulsanti "Leggi" nelle intestazioni dei pannelli: aprono i testi in una finestra (niente testo sopra le immagini)
  const immaginiEcc = () => [...document.querySelectorAll("#exc figure img")].map(i => i.src);
  let didCorr = null;   // didascalie delle eccezioni del cluster corrente (dalla tavola generata)
  function pulsanti(id) {
    const t = id != null ? VP.testi.get(id) : null;
    const bc = document.getElementById("btn-centrale"), be = document.getElementById("btn-eccezioni");
    if (bc) { bc.hidden = !(t && t.centrale.length); bc.onclick = () => VP.testi.apriCentrale(id); }
    if (be) { be.hidden = !(id != null && VP.testi.haEccezioni(id, didCorr)); be.onclick = () => VP.testi.apriEccezioni(id, immaginiEcc(), null, didCorr); }
  }

  function init() {
    const exc = document.getElementById("exc");
    VP.stato.config.immagini.eccezioni.forEach((n, i) => {
      exc.insertAdjacentHTML("beforeend", `<figure data-slot="${n}"><img alt="Eccezione ${i + 1}"><figcaption>Eccezione ${i + 1}</figcaption></figure>`);
    });
    const lb = document.getElementById("lightbox");
    document.addEventListener("click", e => {
      const fig = e.target.closest(".exc figure");
      if (fig && VP.stato.clusterCorrente != null && VP.testi.haEccezioni(VP.stato.clusterCorrente, didCorr)) {   // eccezione: immagine + suo testo
        const i = [...fig.parentNode.querySelectorAll("figure")].indexOf(fig);
        return VP.testi.apriEccezioni(VP.stato.clusterCorrente, immaginiEcc(), i, didCorr);
      }
      const img = e.target.closest(".exc img, .synth img");
      if (img && img.src) { lb.querySelector("img").src = img.src; lb.querySelector("p").textContent = img.dataset.caption || ""; lb.hidden = false; }
    });
    lb.onclick = () => (lb.hidden = true);
    document.addEventListener("keydown", e => { if (e.key === "Escape") lb.hidden = true; });
    neutri();
  }

  let deb;
  VP.bus.on("cluster", id => { clearTimeout(deb); deb = setTimeout(() => aggiorna(id), 90); });

  // Stato iniziale (nessun cluster selezionato): segnaposto neutri grigio-bordeaux
  function neutri() {
    const cfg = VP.stato.config.immagini;
    VP.panorama.mostra(null, null, "");
    didCorr = null; pulsanti(null);
    document.getElementById("synth").hidden = true;
    document.getElementById("street-caption").textContent = "seleziona un cluster sulla mappa";
    document.querySelectorAll("#exc figure").forEach((f, i) => {
      imposta(f.querySelector("img"), segnaposto(null, cfg.eccezioni[i], `Eccezione ${i + 1}`));
      f.querySelector("figcaption").textContent = `Eccezione ${i + 1}`;
    });
  }

  async function aggiorna(id) {
    const my = ++token;
    const cfg = VP.stato.config.immagini;
    if (id == null) return neutri();
    const nome = VP.stato.clusters.get(id)?.nome || `Cluster ${id}`;
    const comp = cfg.eccezioni_composita;
    const [sv, sy, did, img4] = await Promise.all([
      trova(id, cfg.fotosferica), cfg.sintetica ? trova(id, cfg.sintetica) : null, caricaDidascalie(id), comp ? trova(id, comp.file) : null,
    ]);
    // eccezioni: un'unica immagine con la griglia 2x2 (ritagliata qui) oppure, in mancanza, 4 file separati
    const ex = img4 ? await ritaglia(img4) : await Promise.all(cfg.eccezioni.map(n => trova(id, n)));
    if (my !== token) return; // nel frattempo il mouse è passato a un altro cluster
    const t = VP.testi.get(id);
    VP.panorama.mostra(sv, id, nome);
    didCorr = did; pulsanti(id);
    document.getElementById("street-caption").textContent = sv ? "trascina per guardarti intorno" : "segnaposto · trascina per guardarti intorno";
    const synth = document.getElementById("synth");
    synth.hidden = !sy;
    if (sy) { imposta(document.getElementById("synth-img"), sy); document.getElementById("synth-img").dataset.caption = `Immagine sintetica centrale · ${nome}`; }
    document.querySelectorAll("#exc figure").forEach((f, i) => {
      const n = cfg.eccezioni[i], img = f.querySelector("img");
      imposta(img, ex[i] || segnaposto(id, n, `Eccezione ${i + 1}`));
      const tit = did.eccezioni?.[i]?.titolo || did[n];
      f.querySelector("figcaption").textContent = `Eccezione ${i + 1}` + (tit ? ` · ${tit}` : "");
      f.title = tit || "";
      img.dataset.caption = `Eccezione ${i + 1} · ${nome}`;
    });
  }
  return { init, fotosferica: id => trova(id, VP.stato.config.immagini.fotosferica) };
})();
