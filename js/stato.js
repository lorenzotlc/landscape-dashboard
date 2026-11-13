// Stato condiviso e bus di eventi tra i pannelli.
window.VP = window.VP || {};
VP.stato = {
  config: null, clusters: new Map(), stats: null, grafo: null,
  clusterCorrente: null,   // id del cluster mostrato nei pannelli
  bloccato: false,         // true = selezione fissata con un clic
};
VP.bus = (() => {
  const h = {};
  return {
    on: (ev, fn) => (h[ev] = h[ev] || []).push(fn),
    emit: (ev, ...a) => (h[ev] || []).forEach(fn => fn(...a)),
  };
})();
VP.pad2 = n => String(n).padStart(2, "0");
VP.COLORE_NEUTRO = "#7d5a63";   // grigio-bordeaux dei segnaposto quando nessun cluster è selezionato
VP.tooltip = (() => {
  const el = () => document.getElementById("tooltip");
  return {
    show(html, x, y) {
      const t = el(); t.innerHTML = html; t.hidden = false;
      const r = t.getBoundingClientRect();
      t.style.left = Math.min(x + 14, innerWidth - r.width - 8) + "px";
      t.style.top = Math.min(y + 14, innerHeight - r.height - 8) + "px";
    },
    hide() { el().hidden = true; },
  };
})();
document.addEventListener("touchstart", e => { if (!e.target.closest("svg")) VP.tooltip.hide(); }, { passive: true });
