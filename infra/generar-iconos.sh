#!/usr/bin/env bash
# Regenera los PNG del manifiesto a partir de los dos SVG de web/assets/iconos/.
#
# Los PNG estan comiteados a proposito: el sitio no tiene paso de compilacion y
# el despliegue es un "aws s3 sync" de web/. Este script solo hace falta cuando
# se cambia el dibujo del icono.
#
# Necesita rsvg-convert (brew install librsvg).

set -euo pipefail

cd "$(dirname "$0")/.."
DIR=web/assets/iconos

command -v rsvg-convert >/dev/null || {
  echo "Falta rsvg-convert. Instalalo con: brew install librsvg" >&2
  exit 1
}

# 192 y 512: los dos tamanos que pide el manifiesto.
# 180: el que usa iOS para el icono de la pantalla de inicio (apple-touch-icon).
# 32: favicon de respaldo para los navegadores que no aceptan el SVG.
for medida in 32 180 192 512; do
  rsvg-convert -w "$medida" -h "$medida" "$DIR/icono.svg" -o "$DIR/icono-$medida.png"
done

rsvg-convert -w 512 -h 512 "$DIR/icono-maskable.svg" -o "$DIR/icono-maskable-512.png"

ls -l "$DIR"
