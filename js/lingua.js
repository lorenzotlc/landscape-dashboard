// Lingua dell'interfaccia: italiano (predefinito) e inglese.
// - Le frasi nel codice sono scritte in italiano e passano da VP.t("…"); in inglese vengono sostituite con la voce
//   del dizionario EN (chiave = testo italiano). Segnaposto: VP.t("Cluster {n}", { n: 3 }).
// - HTML statico: attributi data-i18n (testo), data-i18n-title, data-i18n-aria (tradotti all'avvio).
// - Dati: campi "_en" (es. nome_en) e file affiancati in inglese (cluster_01.en.txt, didascalie.en.json, progetto.en.html).
// - Il cambio di lingua ricarica la pagina mantenendo cluster selezionato e pannello ingrandito; la scelta resta
//   memorizzata nel browser e un link con ?lang=en apre direttamente la versione inglese.
VP.lingua = (() => {
  const LINGUE = ["it", "en"];
  const leggi = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const q = new URLSearchParams(location.search).get("lang");
  const L = LINGUE.includes(q) ? q : (LINGUE.includes(leggi("vp-lingua")) ? leggi("vp-lingua") : "it");
  document.documentElement.lang = L;
  const loc = L === "en" ? "en-GB" : "it-IT";

  const EN = {
    // testata, menu, scheda del cluster
    "Paesaggio tra misura e percezione": "Landscape between Measurement and Perception",
    "Il progetto": "The project", "Come si usa": "How to use", "Sezioni": "Sections", "Lingua": "Language",
    "Passa il mouse sulla mappa · clic per fissare il cluster · Esc per sbloccare": "Hover over the map · click to pin the cluster · Esc to unpin",
    "Cluster fisso · clic sulla mappa o Esc per sbloccare": "Cluster pinned · click the map or press Esc to unpin",
    "dati dimostrativi": "demo data",
    "Esplora i cluster di paesaggio": "Explore the landscape clusters",
    "Passa il mouse su una cella della mappa": "Hover over a cell of the map",
    "fisso": "pinned", "Descrizione generale": "General description", "leggi tutto": "read more",
    "{n} celle": "{n} cells", "Dottorato di ricerca": "PhD programme",
    "File non trovato: {p}": "File not found: {p}",
    "Impossibile avviare la dashboard": "The dashboard could not be started",
    "Avvia l'applicazione da un server locale (es. <code>./avvia.sh</code> oppure <code>python3 -m http.server</code>) e non aprendo direttamente index.html.":
      "Start the application from a local server (e.g. <code>./avvia.sh</code> or <code>python3 -m http.server</code>) rather than opening index.html directly.",
    // pannelli
    "Mappa degli intorni percepiti": "Map of perceived surroundings", "Opacità": "Opacity",
    "Ipotesi visuale dominante": "Dominant visual hypothesis",
    "Lo scenario statisticamente dominante del cluster: l'immaginario più plausibile che la catena delle mediazioni (dati, modello, IA generativa) ha prodotto. Non è una fotografia di un luogo reale. Trascina l'immagine per guardarti intorno.":
      "The statistically dominant scenario of the cluster: the most plausible imagery produced by the chain of mediations (data, model, generative AI). It is not a photograph of a real place. Drag the image to look around.",
    "scenario statisticamente più plausibile, generato con IA a partire dai dati": "statistically most plausible scenario, generated with AI from the data",
    "segnaposto · {s}": "placeholder · {s}",
    "Leggi": "Read", "Leggi la descrizione dell'immagine centrale": "Read the description of the central image",
    "immagine sintetica centrale": "central synthetic image", "Immagine sintetica centrale · {nome}": "Central synthetic image · {nome}",
    "Eccezioni locali": "Local exceptions", "Eccezione {n}": "Exception {n}", "Eccezione {n} · {nome}": "Exception {n} · {nome}",
    "seleziona un cluster sulla mappa": "select a cluster on the map",
    "variazioni meno frequenti nel cluster, generate con IA": "less frequent variations within the cluster, generated with AI",
    "fotografie scattate nel cluster, da confrontare con l'ipotesi dominante": "photographs taken in the cluster, to compare with the dominant hypothesis",
    "Foto reali": "Real photos", "Leggi i testi delle eccezioni": "Read the texts of the exceptions",
    "Nessuna foto reale in questo cluster": "No real photos in this cluster",
    "Variabili del cluster": "Cluster variables", "intera area": "whole area", "mediane altri cluster": "medians of other clusters",
    "z-score rispetto all'intera area": "z-score relative to the whole area", "valori standardizzati": "standardised values",
    "mediana": "median", "baffi": "whiskers", "sotto": "below", "sopra": "above", "Intera area: mediana": "Whole area: median",
    "Dati della survey": "Survey data", "Valori e conflitti": "Values and conflicts", "Confronto": "Comparison",
    "Portatori di interesse": "Stakeholders",
    // ingrandimento dei pannelli
    "l'ipotesi visuale dominante": "the dominant visual hypothesis", "eccezioni locali e foto reali": "local exceptions and real photos",
    "le variabili del cluster": "the cluster variables", "i dati della survey": "the survey data",
    "Torna alla vista con tutti i pannelli (Esc)": "Back to the view with all panels (Esc)", "Ingrandisci {nome}": "Enlarge {nome}",
    // testi e finestre
    "Il nome del cluster e la sua descrizione compaiono qui.": "The name of the cluster and its description appear here.",
    "Testo descrittivo non ancora disponibile per questo cluster.": "Descriptive text not yet available for this cluster.",
    "Struttura centrale": "Central structure", "Eccezioni e tensioni interne": "Exceptions and internal tensions",
    "Immagine centrale · traduzione visuale": "Central image · visual translation", "Testo non disponibile.": "Text not available.",
    "Osservazioni generali": "General observations", "Nota.": "Note.", "Chiudi": "Close",
    // panorama
    "Segnaposto · cluster {n}": "Placeholder · cluster {n}", "bordo destro →": "right edge →", "← bordo sinistro": "← left edge",
    // foto reali e confronto
    "Fuori dai cluster": "Outside the clusters", "{q} m s.l.m.": "{q} m a.s.l.", "posizione corretta a mano ({n})": "position corrected by hand ({n})",
    "Confronto · immagine generata e foto reale": "Comparison · generated image and real photo",
    "Fotosferica (immagine centrale generata)": "Photosphere (generated central image)", "Foto reale": "Real photo",
    "Foto precedente": "Previous photo", "Foto successiva": "Next photo", "Ingrandisci": "Zoom in", "Riduci": "Zoom out", "Adatta": "Fit",
    "· {a} di {b}": "· {a} of {b}", "Foto fuori dai cluster": "Photo outside the clusters",
    // mappa
    "Valore dominante": "Dominant value", "Intensità di un valore": "Intensity of a value", "Conflitto principale": "Main conflict",
    "Scarto priorità – percezione": "Priority – perception gap", "dati insufficienti": "insufficient data",
    "{d} (priorità {p}, percezione {v})": "{d} (priority {p}, perception {v})",
    "Riduci / espandi la legenda": "Collapse / expand the legend", "Riduci la legenda": "Collapse the legend", "Espandi la legenda": "Expand the legend",
    "Colora per": "Colour by", "Informazioni sui dati della survey": "About the survey data",
    "Dati dimostrativi": "Demo data",
    "Le colorazioni legate alla survey (<i>Valore dominante</i>, <i>Intensità di un valore</i>, <i>Conflitto principale</i>, <i>Scarto priorità – percezione</i>) sono esempi costruiti su <b>dati fittizi</b>.":
      "The survey-based colourings (<i>Dominant value</i>, <i>Intensity of a value</i>, <i>Main conflict</i>, <i>Priority – perception gap</i>) are examples built on <b>fictitious data</b>.",
    "Servono a dare un'idea del tipo di risultati attesi dalla survey, ancora in corso, e non rappresentano risultati della ricerca. La colorazione <i>Cluster</i> mostra invece i risultati dell'analisi territoriale.":
      "They give an idea of the kind of results expected from the survey, which is still in progress, and do not represent research results. The <i>Cluster</i> colouring, instead, shows the results of the territorial analysis.",
    "1 debole": "1 weak", "5 forte": "5 strong", "{z}% indica la coppia principale": "{z}% cite the main pair",
    "priorità < percezione": "priority < perception", "priorità > percezione": "priority > perception",
    "tutti i portatori di interesse": "all stakeholders", "dati fittizi": "fictitious data",
    "dati insufficienti (meno di {n} rispondenti)": "insufficient data (fewer than {n} respondents)",
    "OSM chiaro": "OSM light", "Ortofoto (Esri)": "Orthophoto (Esri)", "Confine area di studio": "Study area boundary", "Foto reali ({n})": "Real photos ({n})",
    // pannello survey
    "Dati della survey non ancora disponibili.": "Survey data not yet available.",
    "Tutti i portatori di interesse": "All stakeholders",
    "Anteprima dimostrativa": "Demo preview",
    "I dati di questo pannello sono <b>fittizi</b>: sono stati generati per simulazione e non derivano dalla survey, ancora in corso.":
      "The data in this panel are <b>fictitious</b>: they were generated by simulation and do not come from the survey, which is still in progress.",
    "Servono solo a mostrare che cosa si immagina di poter restituire a partire dalle risposte raccolte: i valori attribuiti a ciascuna famiglia di paesaggio, i conflitti tra valori, le priorità di sviluppo, le parole ricorrenti e il confronto tra portatori di interesse.":
      "They only show what we expect to be able to report from the collected answers: the values attributed to each landscape family, the conflicts between values, the development priorities, the recurring words and the comparison between stakeholders.",
    "Non vanno letti né citati come risultati della ricerca. Lo stesso vale per la colorazione della mappa basata sulla survey.":
      "They should not be read or cited as research results. The same applies to the survey-based colouring of the map.",
    "Visualizza l'esempio": "Show the example",
    "tutte le famiglie di paesaggio": "all landscape families", "cluster {n}": "cluster {n}", "{n} rispondenti": "{n} respondents",
    "Rileggi l'avviso sui dati dimostrativi": "Read the notice on the demo data again", "dati fittizi · avviso": "fictitious data · notice",
    "Nessun dato per questa selezione.": "No data for this selection.",
    "Dati insufficienti: meno di {n} rispondenti in questa classe.<br>Per tutelare l'anonimato non vengono mostrati.":
      "Insufficient data: fewer than {n} respondents in this class.<br>They are not shown, to protect anonymity.",
    "Cerchio pieno: peso percepito del valore. Anello: priorità della direzione di sviluppo corrispondente.":
      "Filled circle: perceived weight of the value. Ring: priority of the corresponding development direction.",
    "Linee rosse: coppie di valori in conflitto; più la coppia è indicata, più i due valori sono distanti.":
      "Red lines: pairs of values in conflict; the more often a pair is cited, the further apart the two values are.",
    "Parole: termini ricorrenti nelle risposte libere (bordo tratteggiato = omissione: importante ma non rappresentato), legate ai valori a cui chi le cita dà un peso superiore alla media; linea più spessa = legame più forte.":
      "Words: recurring terms in the open answers (dashed border = omission: important but not represented), linked to the values to which those who cite them give an above-average weight; thicker line = stronger link.",
    "Trascina nodi e parole · rotella o due dita = zoom · doppio clic = vista iniziale.":
      "Drag nodes and words · mouse wheel or two fingers = zoom · double click = initial view.",
    "peso percepito": "perceived weight", "priorità": "priority", "conflitto = distanza": "conflict = distance",
    "parole": "words", "Meno parole": "Fewer words", "Più parole": "More words", "chiave": "keyword", "omissione": "omission",
    "nessuna parola citata da almeno {n} persone": "no word cited by at least {n} people",
    "Conflitto: {a} – {b}": "Conflict: {a} – {b}",
    "coppia indicata nel {q}% delle risposte": "pair cited in {q}% of the answers",
    "più alta la quota, più i due valori sono lontani": "the higher the share, the further apart the two values",
    "Valore {nome}": "Value: {nome}", "peso percepito: {v} su 5": "perceived weight: {v} out of 5",
    "priorità «{d}»: {v} su 5": "priority “{d}”: {v} out of 5", "tutti i rispondenti: {a} · {b}": "all respondents: {a} · {b}",
    "omissione (importante ma non rappresentato)": "omission (important but not represented)", "parola chiave": "keyword",
    "citata da {n} risposte ({q}%)": "cited in {n} answers ({q}%)", "citata da {n} persone ({q}%)": "cited by {n} people ({q}%)",
    "più legata a: {l}": "most linked to: {l}",
    "Conflitto": "Conflict", "{v} su 5": "{v} out of 5", "tutti i rispondenti": "all respondents", "più legata a": "most linked to",
    "chi la cita dà a questi valori un peso superiore alla media": "those who cite it give these values an above-average weight",
    "Riconoscibilità": "Recognisability", "Valori": "Values", "Priorità di sviluppo": "Development priorities",
    "clic per selezionare la classe": "click to select the class", "tutti: {v}": "all: {v}",
    "tutti": "all", "classi": "classes", "selezionata": "selected",
    "classi con meno di {n} rispondenti non mostrate": "classes with fewer than {n} respondents not shown",
    // pagina del progetto
    "Indice": "Contents", "Caricamento…": "Loading…", "Testo del progetto non disponibile ({f}).": "Project text not available ({f}).",
    "Dimensione": "Dimension", "Indicatore": "Indicator", "Significato": "Meaning",
    "Esplora": "Explore", "Esplora nella dashboard": "Explore in the dashboard",
  };

  function t(s, v) {
    let r = L === "en" && EN[s] != null ? EN[s] : s;
    if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
    return r;
  }
  const num = (x, opz) => (x ?? 0).toLocaleString(loc, opz);
  // campo di un oggetto dati nella lingua corrente: o.nome_en in inglese (se presente), altrimenti o.nome
  const campo = (o, k) => (L === "en" && o && o[k + "_en"] != null ? o[k + "_en"] : o ? o[k] : undefined);
  // file affiancato in inglese: "a/b.json" -> "a/b.en.json"
  const fileLingua = p => (L === "en" ? p.replace(/(\.[a-z0-9]+)$/i, ".en$1") : p);
  // fetch del file nella lingua corrente, con ricaduta sull'italiano se la traduzione manca
  async function fetchLingua(p, opz) {
    if (L === "en") { try { const r = await fetch(fileLingua(p), opz); if (r.ok) return r; } catch (e) {} }
    return fetch(p, opz);
  }

  function traduciDOM(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.textContent.trim()); });
    root.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.title); });
    root.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.getAttribute("aria-label"))); });
  }

  // Cambio lingua: salva la scelta e lo stato (cluster, pannello ingrandito), poi ricarica
  function imposta(l) {
    if (l === L) return;
    try { localStorage.setItem("vp-lingua", l); } catch (e) {}
    try {
      const g = document.querySelector(".grid");
      sessionStorage.setItem("vp-stato", JSON.stringify({ cluster: VP.stato.clusterCorrente, bloccato: VP.stato.bloccato, espanso: g?.dataset.espanso || null }));
    } catch (e) {}
    const u = new URL(location.href);
    if (l === "en") u.searchParams.set("lang", "en"); else u.searchParams.delete("lang");
    location.replace(u.toString());
  }
  function statoSalvato() {
    try { const s = JSON.parse(sessionStorage.getItem("vp-stato") || "null"); sessionStorage.removeItem("vp-stato"); return s; } catch (e) { return null; }
  }

  // Selettore IT | EN nella testata
  function selettore() {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const box = document.createElement("div");
    box.className = "lingua"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Lingua / Language");
    box.innerHTML = LINGUE.map(l => `<button type="button" data-l="${l}" class="${l === L ? "on" : ""}" aria-pressed="${l === L}" ` +
      `title="${l === "it" ? "Italiano" : "English"}" lang="${l}">${l.toUpperCase()}</button>`).join("");
    box.querySelectorAll("button").forEach(b => b.onclick = () => imposta(b.dataset.l));
    bar.appendChild(box);   // in fondo alla barra: a destra su desktop, accanto al titolo su mobile
  }

  // Traduzioni dei dati caricati (configurazione, variabili, survey): si sostituiscono i campi con quelli "_en",
  // così il resto del codice usa gli stessi nomi di campo in entrambe le lingue.
  async function localizzaDati(S) {
    if (L !== "en") return;
    const c = S.config;
    c.titolo = campo(c, "titolo"); c.sottotitolo = campo(c, "sottotitolo");
    try {
      const r = await fetch("data/etichette_variabili.json", { cache: "no-cache" });
      if (r.ok) {
        const et = new Map((await r.json()).variabili.map(v => [v.codice, v]));
        (S.stats?.variabili || []).forEach(v => { const e = et.get(v.codice); if (e) { v.nome = e.nome_en || v.nome; v.gruppo = e.gruppo_en || v.gruppo; } });
      }
    } catch (e) {}
    const D = S.survey;
    if (D && D.valori_en) {
      const mappa = new Map(D.valori.map((v, i) => [v, D.valori_en[i]]));
      for (const k of ["valori", "direzioni", "direzioni_estese", "riconoscibilita", "riconoscibilita_brevi", "dimensione"])
        if (D[k + "_en"]) D[k] = D[k + "_en"];
      D.classi.forEach(cl => { cl.nome = cl.nome_en || cl.nome; });
      const te = D.termini_en || {};
      for (const blocchi of Object.values(D.dati)) for (const b of Object.values(blocchi)) {
        if (!b) continue;
        const nc = {};
        for (const [k, n] of Object.entries(b.conflitti || {})) nc[k.split("|").map(x => mappa.get(x) || x).join("|")] = n;
        b.conflitti = nc;
        (b.termini || []).forEach(x => { x.t = te[x.t] || x.t; });
      }
    }
  }

  return { L, loc, t, num, campo, fileLingua, fetchLingua, traduciDOM, imposta, statoSalvato, selettore, localizzaDati };
})();
VP.t = VP.lingua.t;
