# Paesaggio tra misura e percezione

Dashboard web della **mappa degli intorni percepiti** dell'area del Vulture (Basilicata): sei configurazioni di paesaggio
individuate con una rete neurale SuperSOM, le relative ipotesi visuali generate con l'intelligenza artificiale,
i profili statistici degli indicatori e le fotografie del territorio.

Progetto di dottorato in [Landscape Studies for Global and Local Challenges](https://phd-landscape.unibg.it/),
Università degli Studi di Bergamo. **Progetto in corso.**

🌐 **Sito:** https://lorenzotlc.github.io/landscape-dashboard/

La sezione *Il progetto* del sito descrive la ricerca; *Come si usa* spiega i pannelli della dashboard.

---

## Avvio in locale
```sh
./avvia.sh                 # apre http://localhost:8000
# oppure: python3 -m http.server 8000
```
Serve un server locale: aprendo `index.html` con doppio clic il browser blocca la lettura dei dati.
Nessuna compilazione: HTML, CSS e JavaScript statici, librerie in `vendor/`. Internet serve solo per le mappe di sfondo
(OpenStreetMap, OpenTopoMap, Esri; nessuna API key).

## Struttura
```
index.html  css/style.css  assets/ (logo, figure del progetto)
js/     stato.js · modale.js · testi.js · panorama.js · foto.js · mappa.js · boxplot.js · immagini.js · grafo.js · progetto.js · app.js
data/   config.json · cluster.tif (EPSG:3035) · cluster.json · statistiche_cluster.json · etichette_variabili.json
        area_studio.geojson · foto.geojson + foto/ · foto_correzioni.json · testi/ · immagini/cluster_0N/ · grafo_partecipativo.json
        progetto.html (testo della sezione "Il progetto")
tools/  script Python di preparazione dei dati
vendor/ Leaflet 1.9.4 · proj4 2.15 · Pannellum 2.5.6 · georaster 1.6 · georaster-layer-for-leaflet 3.10 · D3 7.9
```
I dati di lavoro originali (`dati_reali/`, PDF, ambiente Python) non sono nel repository: vedi `.gitignore`.

## Aggiornare i dati
Gli script richiedono numpy, rasterio e Pillow: `./installa_dipendenze.sh` crea l'ambiente `.venv`.
```sh
# raster dei cluster, statistiche dei boxplot, confine dell'area
.venv/bin/python tools/prepara_dati.py --cluster dati_reali/supersom_cluster_k6.tif \
    --statistiche dati_reali/boxplot_stats_complete_k6.csv --confine dati_reali/area_studio_32633.geojson
# foto geotaggate (da esportazione qgis2web); correzioni ed esclusioni in data/foto_correzioni.json
.venv/bin/python tools/prepara_foto.py --qgis2web dati_reali/<esportazione_qgis2web>.zip
# testi dei cluster dal PDF dell'interpretazione
.venv/bin/python tools/importa_testi_pdf.py <file>.pdf
# ritaglio delle tavole delle eccezioni e didascalie
.venv/bin/python tools/prepara_immagini.py
```
Le copie delle foto in `data/foto/` sono ridotte e prive di metadati EXIF. Il percorso locale delle foto originali non
viene pubblicato.

- **Testi della pagina "Il progetto":** `data/progetto.html` (HTML semplice). A ogni aggiornamento cambiare la data
  di "ultimo aggiornamento" (due occorrenze di `<time>`).
- **Grafo partecipativo:** `data/grafo_partecipativo.json`, formato
  `{"nodi":[{"id","etichetta","gruppo","peso","cluster":[...]}], "archi":[{"source","target","peso"}]}`;
  con `"demo": true` il pannello segnala che i dati sono dimostrativi.

## Pubblicazione
Il sito è pubblicato con GitHub Pages dal branch `main` (cartella radice). Ogni `git push` aggiorna il sito in un paio di minuti.

## Licenze e crediti
- Codice: [MIT](LICENSE).
- Contenuti (testi, immagini, fotografie, figure, dati derivati): [CC BY-NC 4.0](LICENSE-CONTENUTI.md).
- Dati di partenza: Copernicus Land Monitoring Service, INGV (TINITALY), ISTAT, Dipartimento della Protezione Civile,
  Regione Basilicata (RSDI, Piano Paesaggistico Regionale).

Autore: Lorenzo Amato — Supervisor Prof. Marco Tononi (Università degli Studi di Bergamo),
co-supervisor Ing. Rosa Coluzzi (CNR-IMIOT).
