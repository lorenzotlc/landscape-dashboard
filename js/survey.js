// Pannello dei dati della survey, con due viste:
//   A "Valori e conflitti": pentagono dei 5 valori (dimensione = peso medio), archi = coppie di valori in conflitto,
//     in basso i tre punteggi di riconoscibilità; il cerchio tratteggiato indica la media di tutti i rispondenti.
//   B "Confronto": grafico a punti di riconoscibilità, valori e priorità di sviluppo per ogni classe di portatori di interesse.
// Si aggiorna con il cluster selezionato sulla mappa (nessun cluster = tutte le famiglie) e con la classe scelta nel menu.
// Formato atteso (data/survey.json), SOLO dati aggregati:
// { "demo", "n_minimo", "valori":[5], "direzioni":[5], "direzioni_estese":[5], "riconoscibilita":[3], "classi":[{"id","nome"}],
//   "dati": { "<id cluster | 0 = tutte le famiglie>": { "<id classe | tutti>":
//            { "n", "risposte", "valori":[5], "direzioni":[5], "riconoscibilita":[3], "conflitti": {"valoreA|valoreB": conteggio} } } } }
VP.survey = (() => {
  const COL = ["#4f9a5a", "#c98a2b", "#3f7fb5", "#9c5a7a", "#3fa6a0"];
  const SEL = "#7d5a63";
  let D, root, vista = "a", classe = "tutti", cluster = null, raf;
  const fmt = v => v == null ? "–" : v.toLocaleString(VP.lingua.loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nomeClasse = id => id === "tutti" ? VP.t("tutti i portatori di interesse") : (D.classi.find(c => c.id === id)?.nome || id);
  const blocco = (cl, cs) => D.dati[String(cl)]?.[cs];
  const valido = b => b && b.n >= D.n_minimo;
  const tip = (ev, html) => VP.tooltip.show(html, ev.clientX, ev.clientY);
  const notip = () => VP.tooltip.hide();

  function init() {
    root = document.getElementById("graph");
    D = VP.stato.survey;
    if (!D) { root.innerHTML = `<div class="empty">${VP.t("Dati della survey non ancora disponibili.")}</div>`; return; }
    const sel = document.getElementById("sv-classe");
    sel.innerHTML = `<option value="tutti">${VP.t("Tutti i portatori di interesse")}</option>` +
      D.classi.map(c => `<option value="${c.id}">${c.nome}</option>`).join("");
    sel.title = D.dimensione || "";
    sel.onchange = () => { classe = sel.value; VP.bus.emit("classe", classe); disegna(); };
    document.querySelectorAll("#sv-tabs button").forEach(b => b.onclick = () => {
      vista = b.dataset.v;
      document.querySelectorAll("#sv-tabs button").forEach(x => x.classList.toggle("on", x === b));
      disegna();
    });
    new ResizeObserver(disegna).observe(root);
    VP.bus.on("cluster", id => { cluster = id; disegna(); });
    disegna();
  }
  function scegliClasse(id) { classe = id; document.getElementById("sv-classe").value = id; VP.bus.emit("classe", classe); disegna(); }
  function disegna() { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); }

  // Avviso iniziale: finché i dati sono dimostrativi, il pannello si apre con una spiegazione e il grafo
  // compare solo dopo aver premuto il pulsante; dal badge "dati fittizi" si torna all'avviso.
  let avviso = true;
  function mostraAvviso() {
    fermaSim();
    document.querySelector(".p-graph")?.classList.add("sv-in-avviso");
    root.innerHTML = `<div class="sv-avviso" role="note">
      <p class="sv-avviso-tit">${VP.t("Anteprima dimostrativa")}</p>
      <p>${VP.t("I dati di questo pannello sono <b>fittizi</b>: sono stati generati per simulazione e non derivano dalla survey, ancora in corso.")}</p>
      <p>${VP.t("Servono solo a mostrare che cosa si immagina di poter restituire a partire dalle risposte raccolte: i valori attribuiti a ciascuna famiglia di paesaggio, i conflitti tra valori, le priorità di sviluppo, le parole ricorrenti e il confronto tra portatori di interesse.")}</p>
      <p class="sv-avviso-nota">${VP.t("Non vanno letti né citati come risultati della ricerca. Lo stesso vale per la colorazione della mappa basata sulla survey.")}</p>
      <button type="button" class="sv-btn" id="sv-apri">${VP.t("Visualizza l'esempio")}</button>
    </div>`;
    root.querySelector("#sv-apri").onclick = () => { avviso = false; disegna(); };
  }

  function render() {
    if (!root || !D) return;
    notip();
    if (D.demo && avviso) { mostraAvviso(); return; }
    document.querySelector(".p-graph")?.classList.remove("sv-in-avviso");
    const cl = cluster ?? 0, s = blocco(cl, classe), t = blocco(cl, "tutti");
    const dove = cluster == null ? VP.t("tutte le famiglie di paesaggio") : `cluster ${VP.pad2(cluster)}`;
    root.innerHTML = `<div class="sv"><div class="sv-info"><span>${dove} · ${nomeClasse(classe)}${s ? ` · ${VP.t("{n} rispondenti", { n: s.n })}` : ""}</span>` +
      `${D.demo ? `<button type="button" class="sv-demo" id="sv-torna" title="${VP.t("Rileggi l'avviso sui dati dimostrativi")}">${VP.t("dati fittizi · avviso")}</button>` : ""}</div><div class="sv-corpo"></div></div>`;
    root.querySelector("#sv-torna")?.addEventListener("click", () => { avviso = true; disegna(); });
    const corpo = root.querySelector(".sv-corpo");
    if (!t) { corpo.innerHTML = `<div class="empty">${VP.t("Nessun dato per questa selezione.")}</div>`; return; }
    if (vista === "a") {
      if (!valido(s)) { corpo.innerHTML = `<div class="empty">${VP.t("Dati insufficienti: meno di {n} rispondenti in questa classe.<br>Per tutelare l'anonimato non vengono mostrati.", { n: D.n_minimo })}</div>`; return; }
      vistaA(corpo, s, t);
    } else { fermaSim(); vistaB(corpo, cl); }
  }

  // ---------- A: valori e conflitti (force-directed) ----------
  // Ogni coppia di valori è legata da una "molla": più la coppia è indicata come conflittuale, più la molla è lunga
  // e i due nodi si allontanano. La forma del grafo cambia così a ogni selezione (cluster, classe).
  // Nodo: cerchio pieno = peso percepito del valore; anello = priorità della direzione di sviluppo corrispondente.
  // Parole (facoltative): termini ricorrenti delle risposte libere, legati ai valori a cui sono più associati
  // (chi cita il termine dà a quel valore un peso superiore alla media). Le parole non deformano la forma dei valori.
  const SOGLIA_ASSOC = 0.1, MAX_LEGAMI = 2;
  // dimensioni dei testi del grafo (unità della tela di riferimento): piccole per non coprire nodi e archi
  const FS_NUM = 9.2, FS_NOME = 8.4, FS_PAROLA = [8.4, 10.6];
  let sim, simT, posPrec = {}, posPrecT = {}, mostraParole = true, nParole = 6;
  const segno = v => (v > 0 ? "+" : "") + fmt(v);
  function fermaSim() { if (sim) sim.stop(); if (simT) simT.stop(); }

  function terminiVisibili(s) {
    return (s.termini || []).map(d => {
      const legami = d.assoc.map((a, v) => ({ v, a })).filter(l => l.a >= SOGLIA_ASSOC)
        .sort((x, y) => y.a - x.a).slice(0, MAX_LEGAMI);
      return { ...d, key: `${d.tipo}|${d.t}`, legami };
    }).filter(d => d.legami.length).sort((x, y) => y.n - x.n).slice(0, nParole);
  }

  function vistaA(el, s, t) {
    fermaSim();
    const termini = mostraParole ? terminiVisibili(s) : [];
    const leg = document.createElement("div"); leg.className = "sv-leg";
    const aiuto = [VP.t("Cerchio pieno: peso percepito del valore. Anello: priorità della direzione di sviluppo corrispondente."),
      VP.t("Linee rosse: coppie di valori in conflitto; più la coppia è indicata, più i due valori sono distanti."),
      VP.t("Parole: termini ricorrenti nelle risposte libere (bordo tratteggiato = omissione: importante ma non rappresentato), legate ai valori a cui chi le cita dà un peso superiore alla media; linea più spessa = legame più forte."),
      VP.t("Trascina nodi e parole · rotella o due dita = zoom · doppio clic = vista iniziale.")].join("\n");
    leg.innerHTML = `<div class="sv-simb"><span><i class="pieno"></i>${VP.t("peso percepito")}</span><span><i class="anello"></i>${VP.t("priorità")}</span>` +
      `<span><i class="linea"></i>${VP.t("conflitto = distanza")}</span></div>` +
      `<div class="sv-simb"><span class="sv-par"><label><input type="checkbox" ${mostraParole ? "checked" : ""}> ${VP.t("parole")}</label>` +
      (mostraParole ? `<button type="button" data-d="-1" aria-label="${VP.t("Meno parole")}">−</button><b>${nParole}</b><button type="button" data-d="1" aria-label="${VP.t("Più parole")}">+</button>` : "") + `</span>` +
      (mostraParole ? `<span><i class="pill"></i>${VP.t("chiave")}</span><span><i class="pill om"></i>${VP.t("omissione")}</span>` : "") +
      `<span class="sv-info-i" tabindex="0" title="${aiuto}">ⓘ</span></div>`;
    el.appendChild(leg);
    leg.querySelector(".sv-par input").onchange = e => { mostraParole = e.target.checked; disegna(); };
    // su touch il title non si vede: al tocco la spiegazione compare nel tooltip
    leg.querySelector(".sv-info-i").onclick = ev => { ev.stopPropagation(); tip(ev, aiuto.replace(/\n/g, "<br>")); };
    leg.querySelectorAll(".sv-par button").forEach(bt => bt.onclick = () => { nParole = Math.max(1, Math.min(16, nParole + +bt.dataset.d)); disegna(); });
    if (mostraParole && !termini.length) leg.querySelectorAll(".sv-simb")[1].insertAdjacentHTML("beforeend",
      `<span class="sv-nessuna">${VP.t("nessuna parola citata da almeno {n} persone", { n: D.n_minimo })}</span>`);

    // Il grafo è disegnato sempre nella stessa tela di riferimento (420×240 unità, circa le proporzioni del pannello normale) e scalato in blocco (viewBox):
    // nel pannello ingrandito cerchi, linee, testi e parole crescono tutti dello stesso fattore, così la figura
    // è identica, solo più grande; se il pannello ha proporzioni diverse, lo spazio in più resta come margine.
    const Wpx = el.clientWidth, Hpx = el.clientHeight - leg.offsetHeight;
    if (Wpx < 60 || Hpx < 100) return;
    const W = 420, H = 240;
    const svg = d3.select(el).append("svg").attr("width", Wpx).attr("height", Hpx)
      .attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
    const R = Math.max(40, Math.min(W, H) * 0.42);
    const rr = d3.scaleLinear([1, 5], [5, Math.max(12, R * 0.24)]).clamp(true);
    const tot = s.risposte || s.n;
    const quota = (a, b) => ((s.conflitti[`${D.valori[a]}|${D.valori[b]}`] || 0) + (s.conflitti[`${D.valori[b]}|${D.valori[a]}`] || 0)) / tot;
    const nodes = D.valori.map((v, i) => ({ i, nome: v, w: s.valori[i], pr: s.direzioni[i] }));
    const links = [];
    for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) links.push({ source: a, target: b, q: quota(a, b) });
    const qmax = d3.max(links, d => d.q) || 1;
    const lmin = R * 0.45, lmax = R * 1.45;
    links.forEach(d => d.dist = lmin + (lmax - lmin) * d.q / qmax);
    const raggio = d => Math.max(rr(d.w), rr(d.pr));

    // livelli: conflitti, legami delle parole, valori, parole
    let kZoom = 1;
    const zg = svg.append("g"), lg = zg.append("g"), tlg = zg.append("g");
    const link = lg.selectAll("line").data(links.filter(d => d.q > 0)).join("line")
      .attr("stroke", "#b5414b").attr("stroke-linecap", "round")
      .attr("stroke-width", d => 0.6 + 5 * d.q / qmax).attr("stroke-opacity", d => 0.12 + 0.55 * d.q / qmax)
      .on("mousemove", (ev, d) => tip(ev, `<b>${VP.t("Conflitto")}: ${D.valori[d.source.i ?? d.source]} – ${D.valori[d.target.i ?? d.target]}</b><br>${VP.t("coppia indicata nel {q}% delle risposte", { q: Math.round(d.q * 100) })}<br><span style="opacity:.7">${VP.t("più alta la quota, più i due valori sono lontani")}</span>`))
      .on("mouseleave", notip);
    const node = zg.append("g").selectAll("g").data(nodes).join("g")
      .on("mousemove", (ev, d) => tip(ev, `<b>${VP.t("Valore {nome}", { nome: d.nome })}</b><br>${VP.t("peso percepito")}: ${VP.t("{v} su 5", { v: fmt(d.w) })}` +
        `<br>${VP.t("priorità")} «${(D.direzioni_estese || D.direzioni)[d.i]}»: ${VP.t("{v} su 5", { v: fmt(d.pr) })}` +
        (classe !== "tutti" ? `<br><span style="opacity:.7">${VP.t("tutti i rispondenti")}: ${fmt(t.valori[d.i])} · ${fmt(t.direzioni[d.i])}</span>` : "")))
      .on("mouseenter", (ev, d) => evidenziaValore(d.i))
      .on("mouseleave", () => { notip(); evidenziaValore(null); });
    node.append("circle").attr("r", d => rr(d.w)).attr("fill", d => COL[d.i]).attr("fill-opacity", .9);
    node.append("circle").attr("r", d => rr(d.pr)).attr("fill", "none").attr("stroke", d => d3.color(COL[d.i]).darker(0.9)).attr("stroke-width", 2.2);
    node.append("text").attr("class", "sv-num").attr("text-anchor", "middle").attr("dy", "0.35em").attr("fill", "#fff").attr("pointer-events", "none")
      .style("font-size", `${FS_NUM}px`).style("font-weight", 700).text(d => fmt(d.w));
    node.append("text").attr("class", "sv-nome").attr("pointer-events", "none").attr("text-anchor", "middle").style("font-size", `${FS_NOME}px`)
      .style("font-weight", 600).style("letter-spacing", "0.05em")
      .attr("fill", "#1f2328").attr("y", d => raggio(d) + 10).text(d => d.nome.toUpperCase())
      .each(function (d) { const b = this.getBBox(); d.et = { x0: b.x - 2, y0: b.y - 1, x1: b.x + b.width + 2, y1: b.y + b.height + 1 }; });

    // 1) forma di equilibrio dei valori (deterministica, allineata), adattata allo spazio del pannello;
    //    con le parole si lascia più margine perché possano disporsi anche all'esterno
    //    (calcolata in unità fisse, R = 100, così la forma non dipende dalle dimensioni del pannello)
    const u = 100 / R, rrN = d3.scaleLinear([1, 5], [5, 24]).clamp(true);
    const calc = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(d => d.dist * u).strength(0.8))
      .force("collide", d3.forceCollide(d => Math.max(rrN(d.w), rrN(d.pr)) + 10))
      .force("x", d3.forceX(0).strength(0.02)).force("y", d3.forceY(0).strength(0.02)).stop();
    nodes.forEach((d, k) => { const ang = -Math.PI / 2 + k * 2 * Math.PI / 5; d.x = 70 * Math.cos(ang); d.y = 70 * Math.sin(ang); });
    for (let k = 0; k < 400; k++) calc.tick();
    allinea(nodes);
    const conP = termini.length > 0;
    const mx = conP ? 70 : 46, myT = conP ? 30 : 22, myB = conP ? 44 : 38;
    const [x0, x1] = d3.extent(nodes, d => d.x), [y0, y1] = d3.extent(nodes, d => d.y);
    const k = Math.min(3, (W - 2 * mx) / Math.max(1, x1 - x0), (H - myT - myB) / Math.max(1, y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = myT + (H - myT - myB - (y1 - y0) * k) / 2 - y0 * k;
    nodes.forEach(d => { d.hx = d.x * k + ox; d.hy = d.y * k + oy; });
    links.forEach(l => l.len = Math.hypot(l.source.hx - l.target.hx, l.source.hy - l.target.hy));

    // 2) simulazione "viva" dei valori: partono dalla posizione precedente e le forze li portano all'equilibrio;
    //    trascinandoli si deforma il grafo, al rilascio le molle lo riportano alla forma calcolata.
    nodes.forEach(d => { const p = posPrec[d.nome]; d.x = p ? p.x : d.hx; d.y = p ? p.y : d.hy; d.vx = d.vy = 0; });
    // molla di richiamo verso la posizione di equilibrio: non dipende da alpha, quindi il nodo torna esattamente al suo posto
    const richiamo = () => nodes.forEach(d => { if (d.fx == null) { d.vx += (d.hx - d.x) * 0.06; d.vy += (d.hy - d.y) * 0.06; } });
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(l => l.len).strength(0.3))
      .force("richiamo", richiamo)
      .alphaMin(0.002).alphaDecay(0.012)
      .on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
        nodes.forEach(d => posPrec[d.nome] = { x: d.x, y: d.y });
        if (simT && simT.alpha() < 0.08) simT.alpha(0.08).restart();   // le parole seguono i valori
      });
    node.style("cursor", "grab").call(d3.drag()
      .on("start", (e, d) => { notip(); if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0).alpha(Math.max(sim.alpha(), 0.5)).restart(); d.fx = null; d.fy = null; }));

    // 3) parole
    let tnode = null, tlink = null;
    if (conP) {
      const amax = d3.max(termini, d => d3.max(d.legami, l => l.a)) || 1;
      const fs = d3.scaleSqrt(d3.extent(termini, d => d.n), [FS_PAROLA[0], FS_PAROLA[1]]);
      const tl = termini.flatMap(d => d.legami.map(l => ({ term: d, val: nodes[l.v], a: l.a })));
      tlink = tlg.selectAll("line").data(tl).join("line")
        .attr("stroke", d => COL[d.val.i]).attr("stroke-linecap", "round")
        .attr("stroke-width", d => 0.6 + 2.2 * d.a / amax).attr("stroke-opacity", 0.5);
      tnode = zg.append("g").selectAll("g").data(termini, d => d.key).join("g").attr("class", d => `sv-term ${d.tipo}`)
        .style("cursor", "grab")
        .on("mousemove", (ev, d) => tip(ev, `<b>${d.t}</b> · ${d.tipo === "omissione" ? VP.t("omissione (importante ma non rappresentato)") : VP.t("parola chiave")}` +
          `<br>${VP.t(cluster == null ? "citata da {n} risposte ({q}%)" : "citata da {n} persone ({q}%)", { n: d.n, q: Math.round(d.q * 100) })}` +
          `<br>${VP.t("più legata a")}: ${d.legami.map(l => `${D.valori[l.v]} (${segno(l.a)})`).join(", ")}` +
          `<br><span style="opacity:.7">${VP.t("chi la cita dà a questi valori un peso superiore alla media")}</span>`))
        .on("mouseenter", (ev, d) => evidenziaTermine(d))
        .on("mouseleave", () => { notip(); evidenziaTermine(null); });
      tnode.append("rect");
      tnode.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").style("font-size", d => `${fs(d.n)}px`).text(d => d.t);
      tnode.each(function (d) {
        const b = this.querySelector("text").getBBox();
        d.w = b.width + 8; d.h = b.height + 2;
        d3.select(this).select("rect").attr("x", -d.w / 2).attr("y", -d.h / 2).attr("width", d.w).attr("height", d.h).attr("rx", d.h / 2);
      });
      // Forze delle parole: attrazione verso i valori legati (molla più corta = legame più forte), nessuna
      // sovrapposizione con altre parole o con i cerchi dei valori, contenimento nel pannello. I valori non si muovono.
      const baricentro = d => {
        const sa = d3.sum(d.legami, l => l.a);
        return [d3.sum(d.legami, l => nodes[l.v].x * l.a) / sa, d3.sum(d.legami, l => nodes[l.v].y * l.a) / sa];
      };
      const attrazione = alpha => termini.forEach(d => {
        const sa = d3.sum(d.legami, l => l.a);
        d.legami.forEach(l => {
          const v = nodes[l.v], dx = v.x - d.x, dy = v.y - d.y, dist = Math.hypot(dx, dy) || 1;
          const L = raggio(v) + d.h / 2 + 10 + (1 - l.a / amax) * R * 0.55;
          const f = (dist - L) / dist * 0.12 * (l.a / sa) * Math.max(alpha, 0.3);
          d.vx += dx * f; d.vy += dy * f;
        });
      });
      const separazione = () => {
        for (let i = 0; i < termini.length; i++) for (let j = i + 1; j < termini.length; j++) {
          const a = termini[i], b = termini[j], dx = b.x - a.x, dy = b.y - a.y;
          const sx = (a.w + b.w) / 2 + 3 - Math.abs(dx), sy = (a.h + b.h) / 2 + 3 - Math.abs(dy);
          if (sx > 0 && sy > 0) {
            const fa = a.fx == null ? 1 : 0, fb = b.fx == null ? 1 : 0, tot = fa + fb || 1;
            if (sx < sy) { const m = (dx < 0 ? -1 : 1) * sx; a.x -= m * fa / tot; b.x += m * fb / tot; }
            else { const m = (dy < 0 ? -1 : 1) * sy; a.y -= m * fa / tot; b.y += m * fb / tot; }
          }
        }
        termini.forEach(d => {
          if (d.fx != null) return;
          nodes.forEach(v => {
            const nx = Math.max(d.x - d.w / 2, Math.min(v.x, d.x + d.w / 2)), ny = Math.max(d.y - d.h / 2, Math.min(v.y, d.y + d.h / 2));
            const dx = nx - v.x, dy = ny - v.y, dist = Math.hypot(dx, dy), r = raggio(v) + 4;
            if (dist < r) {
              let ux = dist ? dx : d.x - v.x, uy = dist ? dy : d.y - v.y; const n = Math.hypot(ux, uy) || 1;
              if (!Math.hypot(ux, uy)) { ux = 1; uy = 0; }
              d.x += ux / n * (r - dist); d.y += uy / n * (r - dist);
            }
          });
          d.x = Math.max(d.w / 2 + 2, Math.min(W - d.w / 2 - 2, d.x));
          d.y = Math.max(d.h / 2 + 2, Math.min(H - d.h / 2 - 2, d.y));
        });
      };
      // a) disposizione di equilibrio, calcolata a valori fermi nella loro forma finale: deterministica
      //    (stessa selezione = stessa figura) e memorizzata come scostamento dal baricentro dei valori legati
      const partenza = nodes.map(v => [v.x, v.y]);
      nodes.forEach(v => { v.x = v.hx; v.y = v.hy; });
      termini.forEach((d, j) => {
        const [cx, cy] = baricentro(d), ang = (j * 2.39996) % (2 * Math.PI);
        d.x = cx + 34 * Math.cos(ang); d.y = cy + 34 * Math.sin(ang); d.vx = d.vy = 0;
      });
      const calcT = d3.forceSimulation(termini).force("attr", attrazione).force("sep", separazione).velocityDecay(0.45).stop();
      for (let k = 0; k < 350; k++) calcT.tick();
      // sistemazione finale garantita senza sovrapposizioni: le parole (dalla più citata) restano dove sono se c'è
      // spazio, altrimenti prendono il primo posto libero cercando a spirale intorno alla posizione calcolata
      const sistemate = [];
      const libero = (d, x, y) =>
        x - d.w / 2 >= 2 && x + d.w / 2 <= W - 2 && y - d.h / 2 >= 2 && y + d.h / 2 <= H - 2 &&
        sistemate.every(o => Math.abs(o.x - x) >= (o.w + d.w) / 2 + 3 || Math.abs(o.y - y) >= (o.h + d.h) / 2 + 3) &&
        nodes.every(v => {
          const nx = Math.max(x - d.w / 2, Math.min(v.x, x + d.w / 2)), ny = Math.max(y - d.h / 2, Math.min(v.y, y + d.h / 2));
          const fuoriEtichetta = x + d.w / 2 <= v.x + v.et.x0 || x - d.w / 2 >= v.x + v.et.x1 ||
                                 y + d.h / 2 <= v.y + v.et.y0 || y - d.h / 2 >= v.y + v.et.y1;
          return Math.hypot(nx - v.x, ny - v.y) >= raggio(v) + 4 && fuoriEtichetta;
        });
      [...termini].sort((a, b) => b.n - a.n).forEach(d => {
        let pos = libero(d, d.x, d.y) ? [d.x, d.y] : null;
        for (let r = 4; !pos && r <= 240; r += 4)
          for (let k = 0; k < 24 && !pos; k++) {
            const a = k * Math.PI / 12, x = d.x + r * Math.cos(a), y = d.y + r * Math.sin(a) * 0.6;
            if (libero(d, x, y)) pos = [x, y];
          }
        if (pos) { d.x = pos[0]; d.y = pos[1]; }
        sistemate.push(d);
      });
      termini.forEach(d => { const [cx, cy] = baricentro(d); d.ox = d.x - cx; d.oy = d.y - cy; });
      nodes.forEach((v, k) => { v.x = partenza[k][0]; v.y = partenza[k][1]; });
      // b) simulazione viva: ogni parola è richiamata alla sua posizione rispetto ai valori (segue i valori trascinati,
      //    torna esattamente al suo posto se trascinata). Le posizioni di equilibrio sono già prive di sovrapposizioni,
      //    quindi qui non serve separare le parole: durante il movimento possono incrociarsi senza bloccarsi a vicenda.
      termini.forEach(d => {
        const p = posPrecT[d.key], [cx, cy] = baricentro(d);
        d.x = p ? p.x : cx + d.ox; d.y = p ? p.y : cy + d.oy; d.vx = d.vy = 0;
      });
      const richiamoT = () => termini.forEach(d => {
        if (d.fx != null) return;
        const [cx, cy] = baricentro(d);
        d.vx += (cx + d.ox - d.x) * 0.06; d.vy += (cy + d.oy - d.y) * 0.06;
      });
      const limiti = () => termini.forEach(d => {
        d.x = Math.max(d.w / 2 + 2, Math.min(W - d.w / 2 - 2, d.x));
        d.y = Math.max(d.h / 2 + 2, Math.min(H - d.h / 2 - 2, d.y));
      });
      simT = d3.forceSimulation(termini).force("richiamo", richiamoT).force("limiti", limiti)
        .velocityDecay(0.4).alphaMin(0.002).alphaDecay(0.012)
        .on("tick", () => {
          tlink.attr("x1", d => d.term.x).attr("y1", d => d.term.y).attr("x2", d => d.val.x).attr("y2", d => d.val.y);
          tnode.attr("transform", d => `translate(${d.x},${d.y}) scale(${1 / kZoom})`);
          termini.forEach(d => posPrecT[d.key] = { x: d.x, y: d.y });
        });
      tnode.call(d3.drag()
        .on("start", (e, d) => { notip(); simT.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = d.x = e.x; d.fy = d.y = e.y; })
        .on("end", (e, d) => { simT.alphaTarget(0).alpha(0.6).restart(); d.fx = null; d.fy = null; }));
    }

    // evidenziazioni: passando su una parola si vedono i suoi legami; passando su un valore, le sue parole
    function evidenziaTermine(d) {
      if (!tnode) return;
      tnode.attr("opacity", x => !d || x === d ? 1 : 0.25);
      tlink.attr("stroke-opacity", x => !d ? 0.5 : x.term === d ? 0.95 : 0.06);
      node.attr("opacity", x => !d || d.legami.some(l => l.v === x.i) ? 1 : 0.35);
    }
    function evidenziaValore(i) {
      if (!tnode) return;
      tnode.attr("opacity", x => i == null || x.legami.some(l => l.v === i) ? 1 : 0.2);
      tlink.attr("stroke-opacity", x => i == null ? 0.5 : x.val.i === i ? 0.95 : 0.06);
    }

    // zoom e spostamento con rotella / trascinamento dello sfondo; doppio clic = vista iniziale
    // su touch lo zoom risponde solo a due dita, così con un dito si continua a scorrere la pagina
    const zoom = d3.zoom().scaleExtent([0.5, 4])
      .filter(e => (e.type === "wheel" || !e.button) && (!e.touches || e.touches.length > 1))
      .on("zoom", e => { zg.attr("transform", e.transform); testiFissi(e.transform.k); });
    // con lo zoom la geometria si ingrandisce, i testi no: le dimensioni dei caratteri (e delle etichette
    // delle parole) vengono divise per il fattore di zoom, così restano costanti sullo schermo
    function testiFissi(kz) {
      kZoom = kz;
      node.select(".sv-num").style("font-size", `${FS_NUM / kz}px`);
      node.select(".sv-nome").style("font-size", `${FS_NOME / kz}px`).attr("y", d => raggio(d) + 10 / kz);
      if (tnode) tnode.attr("transform", d => `translate(${d.x},${d.y}) scale(${1 / kz})`);
    }
    svg.call(zoom).on("dblclick.zoom", null).on("dblclick", () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity));
  }

  // Allineamento di Procuste: la forma calcolata viene ruotata (ed eventualmente specchiata) per sovrapporsi il più
  // possibile a un riferimento fisso (pentagono regolare, naturalistico in alto, valori in senso orario).
  // La stessa selezione produce sempre la stessa figura e, passando da una selezione all'altra, i nodi si muovono
  // solo per i cambiamenti nei conflitti, non per rotazioni o ribaltamenti arbitrari della simulazione.
  function allinea(nodes) {
    const n = nodes.length, cx = d3.mean(nodes, d => d.x), cy = d3.mean(nodes, d => d.y);
    const X = nodes.map(d => [d.x - cx, d.y - cy]);
    const Y = nodes.map((d, k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / n; return [Math.cos(a), Math.sin(a)]; });
    // scala del riferimento pari a quella della forma, così il residuo confronta grandezze omogenee
    const sx = Math.sqrt(d3.mean(X, p => p[0] * p[0] + p[1] * p[1])) || 1;
    Y.forEach(p => { p[0] *= sx; p[1] *= sx; });
    const prova = rifletti => {
      const P = X.map(([x, y]) => [rifletti ? -x : x, y]);
      let num = 0, den = 0;
      P.forEach(([x, y], i) => { num += x * Y[i][1] - y * Y[i][0]; den += x * Y[i][0] + y * Y[i][1]; });
      const t = Math.atan2(num, den), c = Math.cos(t), sn = Math.sin(t);
      const Q = P.map(([x, y]) => [x * c - y * sn, x * sn + y * c]);
      return { Q, err: d3.sum(Q, (q, i) => (q[0] - Y[i][0]) ** 2 + (q[1] - Y[i][1]) ** 2) };
    };
    const a = prova(false), b = prova(true), m = b.err < a.err ? b : a;
    nodes.forEach((d, i) => { d.x = m.Q[i][0]; d.y = m.Q[i][1]; });
  }

  // ---------- B: confronto tra portatori di interesse ----------
  function vistaB(el, cl) {
    const gruppi = [[VP.t("Riconoscibilità"), "riconoscibilita", D.riconoscibilita, D.riconoscibilita],
                    [VP.t("Valori"), "valori", D.valori, D.valori],
                    [VP.t("Priorità di sviluppo"), "direzioni", D.direzioni, D.direzioni_estese || D.direzioni]];
    const classi = D.classi.filter(c => valido(blocco(cl, c.id)));
    const W = el.clientWidth; if (W < 60) return;
    const lw = Math.min(150, W * 0.38), rh = 16, gh = 17;
    const nRighe = d3.sum(gruppi, g => g[2].length);
    const H = Math.max(el.clientHeight, 4 + gruppi.length * gh + nRighe * rh + 30);
    const svg = d3.select(el).append("svg").attr("width", W).attr("height", H);
    const x = d3.scaleLinear([1, 5], [lw + 12, W - 14]);
    const t = blocco(cl, "tutti"), s = blocco(cl, classe), sOk = classe !== "tutti" && valido(s);
    [1, 2, 3, 4, 5].forEach(v => svg.append("line").attr("x1", x(v)).attr("x2", x(v)).attr("y1", 4).attr("y2", H - 24).attr("stroke", "#f0eee9"));
    let y = 2;
    gruppi.forEach(([titolo, chiave, voci, estese]) => {
      svg.append("text").attr("x", 10).attr("y", y + 14).attr("class", "sv-gr").text(titolo);
      y += gh;
      voci.forEach((voce, i) => {
        const yc = y + rh / 2, g = svg.append("g");
        g.append("text").attr("x", lw).attr("y", yc).attr("dy", "0.35em").attr("text-anchor", "end")
          .style("font-size", "12px").attr("fill", "#1f2328").text(voce).append("title").text(estese[i]);
        g.append("line").attr("x1", x(1)).attr("x2", x(5)).attr("y1", yc).attr("y2", yc).attr("stroke", "#e3e1db");
        classi.forEach(c => {
          const v = blocco(cl, c.id)[chiave][i];
          g.append("circle").attr("class", "sv-dot").attr("data-c", c.id).attr("cx", x(v)).attr("cy", yc).attr("r", 3.6)
            .attr("fill", c.id === classe ? SEL : "#9b9ea4").attr("fill-opacity", c.id === classe ? 0 : .6)
            .on("mouseenter", ev => evidenzia(svg, c.id, true))
            .on("mousemove", ev => tip(ev, `<b>${c.nome}</b> (${blocco(cl, c.id).n})<br>${estese[i]}: ${fmt(v)}<br><span style="opacity:.7">${VP.t("clic per selezionare la classe")}</span>`))
            .on("mouseleave", () => { evidenzia(svg, c.id, false); notip(); })
            .on("click", () => scegliClasse(c.id));
        });
        g.append("line").attr("x1", x(t[chiave][i])).attr("x2", x(t[chiave][i])).attr("y1", yc - 6).attr("y2", yc + 6)
          .attr("stroke", "#1f2328").attr("stroke-width", 2).attr("pointer-events", "none");
        if (sOk) g.append("circle").attr("cx", x(s[chiave][i])).attr("cy", yc).attr("r", 6).attr("fill", SEL)
          .attr("stroke", "#fff").attr("stroke-width", 1.5)
          .on("mousemove", ev => tip(ev, `<b>${nomeClasse(classe)}</b><br>${estese[i]}: ${fmt(s[chiave][i])}<br>${VP.t("tutti")}: ${fmt(t[chiave][i])}`))
          .on("mouseleave", notip);
        y += rh;
      });
    });
    // asse e legenda
    const ay = H - 10;
    [1, 2, 3, 4, 5].forEach(v => svg.append("text").attr("x", x(v)).attr("y", ay).attr("text-anchor", "middle")
      .style("font-size", "11px").attr("fill", "#6b6f76").text(v));
    const lg = svg.append("g").attr("transform", `translate(10,${ay - 4})`).style("font-size", "11px").attr("fill", "#6b6f76");
    lg.append("line").attr("x1", 0).attr("x2", 0).attr("y1", -5).attr("y2", 5).attr("stroke", "#1f2328").attr("stroke-width", 2);
    lg.append("text").attr("x", 5).attr("dy", "0.35em").text(VP.t("tutti"));
    lg.append("circle").attr("cx", 40).attr("r", 3.6).attr("fill", "#9b9ea4").attr("fill-opacity", .6);
    lg.append("text").attr("x", 47).attr("dy", "0.35em").text(VP.t("classi"));
    if (sOk) { lg.append("circle").attr("cx", 88).attr("r", 5).attr("fill", SEL); lg.append("text").attr("x", 96).attr("dy", "0.35em").text(VP.t("selezionata")); }
    if (classi.length < D.classi.length)
      svg.append("text").attr("x", W - 12).attr("y", 14).attr("text-anchor", "end").style("font-size", "10.5px").attr("fill", "#6b6f76")
        .text(VP.t("classi con meno di {n} rispondenti non mostrate", { n: D.n_minimo }));
  }
  function evidenzia(svg, id, on) {
    svg.selectAll(`.sv-dot[data-c="${id}"]`).filter(function () { return this.getAttribute("fill-opacity") !== "0"; })
      .attr("r", on ? 5 : 3.6).attr("fill", on ? "#1f2328" : "#9b9ea4").attr("fill-opacity", on ? .9 : .6);
  }
  return { init, classe: () => classe, COLORI: COL };
})();
