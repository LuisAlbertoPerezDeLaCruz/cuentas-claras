#!/usr/bin/env bash
# Sirve el sitio localmente en http://127.0.0.1:8765
#
# Hay que abrirlo así y NO con doble clic sobre index.html: las rutas del sitio
# son absolutas (/assets/...) porque en producción vive en la raíz del dominio.
# Bajo el protocolo file:// esa barra apunta a la raíz del disco y no carga ni
# el CSS ni el JavaScript.

set -euo pipefail

PUERTO="${1:-8765}"
RAIZ="$(cd "$(dirname "$0")" && pwd)/web"

echo "Sirviendo $RAIZ en http://127.0.0.1:$PUERTO"
echo "Ctrl+C para detener."

# Abre el navegador cuando el servidor ya esté escuchando.
( sleep 1; command -v open >/dev/null && open "http://127.0.0.1:$PUERTO/" ) &

exec python3 -m http.server "$PUERTO" --directory "$RAIZ" --bind 127.0.0.1
