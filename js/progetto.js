// Sezione "Il progetto": pagina informativa caricata da data/progetto.html, raggiungibile dal menu in alto
// (#progetto) e chiusa tornando alla dashboard (#dashboard). Indice laterale generato dalle sezioni.
VP.progetto = (() => {
  let vista, caricata = false;

  // significato degli indicatori (dal testo di riferimento), per codice variabile
  const SIGNIFICATO = {
    "visibility.vis_agri_share": "Quota di visibilità dei sistemi agricoli tradizionali: uliveti e vigneti.",
    "visibility.vis_anthropic_share": "Quota di visibilità degli elementi produttivi ed energetici: aree produttive, fotovoltaico, eolico.",
    "visibility.vis_landmark_share": "Quota di visibilità, in secondo piano, della fascia sommitale del vulcano come landmark naturale.",
    "visibility.vis_total_intensity": "Intensità complessiva della visibilità degli elementi distintivi (analisi di intervisibilità).",
    "hist_cult_index": "Emergenza della componente storico-culturale rispetto al contesto: densità di elementi culturali e visibilità dei centri storici.",
    "morphology.relief_context": "Variabilità altimetrica entro 2 km: valori alti per morfologie mosse, bassi per aree pianeggianti.",
    "morphology.terrain_enclosure": "Grado di apertura o chiusura del paesaggio, dalla posizione topografica relativa della cella.",
    "morphology.distance_to_volcano": "Distanza dal perimetro dell'edificio vulcanico: negativa all'interno, positiva all'esterno.",
    "ecology.shannon": "Diversità delle categorie di copertura del suolo presenti nella cella.",
    "ecology.hemeroby": "Grado medio di antropizzazione, dalla riclassificazione dell'uso del suolo.",
    "ecology.water_presence_500m": "Quota media di superficie occupata da corpi idrici entro 500 m.",
    "ecology.forest_presence_500m": "Quota media di superficie forestale entro 500 m.",
  };
  const SIGNIFICATO_EN = {
    "visibility.vis_agri_share": "Share of visibility of traditional agricultural systems: olive groves and vineyards.",
    "visibility.vis_anthropic_share": "Share of visibility of productive and energy elements: productive areas, photovoltaics, wind power.",
    "visibility.vis_landmark_share": "Share of visibility, in the background, of the summit area of the volcano as a natural landmark.",
    "visibility.vis_total_intensity": "Overall intensity of the visibility of distinctive elements (intervisibility analysis).",
    "hist_cult_index": "Emergence of the historical-cultural component in its context: density of cultural elements and visibility of historic centres.",
    "morphology.relief_context": "Elevation variability within 2 km: high values for rugged landforms, low for flat areas.",
    "morphology.terrain_enclosure": "Degree of openness or enclosure of the landscape, from the relative topographic position of the cell.",
    "morphology.distance_to_volcano": "Distance from the perimeter of the volcanic edifice: negative inside, positive outside.",
    "ecology.shannon": "Diversity of the land cover categories present in the cell.",
    "ecology.hemeroby": "Average degree of human transformation, from the reclassification of land use.",
    "ecology.water_presence_500m": "Average share of surface occupied by water bodies within 500 m.",
    "ecology.forest_presence_500m": "Average share of forest surface within 500 m.",
  };
  const DIMENSIONE = { "Visibilità": "Visivo-percettiva", "Storia e cultura": "Storico-culturale", "Morfologia": "Morfologica", "Ecologia": "Ecologica",
    "Visibility": "Visual-perceptual", "History and culture": "Historical-cultural", "Morphology": "Morphological", "Ecology": "Ecological" };
  const significato = cod => (VP.lingua.L === "en" ? SIGNIFICATO_EN : SIGNIFICATO)[cod] || "";

  function crea() {
    vista = document.createElement("div");
    vista.className = "progetto"; vista.id = "vista-progetto"; vista.hidden = true;
    vista.innerHTML = `<nav class="pg-indice" aria-label="${VP.t("Indice")}"></nav><article class="pg-testo"><p class="muted">${VP.t("Caricamento…")}</p></article>`;
    document.body.appendChild(vista);
  }

  async function carica() {
    if (caricata) return;
    const testo = vista.querySelector(".pg-testo");
    try {
      const r = await VP.lingua.fetchLingua("data/progetto.html", { cache: "no-cache" });
      if (!r.ok) throw new Error(r.status);
      testo.innerHTML = await r.text();
    } catch (e) {
      testo.innerHTML = `<p class="muted">${VP.t("Testo del progetto non disponibile ({f}).", { f: VP.lingua.fileLingua("data/progetto.html") })}</p>`; return;
    }
    caricata = true;
    // figure facoltative: se l'immagine manca la figura non compare
    testo.querySelectorAll(".pg-fig[data-opz] img").forEach(img => {
      img.addEventListener("error", () => img.closest(".pg-fig").remove());
      img.addEventListener("load", () => img.closest(".pg-fig").classList.add("ok"));
      img.addEventListener("click", () => {
        const lb = document.getElementById("lightbox");
        lb.querySelector("img").src = img.src; lb.querySelector("p").textContent = img.closest("figure").querySelector("figcaption")?.textContent || ""; lb.hidden = false;
      });
    });
    autoIndicatori(testo.querySelector('[data-auto="indicatori"]'));
    await autoCluster(testo.querySelector('[data-auto="cluster"]'));
    indice(testo);
  }

  function indice(testo) {
    const nav = vista.querySelector(".pg-indice");
    const sez = [...testo.querySelectorAll(".pg-sez")];
    nav.innerHTML = `<div class="pg-indice-tit">${VP.t("Il progetto")}</div>` + sez.map(s =>
      `<a href="#progetto/${s.id}" data-id="${s.id}">${s.dataset.titolo || s.querySelector("h2,h1")?.textContent || s.id}</a>`).join("");
    nav.querySelectorAll("a").forEach(a => a.onclick = e => { e.preventDefault(); vai(a.dataset.id); });
    // voce attiva durante lo scorrimento
    const obs = new IntersectionObserver(ents => ents.forEach(en => {
      if (en.isIntersecting) nav.querySelectorAll("a").forEach(a => a.classList.toggle("on", a.dataset.id === en.target.id));
    }), { rootMargin: "-20% 0px -70% 0px" });
    sez.forEach(s => obs.observe(s));
    // link interni del testo (#catena, #partecipazione, #dashboard)
    testo.querySelectorAll('a[href^="#"]').forEach(a => a.onclick = e => {
      const h = a.getAttribute("href").slice(1);
      e.preventDefault();
      if (h === "dashboard") return chiudi(true);
      vai(h);
    });
  }

  function vai(id) {
    const el = vista.querySelector("#" + CSS.escape(id));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#progetto/${id}`);
    aggiornaMenu(id === "uso" ? "uso" : "progetto");
  }

  function autoIndicatori(box) {
    if (!box) return;
    const vars = VP.stato.stats?.variabili || [];
    let gruppo = null, righe = "";
    for (const v of vars) {
      const g = DIMENSIONE[v.gruppo] || v.gruppo || "";
      righe += `<tr><td>${g !== gruppo ? `<b>${g}</b>` : ""}</td><td><b>${v.nome}</b><br><code>${v.codice || ""}</code></td><td>${significato(v.codice)}</td></tr>`;
      gruppo = g;
    }
    box.innerHTML = `<div class="pg-tabella"><table><thead><tr><th>${VP.t("Dimensione")}</th><th>${VP.t("Indicatore")}</th><th>${VP.t("Significato")}</th></tr></thead><tbody>${righe}</tbody></table></div>`;
  }

  async function autoCluster(box) {
    if (!box) return;
    const area = VP.mappa.areaCella?.();
    const cl = [...VP.stato.clusters.values()].sort((a, b) => a.id - b.id);
    const galleria = box.dataset.stile === "galleria";
    box.className = "pg-cluster" + (galleria ? " pg-galleria" : "");
    box.innerHTML = cl.map(c => {
      const t = VP.testi.get(c.id), intro = t?.descrizione?.[0] || "";
      const km = area ? ` · ${VP.lingua.num(c.n_celle * area / 1e6, { maximumFractionDigits: 1 })} km²` : "";
      return `<article class="pg-card" style="--ccol:${c.colore}">
        <div class="pg-card-img" data-id="${c.id}"></div>
        <div class="pg-card-corpo"><div class="pg-card-num">Cluster ${VP.pad2(c.id)}<span>${VP.t("{n} celle", { n: VP.lingua.num(c.n_celle) })}${km}</span></div>
        <h4>${c.titolo || c.nome}</h4>${galleria ? "" : `<p>${intro.length > 260 ? intro.slice(0, 257).replace(/\s+\S*$/, "") + "…" : intro}</p>`}
        <button class="pg-btn" data-esplora="${c.id}">${galleria ? VP.t("Esplora") : VP.t("Esplora nella dashboard")}</button></div></article>`;
    }).join("");
    box.querySelectorAll("[data-esplora]").forEach(b => b.onclick = () => { chiudi(true); VP.bus.emit("blocca", +b.dataset.esplora); });
    for (const c of cl) {
      const url = await VP.immagini.fotosferica(c.id);
      const d = box.querySelector(`.pg-card-img[data-id="${c.id}"]`);
      if (url) d.style.backgroundImage = `url("${url}")`; else d.classList.add("vuota");
    }
  }

  async function apri(sezione) {
    if (!vista) crea();
    vista.hidden = false;
    document.body.classList.add("vista-progetto");
    aggiornaMenu(sezione === "uso" ? "uso" : "progetto");
    await carica();
    if (sezione) vai(sezione); else { vista.scrollTop = 0; window.scrollTo(0, 0); }
  }
  function chiudi(aggiornaHash) {
    if (vista) vista.hidden = true;
    document.body.classList.remove("vista-progetto");
    aggiornaMenu("dashboard");
    if (aggiornaHash) history.replaceState(null, "", "#dashboard");
    window.dispatchEvent(new Event("resize"));   // la mappa e i grafici ricalcolano le dimensioni
  }
  function aggiornaMenu(voce) {
    document.querySelectorAll(".menu a").forEach(a => a.classList.toggle("on", a.dataset.voce === voce));
  }

  function daHash() {
    const h = location.hash.slice(1);
    if (h.startsWith("progetto")) apri(h.split("/")[1]);
    else chiudi(false);
  }

  function init() {
    document.querySelectorAll(".menu a").forEach(a => a.onclick = e => {
      e.preventDefault();
      if (a.dataset.voce === "progetto") { history.replaceState(null, "", "#progetto"); apri(); }
      else if (a.dataset.voce === "uso") { history.replaceState(null, "", "#progetto/uso"); apri("uso"); }
      else chiudi(true);
    });
    window.addEventListener("hashchange", daHash);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && vista && !vista.hidden && document.querySelector(".modale")?.hidden !== false && document.getElementById("lightbox").hidden) chiudi(true); });
    daHash();
  }

  return { init, apri, chiudi };
})();
