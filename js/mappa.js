// Pannello WebGIS: basemap + raster dei cluster (GeoTIFF letto nel browser) + lettura del pixel sotto il mouse.
VP.mappa = (() => {
  let map, layer, georaster, hoverRect, opacita, legendEl;

  // Colori opachi (niente trasparenza per pixel): con raster riproiettati al volo i pixel adiacenti si
  // sovrappongono di poco e una trasparenza renderebbe visibili le cuciture. L'attenuazione dei cluster
  // non selezionati si ottiene schiarendo il colore verso il bianco; la trasparenza globale è lo slider.
  const cacheColori = new Map();
  function coloreCluster(v) {
    const c = VP.stato.clusters.get(v);
    if (!c) return null;
    const base = coloreModo(v);
    const cur = VP.stato.clusterCorrente, attenua = cur != null && cur !== v;
    const k = base + attenua;
    if (!cacheColori.has(k)) cacheColori.set(k, attenua ? d3.interpolateRgb(base, "#ffffff")(0.68) : base);
    return cacheColori.get(k);
  }

  // ---- Colorazione per dati della survey ------------------------------------------------------
  // "cluster" = colori dei cluster; le altre modalità colorano ogni cluster con un dato aggregato della survey
  // per la classe di portatori di interesse scelta nel pannello della survey.
  const MODI = [["cluster", "Cluster"], ["dominante", VP.t("Valore dominante")], ["intensita", VP.t("Intensità di un valore")],
                ["conflitto", VP.t("Conflitto principale")], ["scarto", VP.t("Scarto priorità – percezione")]];
  const INSUFF = "#d9d5d0", SCARTO_MAX = 2;
  let modo = "cluster", valSel = 0;
  const fmt1 = v => v.toLocaleString(VP.lingua.loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const colVal = () => VP.survey?.COLORI || [];
  function datoSurvey(v) {
    const D = VP.stato.survey; if (!D || !VP.survey) return null;
    const b = D.dati[String(v)]?.[VP.survey.classe()];
    return b && b.n >= D.n_minimo ? b : null;
  }
  function conflittoPrincipale(b) {
    let best = null;
    for (const [k, c] of Object.entries(b.conflitti)) if (!best || c > best.c) best = { k, c };
    return best ? { coppia: best.k.replace("|", " – "), q: best.c / (b.risposte || b.n) } : null;
  }
  const scalaIntensita = i => d3.interpolateRgb("#f3efe8", d3.color(colVal()[i]).darker(0.7));
  const scalaConflitto = d3.interpolateRgb("#f6e3e3", "#8f1f2a");
  // il conflitto è colorato in modo relativo: dal valore più basso al più alto tra i cluster (per la classe scelta),
  // altrimenti quote simili (es. 30–40%) darebbero colori indistinguibili; gli estremi reali sono scritti in legenda
  function estremiConflitto() {
    const q = [...VP.stato.clusters.keys()].map(v => { const b = datoSurvey(v); return b ? conflittoPrincipale(b)?.q : null; }).filter(x => x != null);
    return q.length ? d3.extent(q) : [0, 1];
  }
  const scalaScarto = t => d3.interpolatePRGn(0.5 + Math.max(-1, Math.min(1, t / SCARTO_MAX)) / 2);
  function coloreModo(v) {
    if (modo === "cluster") return VP.stato.clusters.get(v).colore;
    const b = datoSurvey(v); if (!b) return INSUFF;
    if (modo === "dominante") return colVal()[d3.maxIndex(b.valori)];
    if (modo === "intensita") return scalaIntensita(valSel)((b.valori[valSel] - 1) / 4);
    if (modo === "conflitto") { const [a, z] = estremiConflitto(), q = conflittoPrincipale(b)?.q || 0; return scalaConflitto(z > a ? 0.15 + 0.85 * (q - a) / (z - a) : 0.6); }
    if (modo === "scarto") return scalaScarto(b.direzioni[valSel] - b.valori[valSel]);
    return INSUFF;
  }
  function annotazione(v) {
    const c = VP.stato.clusters.get(v);
    if (modo === "cluster") return c.titolo || c.nome;
    const b = datoSurvey(v); if (!b) return VP.t("dati insufficienti");
    const D = VP.stato.survey;
    if (modo === "dominante") { const i = d3.maxIndex(b.valori); return `${D.valori[i]} · ${fmt1(b.valori[i])}`; }
    if (modo === "intensita") return `${D.valori[valSel]} · ${fmt1(b.valori[valSel])}`;
    if (modo === "conflitto") { const k = conflittoPrincipale(b); return k ? `${k.coppia} · ${Math.round(k.q * 100)}%` : "–"; }
    if (modo === "scarto") { const d = b.direzioni[valSel] - b.valori[valSel]; return VP.t("{d} (priorità {p}, percezione {v})", { d: (d > 0 ? "+" : "") + fmt1(d), p: fmt1(b.direzioni[valSel]), v: fmt1(b.valori[valSel]) }); }
  }

  // ---- Sistemi di riferimento -------------------------------------------------------------
  // Il raster resta nella sua proiezione originale (es. EPSG:3035): Leaflet lavora in lon/lat, quindi
  // la posizione del mouse viene proiettata nel CRS del raster per leggere la cella esatta.
  const PROJ_DEF = {
    3035: "+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    25832: "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    25833: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    32632: "+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs",
    32633: "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
    32634: "+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs",
    6707: "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
    6708: "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  };
  let toRaster, fromRaster, metrico = false;
  function impostaCRS(epsg) {
    if (epsg === 4326) { toRaster = ll => [ll.lng, ll.lat]; fromRaster = (x, y) => L.latLng(y, x); return; }
    if (epsg === 3857) {
      toRaster = ll => { const p = L.CRS.EPSG3857.project(ll); return [p.x, p.y]; };
      fromRaster = (x, y) => L.CRS.EPSG3857.unproject(L.point(x, y)); return;
    }
    const def = (VP.stato.config.mappa.proj4 || {})[epsg] || PROJ_DEF[epsg];
    if (!def) throw new Error(`Proiezione EPSG:${epsg} non riconosciuta: aggiungi la sua definizione proj4 in config.json → mappa.proj4`);
    const pr = proj4("EPSG:4326", def);
    toRaster = ll => pr.forward([ll.lng, ll.lat]);
    fromRaster = (x, y) => { const q = pr.inverse([x, y]); return L.latLng(q[1], q[0]); };
    metrico = true;
  }

  // Riga/colonna del raster sotto una coordinata
  function valoreA(latlng) {
    if (!georaster) return null;
    const [x, y] = toRaster(latlng);
    const col = Math.floor((x - georaster.xmin) / georaster.pixelWidth);
    const row = Math.floor((georaster.ymax - y) / georaster.pixelHeight);
    if (col < 0 || row < 0 || col >= georaster.width || row >= georaster.height) return null;
    const v = georaster.values[0][row][col];
    if (v == null || v === georaster.noDataValue || v === 0) return null;
    return { v, row, col };
  }

  // I 4 vertici della cella nel CRS del raster, riportati in lon/lat (in 3035 la cella appare leggermente ruotata)
  function verticiCella(row, col) {
    const g = georaster, x0 = g.xmin + col * g.pixelWidth, x1 = x0 + g.pixelWidth;
    const y1 = g.ymax - row * g.pixelHeight, y0 = y1 - g.pixelHeight;
    return [fromRaster(x0, y0), fromRaster(x1, y0), fromRaster(x1, y1), fromRaster(x0, y1)];
  }

  // Superficie di una cella in m² (solo per proiezioni metriche non distorte; null altrimenti)
  const areaCella = () => metrico && georaster ? georaster.pixelWidth * georaster.pixelHeight : null;

  function legenda() {
    const ctl = L.control({ position: "bottomright" });
    ctl.onAdd = () => {
      legendEl = L.DomUtil.create("div", "legend");
      L.DomEvent.disableClickPropagation(legendEl);
      L.DomEvent.disableScrollPropagation(legendEl);
      const D = VP.stato.survey;
      if (D) {
        const ctrl = L.DomUtil.create("div", "lg-ctrl", legendEl);
        ctrl.innerHTML = `<button class="lg-min" type="button" title="${VP.t("Riduci / espandi la legenda")}" aria-label="${VP.t("Riduci la legenda")}">–</button>` +
          `<label>${VP.t("Colora per")} <select id="map-modo">${MODI.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>` +
          `<select id="map-valore" hidden>${D.valori.map((v, i) => `<option value="${i}">${v}</option>`).join("")}</select>`;
        ctrl.querySelector("#map-modo").onchange = e => { modo = e.target.value; ridisegna(); };
        ctrl.querySelector("#map-valore").onchange = e => { valSel = +e.target.value; ridisegna(); };
        const min = ctrl.querySelector(".lg-min");
        min.onclick = () => { const c = legendEl.classList.toggle("ridotta"); min.textContent = c ? "+" : "–"; min.setAttribute("aria-label", c ? VP.t("Espandi la legenda") : VP.t("Riduci la legenda")); };
        // finché i dati della survey sono dimostrativi: pulsante info con la spiegazione
        if (D.demo) {
          const bi = L.DomUtil.create("button", "lg-info", ctrl);
          bi.type = "button"; bi.textContent = "i"; bi.title = VP.t("Informazioni sui dati della survey");
          bi.setAttribute("aria-label", VP.t("Informazioni sui dati della survey")); bi.setAttribute("aria-expanded", "false");
          const pan = L.DomUtil.create("div", "lg-info-pan", legendEl);
          pan.hidden = true; pan.setAttribute("role", "note");
          pan.innerHTML = `<p class="lg-info-tit">${VP.t("Dati dimostrativi")}</p>
            <p>${VP.t("Le colorazioni legate alla survey (<i>Valore dominante</i>, <i>Intensità di un valore</i>, <i>Conflitto principale</i>, <i>Scarto priorità – percezione</i>) sono esempi costruiti su <b>dati fittizi</b>.")}</p>
            <p>${VP.t("Servono a dare un'idea del tipo di risultati attesi dalla survey, ancora in corso, e non rappresentano risultati della ricerca. La colorazione <i>Cluster</i> mostra invece i risultati dell'analisi territoriale.")}</p>
            <button type="button" class="lg-info-chiudi">${VP.t("Chiudi")}</button>`;
          ctrl.after(pan);
          const apri = v => { pan.hidden = !v; bi.setAttribute("aria-expanded", String(v)); bi.classList.toggle("on", v); };
          bi.onclick = () => apri(pan.hidden);
          pan.querySelector(".lg-info-chiudi").onclick = () => apri(false);
        }
      }
      L.DomUtil.create("div", "lg-righe", legendEl);
      L.DomUtil.create("div", "lg-key", legendEl);
      aggiornaLegenda();
      return legendEl;
    };
    ctl.addTo(map);
  }
  function aggiornaLegenda() {
    if (!legendEl) return;
    const D = VP.stato.survey, sv = modo !== "cluster";
    const selV = legendEl.querySelector("#map-valore");
    if (selV) selV.hidden = !(modo === "intensita" || modo === "scarto");
    const righe = legendEl.querySelector(".lg-righe");
    righe.innerHTML = "";
    for (const c of VP.stato.clusters.values()) {
      const d = L.DomUtil.create("div", "lg-row", righe);
      d.dataset.id = c.id;
      const testo = `${VP.pad2(c.id)} · ${annotazione(c.id)}`;
      d.innerHTML = `<i style="background:${coloreModo(c.id)}"></i><span>${testo}</span>`;
      d.title = sv ? `${VP.pad2(c.id)} · ${c.titolo || c.nome}\n${annotazione(c.id)}` : testo;
      d.classList.toggle("on", c.id === VP.stato.clusterCorrente);
      d.onmouseenter = () => { if (!VP.stato.bloccato) VP.bus.emit("seleziona", c.id); };
      d.onclick = () => VP.bus.emit("blocca", c.id);
    }
    const key = legendEl.querySelector(".lg-key");
    if (!sv) { key.innerHTML = ""; key.hidden = true; return; }
    key.hidden = false;
    const grad = (fn, a, b) => `<div class="lg-grad" style="background:linear-gradient(90deg,${d3.range(0, 1.01, 0.1).map(fn).join(",")})"></div>` +
      `<div class="lg-ext"><span>${a}</span><span>${b}</span></div>`;
    let h = "";
    if (modo === "dominante") h = `<div class="lg-chips">${D.valori.map((v, i) => `<span><i style="background:${colVal()[i]}"></i>${v}</span>`).join("")}</div>`;
    if (modo === "intensita") h = grad(scalaIntensita(valSel), VP.t("1 debole"), VP.t("5 forte"));
    if (modo === "conflitto") { const [a, z] = estremiConflitto();
      h = grad(t => scalaConflitto(0.15 + 0.85 * t), `${Math.round(a * 100)}%`, VP.t("{z}% indica la coppia principale", { z: Math.round(z * 100) })); }
    if (modo === "scarto") h = grad(t => scalaScarto((t - 0.5) * 2 * SCARTO_MAX), VP.t("priorità < percezione"), VP.t("priorità > percezione"));
    const cl = VP.survey?.classe() || "tutti";
    const nomeCl = cl === "tutti" ? VP.t("tutti i portatori di interesse") : (D.classi.find(c => c.id === cl)?.nome || cl);
    h += `<div class="lg-nota">${nomeCl}${D.demo ? ` · <b>${VP.t("dati fittizi")}</b>` : ""}<br><i class="lg-insuff"></i>${VP.t("dati insufficienti (meno di {n} rispondenti)", { n: D.n_minimo })}</div>`;
    key.innerHTML = h;
  }
  function ridisegna() {
    aggiornaLegenda();
    if (layer) layer.updateColors(vals => coloreCluster(vals[0]));
  }

  // Confine dell'area di studio (GeoJSON in WGS84 / EPSG:4326, come richiesto dallo standard GeoJSON)
  async function caricaConfine() {
    const url = VP.stato.config.confine;
    if (!url) return null;
    let gj;
    try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); gj = await r.json(); }
    catch (e) { console.warn("Confine dell'area di studio non trovato:", url); return null; }
    const crs = gj.crs?.properties?.name || "";
    if (crs && !/4326|CRS84/i.test(crs))
      console.warn(`Il confine è in ${crs}: va riproiettato in EPSG:4326 (tools/prepara_dati.py --confine ...)`);
    const lay = L.geoJSON(gj, {
      interactive: false,   // non intercetta il mouse: la lettura dei cluster sotto resta attiva
      style: { color: "#1f2328", weight: 2.2, opacity: 0.9, fill: false, dashArray: "6 4" },
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 3 }),
    });
    const b = lay.getBounds();
    if (!b.isValid() || Math.abs(b.getNorth()) > 90 || Math.abs(b.getEast()) > 180) {
      console.warn("Coordinate del confine non in gradi lon/lat: riproiettare in EPSG:4326."); return null;
    }
    return lay;
  }

  async function init() {
    const cfg = VP.stato.config.mappa;
    opacita = cfg.opacita_cluster ?? 0.65;
    map = L.map("map", { zoomControl: true, preferCanvas: true, zoomSnap: 0.25 }).setView(cfg.centro, cfg.zoom);
    // Basemap senza API key. Rispettare le policy d'uso dei tile OSM (traffico moderato, attribuzione visibile).
    const osmAttr = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    const base = {
      [VP.t("OSM chiaro")]: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr, maxZoom: 19, className: "tiles-chiari" }),
      "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr, maxZoom: 19 }),
      "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr + ', SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 }),
      [VP.t("Ortofoto (Esri)")]: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri, Maxar, Earthstar Geographics", maxZoom: 19 }),
    };
    base[VP.t("OSM chiaro")].addTo(map);

    const buf = await fetch(VP.stato.config.raster_cluster, { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error("Raster dei cluster non trovato: " + VP.stato.config.raster_cluster); return r.arrayBuffer();
    });
    georaster = await parseGeoraster(buf);
    impostaCRS(georaster.projection);
    layer = new GeoRasterLayer({
      georaster, opacity: opacita, resolution: 256,
      pixelValuesToColorFn: vals => coloreCluster(vals[0]),
    });
    layer.addTo(map);
    const overlay = { "Cluster SuperSOM": layer };
    map.createPane("confine").style.zIndex = 450;   // sopra il raster dei cluster
    const confine = await caricaConfine();
    if (confine) {
      confine.eachLayer(l => l.options.pane = "confine");
      confine.addTo(map);
      overlay[VP.t("Confine area di studio")] = confine;
    }
    const foto = VP.foto.layerMappa(map);
    if (foto) { foto.addTo(map); overlay[VP.t("Foto reali ({n})", { n: foto.getLayers().length })] = foto; }
    map.fitBounds((confine || layer).getBounds(), { padding: [10, 10] });
    L.control.layers(base, overlay, { collapsed: true }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);
    legenda();

    hoverRect = L.polygon([[0, 0], [0, 0], [0, 0]], { color: "#111", weight: 1.5, fill: false, interactive: false });

    const slider = document.getElementById("opacity");
    slider.value = opacita;
    slider.oninput = () => layer.setOpacity(+slider.value);

    map.on("mousemove", e => {
      const hit = valoreA(e.latlng);
      if (hit) { hoverRect.setLatLngs(verticiCella(hit.row, hit.col)); if (!map.hasLayer(hoverRect)) hoverRect.addTo(map); }
      else hoverRect.remove();
      if (!VP.stato.bloccato) VP.bus.emit("seleziona", hit ? hit.v : null);
    });
    map.on("mouseout", () => hoverRect.remove());
    map.on("click", e => {
      const hit = valoreA(e.latlng);
      if (hit) { hoverRect.setLatLngs(verticiCella(hit.row, hit.col)); if (!map.hasLayer(hoverRect)) hoverRect.addTo(map); }
      if (!hit) { hoverRect.remove(); VP.bus.emit("deseleziona"); }   // clic fuori dalle celle: tutti i cluster visibili
      else if (VP.stato.bloccato && hit.v === VP.stato.clusterCorrente) VP.bus.emit("sblocca");
      else VP.bus.emit("blocca", hit.v);
    });
  }

  // Ridisegna i colori (evidenziazione) quando cambia il cluster
  let pending = null;
  VP.bus.on("cluster", id => {
    if (legendEl) legendEl.querySelectorAll(".lg-row").forEach(d => d.classList.toggle("on", +d.dataset.id === id));
    if (!layer) return;
    clearTimeout(pending);
    pending = setTimeout(() => layer.updateColors(vals => coloreCluster(vals[0])), 40);
  });

  VP.bus.on("classe", () => { if (modo !== "cluster") ridisegna(); else aggiornaLegenda(); });

  return { init, areaCella, valoreA };
})();
