// Finestra popup riutilizzabile per i testi (descrizione del cluster, parte centrale, eccezioni).
// Desktop: finestra centrata; smartphone: a tutto schermo. Si chiude con ×, Esc o clic sullo sfondo.
VP.modale = (() => {
  let el, ultimoFocus;
  function crea() {
    el = document.createElement("div");
    el.className = "modale"; el.hidden = true;
    el.innerHTML = `<div class="modale-box" role="dialog" aria-modal="true" aria-labelledby="modale-titolo">
        <header class="modale-h"><span class="modale-sw"></span>
          <div class="modale-tt"><div class="modale-sopra"></div><h3 id="modale-titolo"></h3></div>
          <button class="modale-x" aria-label="${VP.t("Chiudi")}">×</button></header>
        <div class="modale-corpo"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".modale-x")) chiudi(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !el.hidden) chiudi(); });
  }
  function apri({ sopra = "", titolo = "", html = "", colore = null, largo = false }) {
    if (!el) crea();
    ultimoFocus = document.activeElement;
    el.querySelector(".modale-sopra").textContent = sopra;
    el.querySelector("#modale-titolo").textContent = titolo;
    el.querySelector(".modale-corpo").innerHTML = html;
    el.querySelector(".modale-corpo").scrollTop = 0;
    el.style.setProperty("--mcol", colore || "var(--cur, #ccc)");
    el.classList.toggle("largo", largo);
    el.hidden = false; document.body.classList.add("modale-aperta");
    el.querySelector(".modale-x").focus();
  }
  function chiudi() {
    if (!el) return;
    el.hidden = true; document.body.classList.remove("modale-aperta");
    ultimoFocus?.focus?.();
  }
  return { apri, chiudi };
})();
