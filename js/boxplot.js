// Pannello boxplot: una riga per variabile, raggruppate per tema (visibilità, morfologia, ...).
// Due modalità, decise da data/statistiche_cluster.json:
//  - "standardizzata" (statistiche già calcolate per cluster, es. dal CSV di analisi): valori disegnati così come sono;
//    come riferimento, tacche grigie = mediane degli altri cluster.
//  - "originale" (statistiche calcolate da prepara_dati.py sulle celle): valori convertiti in z-score rispetto
//    all'intera area, con il box grigio dell'intera area come riferimento.
VP.boxplot = (() => {
  let svg, g, x, y, W, H, vars, righe, root, S, zMode;
  const M = { t: 6, r: 14, b: 28, l: 150 };
  const fmt = v => v == null ? "–" : Math.abs(v) >= 100 ? d3.format(",.0f")(v) : d3.format(",.2~f")(v);

  const z = (vid, v) => {
    if (!zMode) return v;
    const gl = S.globale[vid]; return gl.ds ? (v - gl.media) / gl.ds : 0;
  };

  function init() {
    root = document.getElementById("boxplot");
    S = VP.stato.stats; vars = S.variabili;
    zMode = !!S.globale && S.scala !== "standardizzata";
    // righe: intestazione di gruppo + variabili
    righe = []; let ultimo = null;
    for (const v of vars) {
      if (v.gruppo && v.gruppo !== ultimo) { righe.push({ key: "g:" + v.gruppo, gruppo: v.gruppo }); ultimo = v.gruppo; }
      righe.push({ key: v.id, v });
    }
    document.querySelector(".legend-inline").innerHTML = zMode
      ? `<i class="lg-c"></i>cluster <i class="lg-g"></i>intera area`
      : `<i class="lg-c"></i>cluster <i class="lg-t"></i>mediane altri cluster`;
    svg = d3.select(root).append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");
    root.insertAdjacentHTML("beforeend", `<div class="empty" id="box-empty">Passa il mouse su una cella della mappa</div>`);
    new ResizeObserver(() => { layout(); draw(VP.stato.clusterCorrente, false); }).observe(root);
  }

  function layout() {
    W = root.clientWidth; H = root.clientHeight;
    if (!W || !H) return;
    M.l = Math.min(215, W * 0.45);
    const em = document.getElementById("box-empty");
    if (em) { em.style.left = M.l + "px"; em.style.bottom = M.b + "px"; }   // messaggio nell'area del grafico, non sulle etichette
    let lo = Infinity, hi = -Infinity;
    for (const c of Object.values(S.cluster)) for (const v of vars) {
      const s = c[v.id]; if (!s) continue;
      lo = Math.min(lo, z(v.id, s.min ?? s.baffo_inf)); hi = Math.max(hi, z(v.id, s.max ?? s.baffo_sup));
    }
    if (zMode) { lo = Math.max(lo, -4); hi = Math.min(hi, 4); }
    x = d3.scaleLinear().domain([lo, hi]).nice().range([M.l, W - M.r]).clamp(true);
    y = d3.scaleBand().domain(righe.map(r => r.key)).range([M.t, H - M.b]).paddingInner(0.22);

    g.selectAll("*").remove();
    g.append("g").attr("transform", `translate(0,${H - M.b})`)
      .call(d3.axisBottom(x).ticks(Math.max(3, Math.floor((W - M.l) / 55))).tickSizeOuter(0))
      .call(a => a.selectAll("text").attr("fill", "#6b6f76").style("font-size", "11.5px"))
      .call(a => a.select(".domain").attr("stroke", "#ccc")).call(a => a.selectAll("line").attr("stroke", "#ccc"));
    g.append("text").attr("x", W - M.r).attr("y", H - 2).attr("text-anchor", "end").attr("fill", "#6b6f76")
      .style("font-size", "11.5px").text(zMode ? "z-score rispetto all'intera area" : "valori standardizzati");
    if (x.domain()[0] < 0 && x.domain()[1] > 0)
      g.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", M.t).attr("y2", H - M.b).attr("stroke", "#bbb").attr("stroke-dasharray", "3,3");

    // intestazioni di gruppo
    g.selectAll(".gh").data(righe.filter(r => r.gruppo)).join("text").attr("class", "gh")
      .attr("x", 4).attr("y", r => y(r.key) + y.bandwidth() * 0.75)
      .style("font-size", "11px").style("font-weight", 600).style("letter-spacing", ".06em").attr("fill", "#6b6f76")
      .text(r => r.gruppo.toUpperCase());

    const bh = y.bandwidth();
    const row = g.selectAll(".row").data(righe.filter(r => r.v), r => r.key).join("g").attr("class", "row")
      .attr("transform", r => `translate(0,${y(r.key)})`);
    row.append("rect").attr("x", 0).attr("width", W).attr("y", -y.step() * y.paddingInner() / 2).attr("height", y.step())
      .attr("fill", "transparent").on("mousemove", (ev, r) => tip(ev, r.v)).on("mouseleave", () => VP.tooltip.hide())
      .on("click", (ev, r) => tip(ev, r.v));   // smartphone: tocco = tooltip
    row.append("text").attr("x", M.l - 8).attr("y", bh / 2).attr("dy", "0.35em").attr("text-anchor", "end")
      .style("font-size", "12.5px").attr("fill", "#1f2328").text(r => r.v.nome + (r.v.unita ? ` (${r.v.unita})` : ""))
      .each(function () {
        const t = d3.select(this); let s = t.text();
        while (this.getComputedTextLength() > M.l - 14 && s.length > 4) { s = s.slice(0, -2); t.text(s + "…"); }
      });
    const ref = row.append("g").attr("class", "ref").attr("pointer-events", "none");
    if (zMode) {
      const gl = r => S.globale[r.v.id];
      ref.append("line").attr("y1", bh * 0.15).attr("y2", bh * 0.15).attr("stroke", "#b7b3a9")
        .attr("x1", r => x(z(r.v.id, gl(r).baffo_inf))).attr("x2", r => x(z(r.v.id, gl(r).baffo_sup)));
      ref.append("rect").attr("y", 0).attr("height", bh * 0.3).attr("fill", "var(--global)").attr("rx", 2)
        .attr("x", r => x(z(r.v.id, gl(r).q1))).attr("width", r => Math.max(1, x(z(r.v.id, gl(r).q3)) - x(z(r.v.id, gl(r).q1))));
    }
    const cb = row.append("g").attr("class", "clu").attr("pointer-events", "none");
    const cy = zMode ? 0.68 : 0.5, h0 = zMode ? 0.4 : 0.18, h1 = zMode ? 0.96 : 0.82;
    cb.append("line").attr("class", "wh").attr("y1", bh * cy).attr("y2", bh * cy).attr("stroke-width", 1.5);
    cb.append("line").attr("class", "wl").attr("y1", bh * (cy - 0.18)).attr("y2", bh * (cy + 0.18)).attr("stroke-width", 1.5);
    cb.append("line").attr("class", "wr").attr("y1", bh * (cy - 0.18)).attr("y2", bh * (cy + 0.18)).attr("stroke-width", 1.5);
    cb.append("rect").attr("class", "box").attr("y", bh * h0).attr("height", bh * (h1 - h0)).attr("rx", 2).attr("fill-opacity", 0.85);
    cb.append("line").attr("class", "med").attr("y1", bh * h0).attr("y2", bh * h1).attr("stroke", "#fff").attr("stroke-width", 2.5);
    cb.append("g").attr("class", "out");
    layout.cy = cy;
  }

  function tip(ev, v) {
    const id = VP.stato.clusterCorrente, s = id != null ? S.cluster[id]?.[v.id] : null;
    const u = v.unita ? " " + v.unita : "";
    let h = `<b>${v.nome}</b>${v.codice ? `<br><span style="opacity:.7">${v.codice}</span>` : ""}<br>`;
    if (s) {
      h += `Cluster ${VP.pad2(id)}: mediana <b>${fmt(s.mediana)}${u}</b><br>Q1–Q3 ${fmt(s.q1)} – ${fmt(s.q3)}` +
           `<br>baffi ${fmt(s.baffo_inf)} – ${fmt(s.baffo_sup)} · min/max ${fmt(s.min)} / ${fmt(s.max)}`;
      const no = (s.n_out_inf ?? 0) + (s.n_out_sup ?? 0) || s.outlier?.length || 0;
      h += `<br>n = ${(s.n ?? 0).toLocaleString("it-IT")}${no ? ` · outlier ${no.toLocaleString("it-IT")}` +
           (s.n_out_inf != null ? ` (${s.n_out_inf} sotto, ${s.n_out_sup} sopra)` : "") : ""}`;
    }
    if (zMode) { const gl = S.globale[v.id]; h += `<br>Intera area: mediana ${fmt(gl.mediana)}${u}`; }
    VP.tooltip.show(h, ev.clientX, ev.clientY);
  }

  function draw(id, anim = true) {
    if (!g || !x) return;
    const st = id != null ? S.cluster[id] : null;
    const empty = document.getElementById("box-empty");
    if (empty) empty.style.display = st ? "none" : "flex";
    const col = st ? VP.stato.clusters.get(id)?.colore || "#2f6f5e" : "#2f6f5e";
    const lg = document.querySelector(".lg-c"); if (lg) lg.style.background = col;
    const rows = g.selectAll(".row");
    rows.select(".clu").style("display", st ? null : "none");
    if (!st) return;
    const T = d3.transition().duration(anim ? 350 : 0).ease(d3.easeCubicOut);
    const bh = y.bandwidth(), cy = layout.cy;
    const S_ = r => st[r.v.id] || {};
    const X = (r, k) => x(z(r.v.id, S_(r)[k] ?? S_(r).mediana ?? 0));
    const cb = rows.select(".clu");
    cb.select(".box").attr("fill", col).transition(T).attr("x", r => X(r, "q1")).attr("width", r => Math.max(2, X(r, "q3") - X(r, "q1")));
    cb.select(".med").transition(T).attr("x1", r => X(r, "mediana")).attr("x2", r => X(r, "mediana"));
    cb.select(".wh").attr("stroke", col).transition(T).attr("x1", r => X(r, "baffo_inf")).attr("x2", r => X(r, "baffo_sup"));
    cb.select(".wl").attr("stroke", col).transition(T).attr("x1", r => X(r, "baffo_inf")).attr("x2", r => X(r, "baffo_inf"));
    cb.select(".wr").attr("stroke", col).transition(T).attr("x1", r => X(r, "baffo_sup")).attr("x2", r => X(r, "baffo_sup"));
    // outlier: valori singoli se disponibili, altrimenti min/max quando cadono oltre i baffi
    cb.select(".out").each(function (r) {
      const s = S_(r);
      let pts = s.outlier && s.outlier.length ? s.outlier : [];
      if (!pts.length) {
        if (s.min != null && s.min < s.baffo_inf) pts.push(s.min);
        if (s.max != null && s.max > s.baffo_sup) pts.push(s.max);
      }
      d3.select(this).selectAll("circle").data(pts).join("circle").attr("r", 2.2).attr("cy", bh * cy)
        .attr("fill", "#fff").attr("stroke", col).attr("cx", v => x(z(r.v.id, v)));
    });
    // riferimento in modalità standardizzata: mediane degli altri cluster
    if (!zMode) rows.select(".ref").each(function (r) {
      const altri = Object.entries(S.cluster).filter(([k]) => +k !== id).map(([k, c]) => ({ k: +k, m: c[r.v.id]?.mediana })).filter(d => d.m != null);
      d3.select(this).selectAll("line").data(altri, d => d.k).join("line")
        .attr("y1", bh * 0.05).attr("y2", bh * 0.95).attr("stroke", "#9a968c").attr("stroke-width", 1.2).attr("stroke-opacity", 0.75)
        .attr("x1", d => x(d.m)).attr("x2", d => x(d.m));
    });
  }

  VP.bus.on("cluster", id => draw(id));
  return { init };
})();
