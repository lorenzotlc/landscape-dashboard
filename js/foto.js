// Foto reali geotaggate (data/foto.geojson, preparate con tools/prepara_foto.py):
// - layer di punti sulla mappa, colorati come il cluster della cella in cui sono state scattate;
// - galleria "Foto reali" nel pannello delle eccezioni, filtrata sul cluster corrente.
VP.foto = (() => {
  let feats = [], layer = null, markers = new Map(), tab = "ia";

  const colore = c => VP.stato.clusters.get(c)?.colore || "#8a8a8a";
  const quando = d => d ? new Date(d).toLocaleString("it-IT", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  const didascalia = p => [p.cluster ? `Cluster ${VP.pad2(p.cluster)} · ${VP.stato.clusters.get(p.cluster)?.titolo || VP.stato.clusters.get(p.cluster)?.nome || ""}` : "Fuori dai cluster",
    quando(p.data), p.quota != null ? `${Math.round(p.quota)} m s.l.m.` : "",
    p.spostata ? `posizione corretta a mano (${p.nota_spostamento})` : ""].filter(Boolean).join(" · ");

  // Popup di CONFRONTO: a sinistra la fotosferica del cluster (animata, fissa), a destra la foto reale,
  // zoomabile (rotella / pizzico / doppio clic / pulsanti) e scorrevole con le frecce tra le foto dello stesso cluster.
  let box, elenco = [], pos = 0, visore = null, zoom = null;
  function creaBox() {
    box = document.createElement("div");
    box.className = "confronto"; box.hidden = true;
    box.innerHTML = `<div class="cf-box" role="dialog" aria-modal="true">
        <header class="cf-h"><span class="cf-sw"></span>
          <div class="cf-tt"><div class="cf-sopra">Confronto · immagine generata e foto reale</div><h3 class="cf-tit"></h3></div>
          <button class="cf-x" aria-label="Chiudi">×</button></header>
        <div class="cf-corpo">
          <section class="cf-col"><div class="cf-lab">Fotosferica (immagine centrale generata)</div><div class="cf-pano" id="cf-pano"></div></section>
          <section class="cf-col"><div class="cf-lab">Foto reale <span class="cf-n"></span></div>
            <div class="cf-foto"><img alt="" draggable="false">
              <button class="cf-prev" aria-label="Foto precedente">‹</button><button class="cf-next" aria-label="Foto successiva">›</button>
              <div class="cf-zoom"><button data-z="1" aria-label="Ingrandisci">+</button><button data-z="-1" aria-label="Riduci">−</button><button data-z="0" aria-label="Adatta">⤢</button></div>
            </div>
            <div class="cf-info"></div></section>
        </div></div>`;
    document.body.appendChild(box);
    box.addEventListener("click", e => { if (e.target === box || e.target.closest(".cf-x")) chiudi(); });
    box.querySelector(".cf-prev").onclick = () => vai(-1);
    box.querySelector(".cf-next").onclick = () => vai(1);
    document.addEventListener("keydown", e => {
      if (!box || box.hidden) return;
      if (e.key === "Escape") chiudi(); else if (e.key === "ArrowRight") vai(1); else if (e.key === "ArrowLeft") vai(-1);
    });
    zoom = zoomabile(box.querySelector(".cf-foto"), box.querySelector(".cf-foto img"));
    box.querySelectorAll(".cf-zoom button").forEach(b => b.onclick = () => zoom.passo(+b.dataset.z));
  }

  // zoom e trascinamento di un'immagine dentro il suo riquadro
  function zoomabile(area, img) {
    let s = 1, x = 0, y = 0;
    const pt = new Map(); let d0 = 0, s0 = 1;
    const applica = () => {
      const w = area.clientWidth, h = area.clientHeight, mx = (s - 1) * w / 2, my = (s - 1) * h / 2;
      x = Math.max(-mx, Math.min(mx, x)); y = Math.max(-my, Math.min(my, y));
      img.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      area.classList.toggle("zoomata", s > 1.01);
    };
    const zoomA = (ns, cx, cy) => {      // zoom attorno al punto (cx, cy) relativo al centro dell'area
      ns = Math.max(1, Math.min(8, ns));
      x = cx - (cx - x) * ns / s; y = cy - (cy - y) * ns / s; s = ns; applica();
    };
    const centro = e => { const r = area.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
    area.addEventListener("wheel", e => { e.preventDefault(); const [cx, cy] = centro(e); zoomA(s * Math.exp(-e.deltaY * 0.0018), cx, cy); }, { passive: false });
    area.addEventListener("dblclick", e => { if (e.target.closest("button")) return; const [cx, cy] = centro(e); zoomA(s > 1.5 ? 1 : 2.5, cx, cy); });
    area.addEventListener("pointerdown", e => { if (e.target.closest("button")) return; area.setPointerCapture(e.pointerId); pt.set(e.pointerId, [e.clientX, e.clientY]);
      if (pt.size === 2) { const [a, b] = [...pt.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); s0 = s; } });
    area.addEventListener("pointermove", e => {
      if (!pt.has(e.pointerId)) return;
      const prev = pt.get(e.pointerId); pt.set(e.pointerId, [e.clientX, e.clientY]);
      if (pt.size === 2) { const [a, b] = [...pt.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const r = area.getBoundingClientRect(); zoomA(s0 * d / d0, (a[0] + b[0]) / 2 - r.left - r.width / 2, (a[1] + b[1]) / 2 - r.top - r.height / 2); }
      else if (s > 1) { x += e.clientX - prev[0]; y += e.clientY - prev[1]; applica(); }
    });
    const fine = e => pt.delete(e.pointerId);
    area.addEventListener("pointerup", fine); area.addEventListener("pointercancel", fine);
    return { reset: () => { s = 1; x = 0; y = 0; applica(); }, passo: k => k === 0 ? (s = 1, x = 0, y = 0, applica()) : zoomA(s * (k > 0 ? 1.5 : 1 / 1.5), 0, 0) };
  }

  function mostra() {
    const p = elenco[pos];
    zoom.reset();
    const img = box.querySelector(".cf-foto img"); img.src = p.file;
    box.querySelector(".cf-n").textContent = elenco.length > 1 ? `· ${pos + 1} di ${elenco.length}` : "";
    box.querySelector(".cf-info").textContent = [quando(p.data), p.quota != null ? `${Math.round(p.quota)} m s.l.m.` : "",
      p.spostata ? `posizione corretta a mano (${p.nota_spostamento})` : ""].filter(Boolean).join(" · ");
    box.querySelectorAll(".cf-prev,.cf-next").forEach(b => b.hidden = elenco.length < 2);
    feats.forEach(f => evidenzia(f.properties.id, f.properties.id === p.id));
  }
  function vai(d) { if (elenco.length < 2) return; pos = (pos + d + elenco.length) % elenco.length; mostra(); }

  async function apri(p) {
    if (!box) creaBox();
    const id = p.cluster, c = VP.stato.clusters.get(id);
    elenco = feats.map(f => f.properties).filter(q => q.cluster === id);
    pos = Math.max(0, elenco.findIndex(q => q.id === p.id));
    box.style.setProperty("--fcol", c?.colore || "#8a8a8a");
    box.querySelector(".cf-tit").textContent = id ? `Cluster ${VP.pad2(id)} · ${c?.titolo || c?.nome || ""}` : "Foto fuori dai cluster";
    box.hidden = false; document.body.classList.add("modale-aperta");
    mostra();
    // fotosferica del cluster: resta la stessa mentre si scorrono le foto reali
    if (visore) { try { visore.destroy(); } catch (e) {} visore = null; }
    document.getElementById("cf-pano").innerHTML = "";
    if (id) {
      const url = await VP.immagini.fotosferica(id);
      if (!box.hidden) visore = await VP.panorama.crea("cf-pano", url, id, c?.titolo || c?.nome || "");
    }
  }
  function chiudi() {
    if (!box) return;
    box.hidden = true; document.body.classList.remove("modale-aperta");
    if (visore) { try { visore.destroy(); } catch (e) {} visore = null; }
    feats.forEach(f => evidenzia(f.properties.id, false));
  }

  async function carica() {
    const url = VP.stato.config.foto;
    if (!url) return;
    try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) feats = (await r.json()).features || []; } catch (e) {}
  }

  // chiamata da mappa.js: restituisce il layer da aggiungere alla mappa (o null)
  function layerMappa(map) {
    if (!feats.length) return null;
    map.createPane("foto").style.zIndex = 460;
    layer = L.geoJSON({ type: "FeatureCollection", features: feats }, {
      pane: "foto",
      pointToLayer: (f, ll) => L.circleMarker(ll, { pane: "foto", radius: 5, color: "#fff", weight: 1.5,
        fillColor: colore(f.properties.cluster), fillOpacity: 0.95 }),
      onEachFeature: (f, m) => {
        const p = f.properties; markers.set(p.id, m);
        m.bindTooltip(`<img src="${p.mini}" style="width:180px;display:block;border-radius:4px"><div style="margin-top:4px">${didascalia(p)}</div>`,
          { direction: "top", offset: [0, -6], className: "foto-tip" });
        m.on("click", e => { L.DomEvent.stop(e); apri(p); });
      },
    });
    return layer;
  }

  function evidenzia(id, on) {
    const m = markers.get(id); if (!m) return;
    m.setRadius(on ? 9 : 5).setStyle({ weight: on ? 2.5 : 1.5, color: on ? "#111" : "#fff" });
    if (on) m.bringToFront();
  }

  function init() {
    const n = feats.length;
    const h = document.querySelector(".p-exc .panel-h");
    const SOTTO = { ia: "variazioni meno frequenti nel cluster, generate con IA",
                    foto: "fotografie scattate nel cluster, da confrontare con l'ipotesi dominante" };
    h.innerHTML = `<div class="tabs"><button data-tab="ia" class="on">Eccezioni locali</button>` +
      (n ? `<button data-tab="foto">Foto reali <span id="foto-n"></span></button>` : "") + `</div>` +
      `<span class="hint" id="exc-sub" title="${SOTTO.ia}">${SOTTO.ia}</span>` +
      `<button class="btn-leggi" id="btn-eccezioni" hidden title="Leggi i testi delle eccezioni">Leggi</button>`;
    document.getElementById("exc").insertAdjacentHTML("afterend", `<div class="foto-gal" id="foto-gal" hidden></div>`);
    h.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
      tab = b.dataset.tab;
      h.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
      document.getElementById("exc").hidden = tab !== "ia";
      document.getElementById("foto-gal").hidden = tab !== "foto";
      const sub = document.getElementById("exc-sub"); sub.textContent = sub.title = SOTTO[tab];
    });
  }

  function galleria(id) {
    const gal = document.getElementById("foto-gal"); if (!gal) return;
    const sel = feats.filter(f => f.properties.cluster === id).map(f => f.properties);
    const cnt = document.getElementById("foto-n"); if (cnt) cnt.textContent = id != null ? `(${sel.length})` : "";
    if (!sel.length) { gal.innerHTML = `<div class="empty">Nessuna foto reale in questo cluster</div>`; return; }
    gal.innerHTML = sel.map(p => `<figure data-id="${p.id}"><img loading="lazy" src="${p.mini}" alt=""><figcaption>${quando(p.data)}</figcaption></figure>`).join("");
    gal.querySelectorAll("figure").forEach(fig => {
      const p = sel.find(q => q.id === +fig.dataset.id);
      fig.onmouseenter = () => evidenzia(p.id, true);
      fig.onmouseleave = () => evidenzia(p.id, false);
      fig.onclick = () => apri(p);
    });
  }

  VP.bus.on("cluster", id => {
    galleria(id);
    if (layer) layer.eachLayer(m => {
      const c = m.feature.properties.cluster, on = id == null || c === id;
      m.setStyle({ fillOpacity: on ? 0.95 : 0.25, opacity: on ? 1 : 0.35 });
    });
  });

  return { carica, layerMappa, init };
})();
