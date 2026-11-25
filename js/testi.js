// Testi descrittivi del paesaggio: un .txt per cluster (vedi data/testi/LEGGIMI.txt).
// Sezioni: titolo, descrizione generale, struttura centrale, eccezioni e tensioni, parte centrale,
// eccezioni (testo unico) oppure eccezione 1..4.
VP.testi = (() => {
  const dati = new Map();   // id -> { titolo, descrizione:[paragrafi], centrale:[...], eccezioni:[[...],...] }
  const RE_TITOLO = /^\s*#*\s*(note\s+sulle\s+eccezioni|osservazioni(?:\s+sulle\s+eccezioni)?|struttura\s+centrale|eccezioni\s+e\s+tensioni|tensioni(?:\s+interne)?|titolo|descrizione(?:\s+generale)?|(?:parte|immagine|paesaggio)?\s*centrale|eccezion[ei](?:\s*(\d+))?)\s*(?:[:\-–—]\s*(.*))?$/i;
  const RE_VOCE = /^\s*(?:\d+[.)]|[-•*])\s+(.*)$/;

  function decodifica(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }   // file salvati da Windows
  }
  const paragrafi = righe => righe.join("\n").split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);

  function analizza(txt) {
    const righe = txt.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
    const sez = {}; let cur = null, trovate = false;
    for (const r of righe) {
      const m = r.match(RE_TITOLO);
      if (m && ((m[3] !== undefined && r.trim().length < 300) || r.trim().length < 40)) {
        trovate = true;
        const k = m[1].toLowerCase();
        cur = k.startsWith("note") || k.startsWith("osserv") ? "osservazioni" : k.startsWith("struttura") ? "struttura" : k.includes("tensioni") ? "tensioni"
            : k.startsWith("titolo") ? "titolo" : k.startsWith("descr") ? "descrizione" : k.includes("centrale") ? "centrale"
            : m[2] ? "ecc" + (+m[2]) : "eccezioni";
        sez[cur] = sez[cur] || [];
        if (m[3]) sez[cur].push(m[3]);
        continue;
      }
      if (cur) sez[cur].push(r);
      else (sez._pre = sez._pre || []).push(r);
    }
    if (!trovate) {   // nessuna riga-titolo: prima riga = titolo, resto = descrizione
      const nonVuote = righe.filter(r => r.trim());
      return { titolo: (nonVuote[0] || "").trim(), descrizione: paragrafi(righe.slice(righe.indexOf(nonVuote[0]) + 1)), centrale: [], eccezioni: [] };
    }
    let ecc = [1, 2, 3, 4].map(i => paragrafi(sez["ecc" + i] || [])), eccTesto = [];
    if (sez.eccezioni && ecc.every(e => !e.length)) {   // sezione unica "ECCEZIONI" con voci numerate/puntate
      const voci = []; let v = null;
      for (const r of sez.eccezioni) {
        const m = r.match(RE_VOCE);
        if (m) { v = [m[1]]; voci.push(v); } else if (v) v.push(r);
      }
      if (voci.length) ecc = voci.map(paragrafi);
      else eccTesto = paragrafi(sez.eccezioni);      // testo unico sulle eccezioni (non legato alle singole immagini)
    }
    return {
      titolo: paragrafi(sez.titolo || sez._pre || []).join(" "),
      descrizione: paragrafi(sez.descrizione || []), centrale: paragrafi(sez.centrale || []), eccezioni: ecc,
      struttura: paragrafi(sez.struttura || []), tensioni: paragrafi(sez.tensioni || []), eccezioni_testo: eccTesto,
      osservazioni: paragrafi(sez.osservazioni || []),
    };
  }

  async function carica() {
    const cfg = VP.stato.config.testi;
    if (!cfg) return;
    await Promise.all([...VP.stato.clusters.keys()].map(async id => {
      try {
        const r = await VP.lingua.fetchLingua(`${cfg.cartella}/${cfg.file.replace("{id}", VP.pad2(id))}`, { cache: "no-cache" });
        if (!r.ok) return;
        const t = analizza(decodifica(await r.arrayBuffer()));
        dati.set(id, t);
        if (t.titolo) VP.stato.clusters.get(id).titolo = t.titolo;
      } catch (e) { console.warn("Testo non leggibile per il cluster", id, e); }
    }));
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = par => (par || []).map(p => `<p>${esc(p)}</p>`).join("");
  const testo = par => (par || []).join("\n\n");

  // Scheda descrittiva sotto la testata: una riga di introduzione; "leggi tutto" apre il testo completo in una finestra
  let corrente = null;
  function init() {
    document.getElementById("sch-toggle").onclick = () => apriDescrizione(corrente);
    VP.bus.on("cluster", aggiornaScheda);
    VP.bus.on("blocco", b => document.body.classList.toggle("lettura", b));
    aggiornaScheda(null);
  }
  function aggiornaScheda(id) {
    corrente = id;
    const t = dati.get(id), body = document.getElementById("sch-body");
    const ha = !!(t && t.descrizione.length);
    document.getElementById("sch-toggle").hidden = !ha;
    body.innerHTML = id == null ? `<p class="muted">${VP.t("Il nome del cluster e la sua descrizione compaiono qui.")}</p>`
      : ha ? html(t.descrizione) : `<p class="muted">${VP.t("Testo descrittivo non ancora disponibile per questo cluster.")}</p>`;
  }
  const intesta = id => { const c = VP.stato.clusters.get(id); return { sopra: `Cluster ${VP.pad2(id)}`, titolo: c?.titolo || c?.nome || "", colore: c?.colore }; };
  function apriDescrizione(id) {
    const t = dati.get(id); if (!t) return;
    VP.modale.apri({ ...intesta(id), largo: true, html:
      `<h4>${VP.t("Descrizione generale")}</h4>${html(t.descrizione)}` +
      (t.struttura.length ? `<h4>${VP.t("Struttura centrale")}</h4>${html(t.struttura)}` : "") +
      (t.tensioni.length ? `<h4>${VP.t("Eccezioni e tensioni interne")}</h4>${html(t.tensioni)}` : "") });
  }
  function apriCentrale(id) {
    const t = dati.get(id); if (!t || !t.centrale.length) return;
    VP.modale.apri({ ...intesta(id), html: `<h4>${VP.t("Immagine centrale · traduzione visuale")}</h4>${html(t.centrale)}` });
  }
  // Testi delle eccezioni. Fonte principale: le didascalie stampate nelle tavole generate (didascalie.json della
  // cartella immagini del cluster); in mancanza, i paragrafi "Eccezione 1..4" del testo del cluster.
  // Con "i" (0-3) mostra la singola eccezione con la sua immagine.
  function apriEccezioni(id, immagini = [], i = null, did = null) {
    const t = dati.get(id), dd = did && did.eccezioni && did.eccezioni.length ? did : null;
    if (!t && !dd) return;
    const voce = k => {
      const e = dd ? dd.eccezioni[k] || {} : null;
      const titolo = e && e.titolo ? ` · ${esc(e.titolo)}` : "";
      const corpo = e ? (e.variabile ? `<p class="mod-var">${esc(e.variabile)}</p>` : "") + (e.testo ? `<p>${esc(e.testo)}</p>` : "")
                      : html(t.eccezioni[k]) || `<p class="muted">${VP.t("Testo non disponibile.")}</p>`;
      return `<figure class="mod-ecc">${immagini[k] ? `<img src="${immagini[k]}" alt="">` : ""}
        <figcaption><h4>${VP.t("Eccezione {n}", { n: k + 1 })}${titolo}</h4>${corpo}</figcaption></figure>`;
    };
    const intro = dd ? (dd.intestazione ? `<p class="mod-intest">${esc(dd.intestazione)}</p>` : "")
      : (t.osservazioni.length ? `<h4>${VP.t("Osservazioni generali")}</h4>${html(t.osservazioni)}` : "") + (t.eccezioni_testo.length ? html(t.eccezioni_testo) : "");
    const nota = dd && dd.nota ? `<p class="mod-nota"><b>${VP.t("Nota.")}</b> ${esc(dd.nota)}</p>` : "";
    const corpo = i != null ? voce(i) + nota : intro + `<div class="mod-ecc-griglia">${[0, 1, 2, 3].map(voce).join("")}</div>` + nota;
    VP.modale.apri({ ...intesta(id), largo: i == null, html: corpo });
  }
  const haEccezioni = (id, did = null) => { if (did && did.eccezioni && did.eccezioni.length) return true;
    const t = dati.get(id); return !!t && (t.eccezioni.some(e => e.length) || t.eccezioni_testo.length > 0); };

  return { carica, init, get: id => dati.get(id), html, testo, apriCentrale, apriEccezioni, haEccezioni };
})();
