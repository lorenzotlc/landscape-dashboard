// Avvio: carica configurazione e dati, inizializza i pannelli, gestisce selezione/blocco del cluster.
(async () => {
  const S = VP.stato;
  const getJSON = async (p, opz = false) => {
    const r = await fetch(p, { cache: "no-cache" });
    if (!r.ok) { if (opz) return null; throw new Error(VP.t("File non trovato: {p}", { p })); }
    return r.json();
  };
  try {
    VP.lingua.traduciDOM(); VP.lingua.selettore();
    S.config = await getJSON("data/config.json");
    const [cl, st, sv] = await Promise.all([getJSON(S.config.cluster), getJSON(S.config.statistiche), S.config.survey ? getJSON(S.config.survey, true) : null]);
    cl.cluster.forEach(c => S.clusters.set(c.id, c));
    S.stats = st; S.survey = sv;
    await VP.lingua.localizzaDati(S);
    document.getElementById("titolo").textContent = S.config.titolo;
    document.getElementById("sottotitolo").textContent = S.config.sottotitolo || "";
    document.title = S.config.titolo;
    document.getElementById("demo-badge").hidden = !S.config.dati_dimostrativi;

    await Promise.all([VP.testi.carica(), VP.foto.carica()]);
    VP.testi.init(); VP.boxplot.init(); VP.immagini.init(); VP.foto.init(); VP.survey.init();
    await VP.mappa.init();
    VP.progetto.init();
    espansione();
  } catch (e) {
    console.error(e);
    document.querySelector(".grid").innerHTML = `<div class="panel" style="grid-column:1/-1;grid-row:1/-1;padding:24px">
      <h2>${VP.t("Impossibile avviare la dashboard")}</h2><p>${e.message}</p>
      <p>${VP.t("Avvia l'applicazione da un server locale (es. <code>./avvia.sh</code> oppure <code>python3 -m http.server</code>) e non aprendo direttamente index.html.")}</p></div>`;
    return;
  }

  function aggiornaTestata() {
    const id = S.clusterCorrente, c = S.clusters.get(id);
    // Titolo grande del cluster corrente (scheda sotto la testata)
    const nome = document.getElementById("sch-nome"), scheda = document.getElementById("scheda");
    const nuovo = c ? `${c.titolo || c.nome}` : VP.t("Esplora i cluster di paesaggio");
    if (nome.textContent !== nuovo) { scheda.classList.remove("cambio"); void scheda.offsetWidth; scheda.classList.add("cambio"); }
    nome.textContent = nuovo; nome.title = nuovo;
    document.getElementById("sch-meta").textContent = c
      ? [`Cluster ${VP.pad2(id)}`, VP.t("{n} celle", { n: VP.lingua.num(c.n_celle) }),
         VP.mappa.areaCella() ? `${VP.lingua.num(c.n_celle * VP.mappa.areaCella() / 1e6, { maximumFractionDigits: 1 })} km²` : ""]
          .filter(Boolean).join(" · ")
      : VP.t("Passa il mouse su una cella della mappa");
    document.getElementById("sch-fisso").hidden = !S.bloccato;
    document.getElementById("hint-top").textContent = S.bloccato
      ? VP.t("Cluster fisso · clic sulla mappa o Esc per sbloccare") : VP.t("Passa il mouse sulla mappa · clic per fissare il cluster · Esc per sbloccare");
    document.documentElement.style.setProperty("--cur", c ? c.colore : "#ccc");
  }

  document.getElementById("logo").onclick = () => VP.modale.apri({ sopra: VP.t("Dottorato di ricerca"), titolo: "PhD Landscape Studies for Global and Local Challenges",
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
  // Esc: se c'è un pannello ingrandito (e nessuna finestra aperta sopra) torna ai 4 pannelli; altrimenti sblocca il cluster
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    const sopra = document.querySelector(".modale:not([hidden]), #lightbox:not([hidden]), .confronto:not([hidden])");
    if (!sopra && !document.body.classList.contains("vista-progetto") && document.querySelector(".grid[data-espanso]")) { VP.espandi(null); return; }
    if (S.bloccato) VP.bus.emit("sblocca");
  });

  // Ingrandimento di un pannello di destra: occupa lo spazio dei 4 pannelli, affiancato alla mappa (solo desktop/tablet).
  function espansione() {
    const pannelli = [["p-street", VP.t("l'ipotesi visuale dominante")], ["p-exc", VP.t("eccezioni locali e foto reali")],
                      ["p-box", VP.t("le variabili del cluster")], ["p-graph", VP.t("i dati della survey")]];
    const grid = document.querySelector(".grid");
    VP.espandi = classe => {
      VP.panorama.ripristina();   // memorizza l'inquadratura e ricrea il visore a cambio di dimensioni avvenuto (la tela WebGL può restare vuota)
      document.querySelectorAll(".grid > .panel").forEach(p => p.classList.toggle("espanso", !!classe && p.classList.contains(classe)));
      if (classe) grid.dataset.espanso = classe; else delete grid.dataset.espanso;
      document.querySelectorAll(".btn-espandi").forEach(b => {
        const on = b.dataset.pannello === classe;
        b.classList.toggle("on", on);
        b.title = on ? VP.t("Torna alla vista con tutti i pannelli (Esc)") : VP.t("Ingrandisci {nome}", { nome: b.dataset.nome });
        b.setAttribute("aria-label", b.title); b.setAttribute("aria-pressed", String(on));
      });
      window.dispatchEvent(new Event("resize"));   // mappa e ipotesi visuale ricalcolano le dimensioni
    };
    pannelli.forEach(([classe, nome]) => {
      const h = document.querySelector(`.${classe} .panel-h`); if (!h) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn-espandi"; b.dataset.pannello = classe; b.dataset.nome = nome;
      b.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><path class="ap" d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/><path class="ch" d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/></svg>`;
      b.onclick = () => VP.espandi(grid.dataset.espanso === classe ? null : classe);
      h.appendChild(b);
    });
    VP.espandi(null);
  }

  // dopo un cambio di lingua: ripristina cluster fissato e pannello ingrandito (qui, quando i gestori sono registrati)
  const salvato = VP.lingua.statoSalvato();
  if (salvato && salvato.cluster != null && S.clusters.has(salvato.cluster)) VP.bus.emit(salvato.bloccato ? "blocca" : "seleziona", salvato.cluster);
  if (salvato && salvato.espanso && window.matchMedia("(min-width:701px)").matches) VP.espandi(salvato.espanso);
})();
