#!/bin/sh
# Crea un ambiente Python dedicato (.venv) nella cartella del progetto e installa numpy e rasterio,
# necessari solo per gli script in tools/ (la dashboard non ne ha bisogno). Installa anche Pillow per le foto.
# Uso:  ./installa_dipendenze.sh      poi:  .venv/bin/python tools/prepara_dati.py --cluster ... --variabili ...
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/python -m pip install numpy rasterio pillow -q
.venv/bin/python -c "import numpy, rasterio, PIL; print('OK  numpy', numpy.__version__, '· rasterio', rasterio.__version__, '· Pillow', PIL.__version__)"
