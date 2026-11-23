// Avvio: carica configurazione e dati, inizializza i pannelli, gestisce selezione/blocco del cluster.
(async () => {
  const S = VP.stato;
  const getJSON = async (p, opz = false) => {
    const r = await fetch(p, { cache: "no-cache" });
    if (!r.ok) { if (opz) return null; throw new Error(`File non trovato: ${p}`); }
    return r.json();
  };
  try {
    S.config = await getJSON("data/config.json");
    const [cl, st, sv] = await Promise.all([getJSON(S.config.cluster), getJSON(S.config.statistiche), S.config.survey ? getJSON(S.config.survey, true) : null]);
    cl.cluster.forEach(c => S.clusters.set(c.id, c));
    S.stats = st; S.survey = sv;
    document.getElementById("titolo").textContent = S.config.titolo;
    document.getElementById("sottotitolo").textContent = S.config.sottotitolo || "";
    document.title = S.config.titolo;
    document.getElementById("demo-badge").hidden = !S.config.dati_dimostrativi;

    await Promise.all([VP.testi.carica(), VP.foto.carica()]);
    VP.testi.init(); VP.boxplot.init(); VP.immagini.init(); VP.foto.init(); VP.survey.init();
    await VP.mappa.init();
    VP.progetto.init();
  } catch (e) {
    console.error(e);
    document.querySelector(".grid").innerHTML = `<div class="panel" style="grid-column:1/-1;grid-row:1/-1;padding:24px">
      <h2>Impossibile avviare la dashboard</h2><p>${e.message}</p>
      <p>Avvia l'applicazione da un server locale (es. <code>./avvia.sh</code> oppure <code>python3 -m http.server</code>) e non aprendo direttamente index.html.</p></div>`;
    return;
  }

  function aggiornaTestata() {
    const id = S.clusterCorrente, c = S.clusters.get(id);
    // Titolo grande del cluster corrente (scheda sotto la testata)
    const nome = document.getElementById("sch-nome"), scheda = document.getElementById("scheda");
    const nuovo = c ? `${c.titolo || c.nome}` : "Esplora i cluster di paesaggio";
    if (nome.textContent !== nuovo) { scheda.classList.remove("cambio"); void scheda.offsetWidth; scheda.classList.add("cambio"); }
    nome.textContent = nuovo; nome.title = nuovo;
    document.getElementById("sch-meta").textContent = c
      ? [`Cluster ${VP.pad2(id)}`, `${(c.n_celle ?? 0).toLocaleString("it-IT")} celle`,
         VP.mappa.areaCella() ? `${(c.n_celle * VP.mappa.areaCella() / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km²` : ""]
          .filter(Boolean).join(" · ")
      : "Passa il mouse su una cella della mappa";
    document.getElementById("sch-fisso").hidden = !S.bloccato;
    document.getElementById("hint-top").textContent = S.bloccato
      ? "Cluster fisso · clic sulla mappa o Esc per sbloccare" : "Passa il mouse sulla mappa · clic per fissare il cluster · Esc per sbloccare";
    document.documentElement.style.setProperty("--cur", c ? c.colore : "#ccc");
  }

  document.getElementById("logo").onclick = () => VP.modale.apri({ sopra: "Dottorato di ricerca", titolo: "PhD Landscape Studies for Global and Local Challenges",
    colore: "#0d2f5a", html: `<p style="text-align:center;margin:8px 0 0"><img src="assets/logo.png" alt="" style="max-width:min(420px,100%);height:auto"></p>` });

  VP.bus.on("seleziona", id => {
    if (id == null || id === S.clusterCorrente) return;   // fuori dal raster: mantieni l'ultimo cluster
    S.clusterCorrente = id; aggiornaTestata(); VP.bus.emit("cluster", id);
  });
  VP.bus.on("blocca", id => { S.bloccato = true; S.clusterCorrente = null; VP.bus.emit("seleziona", id); aggiornaTestata(); VP.bus.emit("blocco", true); });
  // nessun cluster selezionato: mappa con tutti i cluster all'opacità impostata, pannelli nello stato iniziale
  VP.bus.on("deseleziona", () => {
    const era = S.bloccato;
    S.bloccato = false; S.clusterCorrente = null; aggiornaTestata();
    VP.bus.emit("cluster", null);
    if (era) VP.bus.emit("blocco", false);
  });
  VP.bus.on("sblocca", () => { S.bloccato = false; aggiornaTestata(); VP.bus.emit("blocco", false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && S.bloccato) VP.bus.emit("sblocca"); });
})();
