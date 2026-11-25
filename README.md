# Landscape between Measurement and Perception

*Paesaggio tra misura e percezione*

Web dashboard of the **map of perceived surroundings** of the Vulture area (Basilicata, southern Italy): six landscape
configurations identified with a SuperSOM neural network, the corresponding visual hypotheses generated with artificial
intelligence, the statistical profiles of the indicators and photographs of the territory.

PhD project in [Landscape Studies for Global and Local Challenges](https://phd-landscape.unibg.it/),
University of Bergamo. **Ongoing project.**

🌐 **Website:** https://lorenzotlc.github.io/landscape-dashboard/ (Italian by default; English: [?lang=en](https://lorenzotlc.github.io/landscape-dashboard/?lang=en))

The *Project* section of the website describes the research; *How to use* explains the dashboard panels.

---

## Running locally
```sh
./avvia.sh                 # opens http://localhost:8000
# or: python3 -m http.server 8000
```
A local server is required: opening `index.html` with a double click makes the browser block access to the data.
No build step: static HTML, CSS and JavaScript, libraries in `vendor/`. An internet connection is only needed for the
base maps (OpenStreetMap, OpenTopoMap, Esri; no API key).

## Structure
```
index.html  css/style.css  assets/ (logo, project figures)
js/     stato.js · lingua.js · modale.js · testi.js · panorama.js · foto.js · mappa.js · boxplot.js · immagini.js
        survey.js · progetto.js · app.js
data/   config.json · cluster.tif (EPSG:3035) · cluster.json · statistiche_cluster.json · etichette_variabili.json
        area_studio.geojson · foto.geojson + foto/ · foto_correzioni.json · testi/ · immagini/cluster_0N/ · survey.json
        progetto.html (text of the "Project" section)
tools/  Python data-preparation scripts
vendor/ Leaflet 1.9.4 · proj4 2.15 · Pannellum 2.5.6 · georaster 1.6 · georaster-layer-for-leaflet 3.10 · D3 7.9
```
The original working data (`dati_reali/`, PDFs, Python environment) are not in the repository: see `.gitignore`.

## Languages (Italian / English)
The dashboard is bilingual; Italian is the default. The IT/EN selector in the top bar reloads the page in the chosen
language (keeping the selected cluster), stores the choice in the browser and sets `?lang=en` in the address.
- **Interface:** strings are written in Italian in the code and go through `VP.t("…")`; the English dictionary
  (keyed by the Italian text) is in `js/lingua.js`. Static HTML uses the `data-i18n`, `data-i18n-title` and
  `data-i18n-aria` attributes.
- **Data fields:** English values sit next to the Italian ones with an `_en` suffix (`titolo_en` in `config.json`,
  `nome_en` / `gruppo_en` in `etichette_variabili.json`, `valori_en`, `classi[].nome_en`, `termini_en`… in `survey.json`).
- **Texts:** English files sit next to the Italian ones with `.en` before the extension:
  `data/testi/cluster_0N.en.txt`, `data/immagini/cluster_0N/didascalie.en.json`, `data/progetto.en.html`.
  If an English file is missing, the Italian one is used.

When a text is updated in Italian, update its `.en` counterpart too.

## Updating the data
The scripts require numpy, rasterio and Pillow: `./installa_dipendenze.sh` creates the `.venv` environment.
```sh
# cluster raster, boxplot statistics, study-area boundary
.venv/bin/python tools/prepara_dati.py --cluster dati_reali/supersom_cluster_k6.tif \
    --statistiche dati_reali/boxplot_stats_complete_k6.csv --confine dati_reali/area_studio_32633.geojson
# geotagged photos (from a qgis2web export); corrections and exclusions in data/foto_correzioni.json
.venv/bin/python tools/prepara_foto.py --qgis2web dati_reali/<qgis2web_export>.zip
# cluster texts from the interpretation PDF
.venv/bin/python tools/importa_testi_pdf.py <file>.pdf
# cropping of the exception plates and captions
.venv/bin/python tools/prepara_immagini.py
```
The copies of the photos in `data/foto/` are downscaled and stripped of EXIF metadata. The local path of the original
photos is not published.

- **"Project" page texts:** `data/progetto.html` (Italian) and `data/progetto.en.html` (English), plain HTML.
  At every update change the "last updated" date (two `<time>` elements in each file).
- **Survey data:** `data/survey.json`, aggregated answers per cluster and stakeholder group (values, development
  priorities, recognisability, conflicts between values, keywords and omissions). With `"demo": true` the panel and the
  map show that the data are fictitious. Groups with fewer than `n_minimo` respondents are not shown.

## Publishing
The website is published with GitHub Pages from the `main` branch (root folder). Every `git push` updates the site
within a couple of minutes.

## Licences and credits
- Code: [MIT](LICENSE).
- Content (texts, images, photographs, figures, derived data): [CC BY-NC 4.0](LICENSE-CONTENUTI.md).
- Source data: Copernicus Land Monitoring Service, INGV (TINITALY), ISTAT, Italian Civil Protection Department,
  Basilicata Region (RSDI, Regional Landscape Plan).

Author: Lorenzo Amato — Supervisor Prof. Marco Tononi (University of Bergamo),
co-supervisor Ing. Rosa Coluzzi (CNR-IMIOT).
