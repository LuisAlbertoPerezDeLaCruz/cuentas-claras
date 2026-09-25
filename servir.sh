#!/usr/bin/env bash
# Sirve el sitio localmente en http://127.0.0.1:8765/cuentas-claras/
#
# Ojo con la subruta: el sitio NO vive en la raiz del dominio, sino en
# https://lapfreelance56.online/cuentas-claras/. Servirlo aqui en la raiz haria
# que las pruebas locales no representaran produccion, que es justo lo que hay
# que evitar: el <base href> de cada pagina apunta a /cuentas-claras/ y no
# cargaria ni el CSS ni el JavaScript.
#
# Por lo mismo, tampoco abrir web/index.html con doble clic: bajo el protocolo
# file:// ese <base href> apunta a la raiz del disco.

set -euo pipefail

PUERTO="${1:-8765}"
RAIZ="$(cd "$(dirname "$0")" && pwd)/web"
BASE="/cuentas-claras/"

echo "Sirviendo $RAIZ en http://127.0.0.1:$PUERTO$BASE"
echo "Ctrl+C para detener."

# Abre el navegador cuando el servidor ya este escuchando.
( sleep 1; command -v open >/dev/null && open "http://127.0.0.1:$PUERTO$BASE" ) &

exec python3 - "$PUERTO" "$RAIZ" "$BASE" <<'PY'
"""Servidor de pruebas que imita a CloudFront: el sitio cuelga de una subruta,
la raiz del dominio redirige alli y todo lo demas cae en la 404 del sitio.

En produccion la subruta es un prefijo de las claves del bucket S3; aqui no
existe como carpeta, asi que se quita de la ruta antes de buscar en el disco.
"""

import http.server
import os
import sys
import urllib.parse

PUERTO = int(sys.argv[1])
RAIZ = sys.argv[2]
BASE = sys.argv[3]


class Manejador(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=RAIZ, **kwargs)

    def do_GET(self):
        if self.despachar():
            super().do_GET()

    def do_HEAD(self):
        if self.despachar():
            super().do_HEAD()

    def despachar(self):
        """Devuelve True si el pedido lo puede atender el servidor de archivos."""
        ruta = urllib.parse.urlsplit(self.path).path

        # La CloudFront Function manda la raiz del dominio a la subruta.
        if ruta in ('/', '/index.html') or ruta == BASE.rstrip('/'):
            self.redirigir(BASE)
            return False

        if not ruta.startswith(BASE):
            self.pagina_404()
            return False

        if not os.path.exists(self.translate_path(self.path)):
            self.pagina_404()
            return False

        return True

    def translate_path(self, path):
        partes = urllib.parse.urlsplit(path)
        if partes.path.startswith(BASE):
            path = '/' + partes.path[len(BASE):]
        return super().translate_path(path)

    def redirigir(self, destino):
        self.send_response(302)
        self.send_header('Location', destino)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def pagina_404(self):
        with open(os.path.join(RAIZ, '404.html'), 'rb') as f:
            cuerpo = f.read()
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(cuerpo)


try:
    with http.server.ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador) as servidor:
        servidor.serve_forever()
except KeyboardInterrupt:
    print('\nDetenido.')
PY
