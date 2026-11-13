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
    const cur = VP.stato.clusterCorrente, attenua = cur != null && cur !== v;
    const k = c.colore + attenua;
    if (!cacheColori.has(k)) cacheColori.set(k, attenua ? d3.interpolateRgb(c.colore, "#ffffff")(0.68) : c.colore);
    return cacheColori.get(k);
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
      for (const c of VP.stato.clusters.values()) {
        const d = L.DomUtil.create("div", "", legendEl);
        d.dataset.id = c.id;
        d.innerHTML = `<i style="background:${c.colore}"></i><span>${VP.pad2(c.id)} · ${c.titolo || c.nome}</span>`;
        d.title = `${VP.pad2(c.id)} · ${c.titolo || c.nome}`;
        d.onmouseenter = () => { if (!VP.stato.bloccato) VP.bus.emit("seleziona", c.id); };
        d.onclick = () => VP.bus.emit("blocca", c.id);
      }
      return legendEl;
    };
    ctl.addTo(map);
  }

  // Confine dell'area di studio (GeoJSON in WGS84 / EPSG:4326, come richiesto dallo standard GeoJSON)
  async function caricaConfine() {
    const url = VP.stato.config.confine;
    if (!url) return null;
    let gj;
    try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); gj = await r.json(); }
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
      "OSM chiaro": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr, maxZoom: 19, className: "tiles-chiari" }),
      "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr, maxZoom: 19 }),
      "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        { attribution: osmAttr + ', SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 }),
      "Ortofoto (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri, Maxar, Earthstar Geographics", maxZoom: 19 }),
    };
    base["OSM chiaro"].addTo(map);

    const buf = await fetch(VP.stato.config.raster_cluster).then(r => {
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
      overlay["Confine area di studio"] = confine;
    }
    const foto = VP.foto.layerMappa(map);
    if (foto) { foto.addTo(map); overlay[`Foto reali (${foto.getLayers().length})`] = foto; }
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
    if (legendEl) legendEl.querySelectorAll("div").forEach(d => d.classList.toggle("on", +d.dataset.id === id));
    if (!layer) return;
    clearTimeout(pending);
    pending = setTimeout(() => layer.updateColors(vals => coloreCluster(vals[0])), 40);
  });

  return { init, areaCella, valoreA };
})();
