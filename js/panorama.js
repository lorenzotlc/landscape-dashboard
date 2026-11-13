// Vista sferica navigabile in modo orbitale (Pannellum), SENZA aggiungere informazione sintetica:
// la foto originale viene proiettata su una porzione di sfera pari al suo angolo di campo (hfov_foto)
// e si "naviga" solo dentro la foto. Avvio: zoom sulla fascia verticalmente centrale, partenza dal
// bordo sinistro della foto e rotazione lenta verso destra (rimbalza ai bordi). Si ferma quando
// l'utente trascina e riprende dopo qualche secondo di inattività.
// Parametri in data/config.json -> immagini.panorama.
VP.panorama = (() => {
  let viewer = null, token = 0;
  const segnaposti = new Map();

  const opz = () => Object.assign({ hfov_foto: 100, zoom_iniziale: 0.5, rotazione_automatica: 3, ripresa_rotazione_ms: 4000, soglia_sferica: null },
    VP.stato.config.immagini.panorama || {});

  function dimensioni(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = rej; im.src = url;
    });
  }

  // Foto segnaposto 16:9 nei toni del cluster (finché la foto reale non c'è)
  function segnaposto(id, nome) {
    const neutro = id == null, chiave = neutro ? "neutro" : id;
    if (segnaposti.has(chiave)) return segnaposti.get(chiave);
    const W = 1920, H = 1080, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"), col = d3.color(neutro ? VP.COLORE_NEUTRO : VP.stato.clusters.get(id)?.colore || "#888");
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, neutro ? "#bdb1b4" : "#9fb9cc"); sky.addColorStop(1, neutro ? "#f1ecec" : "#eef0ea");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    let s = (neutro ? 3 : id) * 7919;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    [0, 1, 2].forEach(i => {
      ctx.beginPath(); ctx.moveTo(0, H);
      let y = H * 0.5 + i * 40;
      for (let x = 0; x <= W; x += 60) { y = Math.min(H * 0.7, Math.max(H * 0.3, y + (rnd() - 0.5) * (90 - i * 20))); ctx.lineTo(x, y); }
      ctx.lineTo(W, H); ctx.closePath();
      ctx.fillStyle = d3.interpolateRgb(neutro ? "#ece6e6" : "#e3ebe5", col.darker(i * 0.7))(0.45 + i * 0.2); ctx.fill();
    });
    ctx.fillStyle = col.darker(1.6); ctx.fillRect(0, H * 0.72, W, H);
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.85)";
    if (!neutro) [0.2, 0.5, 0.8].forEach(f => {
      ctx.font = "600 34px system-ui, sans-serif";
      ctx.fillText(neutro ? "Seleziona un cluster sulla mappa" : `Segnaposto · cluster ${VP.pad2(id)}`, W * f, H * 0.82);
      ctx.font = "24px system-ui, sans-serif";
      ctx.fillText(neutro ? "la vista sferica del cluster comparirà qui" : `cluster_${VP.pad2(id)}/${VP.stato.config.immagini.fotosferica}.jpg`, W * f, H * 0.82 + 38);
    });
    if (neutro) { const url = cv.toDataURL("image/jpeg", 0.85); segnaposti.set(chiave, url); return url; }
    // linee verticali di riferimento ai bordi per verificare il punto di partenza della rotazione
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "600 28px system-ui, sans-serif";
    ctx.textAlign = "right"; ctx.fillText("bordo destro →", W - 20, H * 0.5);
    ctx.textAlign = "left"; ctx.fillText("← bordo sinistro", 20, H * 0.5);
    const url = cv.toDataURL("image/jpeg", 0.85);
    segnaposti.set(chiave, url); return url;
  }

  async function configura(url, id, nome) {
    const o = opz(), src = url || segnaposto(id, nome);
    const d = await dimensioni(src);
    const ratio = d.w / d.h;
    const sferica = o.soglia_sferica != null && ratio >= o.soglia_sferica;   // solo foto 360° reali (es. da fotocamera sferica)
    const haov = sferica ? 360 : o.hfov_foto, vaov = sferica ? Math.min(180, 360 / ratio) : haov / ratio;
    const hfov0 = Math.max(20, Math.min(haov * o.zoom_iniziale, 120));
    const cfg = {
      type: "equirectangular", panorama: src, autoLoad: true, showControls: true, showFullscreenCtrl: true,
      compass: false, mouseZoom: true, avoidShowingBackground: !sferica,
      haov, vaov, hfov: hfov0, minHfov: 15, maxHfov: Math.min(haov * 0.98, 120),
      minPitch: -vaov / 2, maxPitch: vaov / 2,
      pitch: 0,                                   // fascia verticalmente centrale
      yaw: sferica ? 0 : -haov / 2,               // bordo sinistro (Pannellum lo limita in modo che la vista resti nella foto)
      // autoRotate < 0 = rotazione verso destra; ai bordi della foto la direzione si inverte
      autoRotate: o.rotazione_automatica ? -Math.abs(o.rotazione_automatica) : false,
      autoRotateInactivityDelay: o.rotazione_automatica ? o.ripresa_rotazione_ms : -1,
    };
    if (!sferica) Object.assign(cfg, { minYaw: -haov / 2, maxYaw: haov / 2 });
    return { cfg, sferica, haov };
  }

  async function mostra(url, id, nome) {
    const my = ++token;
    let r;
    try { r = await configura(url, id, nome); } catch (e) { return; }
    if (my !== token) return;
    const { cfg, sferica, haov } = r;
    if (viewer) { try { viewer.destroy(); } catch (e) {} viewer = null; }
    viewer = pannellum.viewer("pano", cfg);
    document.getElementById("pano").dataset.tipo = sferica ? "360°" : `foto ${Math.round(haov)}°`;
  }

  // secondo visore indipendente (stessa impostazione e animazione) in un altro contenitore
  async function crea(contenitore, url, id, nome) {
    const { cfg } = await configura(url, id, nome);
    return pannellum.viewer(contenitore, cfg);
  }

  return { mostra, crea, viewer: () => viewer };
})();
