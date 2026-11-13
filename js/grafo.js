// Pannello grafo force-directed dei dati partecipativi.
// Formato atteso (data/grafo_partecipativo.json):
//   { "nodi":  [{ "id", "etichetta", "gruppo", "peso", "cluster": [id, ...] }],
//     "archi": [{ "source", "target", "peso" }] }
// I nodi associati al cluster corrente vengono evidenziati.
VP.grafo = (() => {
  let svg, node, link, label, sim, nodes, links;

  function init() {
    const root = document.getElementById("graph");
    const data = VP.stato.grafo;
    if (!data) { root.innerHTML = `<div class="empty">Dati partecipativi non ancora disponibili.<br>Aggiungi data/grafo_partecipativo.json</div>`; return; }
    if (data.demo) document.getElementById("graph-note").textContent = "dati dimostrativi";
    nodes = data.nodi.map(d => ({ ...d })); links = data.archi.map(d => ({ ...d }));
    const gruppi = [...new Set(nodes.map(d => d.gruppo))];
    const color = d3.scaleOrdinal(gruppi, ["#4E79A7", "#E15759", "#59A14F", "#B07AA1", "#F28E2B", "#76B7B2"]);
    const r = d3.scaleSqrt().domain(d3.extent(nodes, d => d.peso || 1)).range([4, 12]);

    svg = d3.select(root).append("svg").attr("width", "100%").attr("height", "100%");
    const g = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on("zoom", e => g.attr("transform", e.transform)));

    link = g.append("g").attr("stroke", "#9a9a9a").selectAll("line").data(links).join("line")
      .attr("stroke-width", d => 0.5 + (d.peso || 1) * 0.35).attr("stroke-opacity", 0.35);
    node = g.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("r", d => r(d.peso || 1)).attr("fill", d => color(d.gruppo)).attr("stroke", "#fff").attr("stroke-width", 1.2)
      .on("mousemove", (ev, d) => VP.tooltip.show(`<b>${d.etichetta}</b><br>gruppo: ${d.gruppo}<br>cluster: ${(d.cluster || []).map(VP.pad2).join(", ") || "–"}`, ev.clientX, ev.clientY))
      .on("mouseleave", () => VP.tooltip.hide())
      .call(d3.drag()
        .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    label = g.append("g").selectAll("text").data(nodes).join("text").text(d => d.etichetta)
      .style("font-size", "11.5px").attr("fill", "#1f2328").attr("pointer-events", "none").attr("dx", d => r(d.peso || 1) + 3).attr("dy", "0.35em");

    // legenda gruppi
    const lg = svg.append("g");
    gruppi.forEach((gr, i) => {
      const it = lg.append("g").attr("transform", `translate(0,${i * 14})`);
      it.append("circle").attr("r", 4).attr("fill", color(gr));
      it.append("text").attr("x", 8).attr("dy", "0.35em").style("font-size", "11.5px").attr("fill", "#6b6f76").text(gr);
    });

    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(55).strength(0.25))
      .force("charge", d3.forceManyBody().strength(-120))
      .force("collide", d3.forceCollide(d => r(d.peso || 1) + 6))
      .force("x", d3.forceX()).force("y", d3.forceY())
      .on("tick", () => {
        link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("cx", d => d.x).attr("cy", d => d.y);
        label.attr("x", d => d.x).attr("y", d => d.y);
      });
    const centra = () => { const w = root.clientWidth, h = root.clientHeight; g.attr("transform", null); svg.attr("viewBox", [-w / 2, -h / 2, w, h]); lg.attr("transform", `translate(${-w / 2 + 10},${-h / 2 + 14})`); };
    new ResizeObserver(centra).observe(root); centra();
  }

  VP.bus.on("cluster", id => {
    if (!node) return;
    const on = d => id == null || (d.cluster || []).includes(id);
    node.transition().duration(250).attr("opacity", d => on(d) ? 1 : 0.15).attr("stroke", d => id != null && on(d) ? "#1f2328" : "#fff");
    label.transition().duration(250).attr("opacity", d => on(d) ? 1 : 0.15).style("font-weight", d => id != null && on(d) ? 600 : 400);
    link.transition().duration(250).attr("stroke-opacity", d => id == null ? 0.35 : on(d.source) && on(d.target) ? 0.7 : 0.05);
  });
  return { init };
})();
