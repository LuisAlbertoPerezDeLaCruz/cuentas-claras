/*
 * Comprueba que las rutas del sitio resuelven dentro de la subruta y apuntan a
 * archivos que existen.
 *
 *   node infra/probar-rutas.js
 *
 * Por que existe: el fallo de la subruta NO da error. La pagina carga, pero sin
 * CSS ni JavaScript, igual que si se abriera con doble clic. No lo detecta ni
 * validar la plantilla ni mirar la consola por encima.
 *
 * Node resuelve las rutas relativas con el mismo algoritmo (WHATWG URL) que usa
 * el navegador para el <base href>, asi que esto es una reproduccion fiel de lo
 * que hara el visitante, sin necesidad de servidor ni navegador.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const WEB = path.join(RAIZ, 'web');
const ORIGEN = 'https://lapfreelance56.online';

// Cada pagina con la URL en la que se sirve. La 404 se prueba a profundidad,
// porque CloudFront la sirve para cualquier ruta mala del dominio.
const PAGINAS = [
  ['404.html', '/cuentas-claras/no-existe/muy/profundo/'],
  ['index.html', '/cuentas-claras/'],
  ['conversor/index.html', '/cuentas-claras/conversor/'],
  ['iva-igtf/index.html', '/cuentas-claras/iva-igtf/'],
  ['feriados/index.html', '/cuentas-claras/feriados/'],
  ['dividir-cuenta/index.html', '/cuentas-claras/dividir-cuenta/'],
  ['cuotas/index.html', '/cuentas-claras/cuotas/'],
  ['autor/index.html', '/cuentas-claras/autor/']
];

// Rutas que pide el JavaScript y por tanto no aparecen en el HTML.
const RUTAS_DE_JS = [
  ['web/assets/js/feriados.js', 'assets/data/feriados-extra.json']
];

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };

// --- El <base href> y el parametro RutaBase tienen que coincidir --------------
// Si se separan, el sitio se despliega roto y la plantilla valida igual.
const plantilla = fs.readFileSync(path.join(__dirname, 'template.yaml'), 'utf8');
const mRutaBase = plantilla.match(/^ {2}RutaBase:[\s\S]*?^ {4}Default: (\S+)$/m);
if (!mRutaBase) throw new Error('No se encontro el parametro RutaBase en la plantilla.');
const BASE_ESPERADA = '/' + mRutaBase[1] + '/';
console.log('RutaBase de la plantilla: ' + BASE_ESPERADA + '\n');

// --- Resolver cada ruta de cada pagina ---------------------------------------
const referidos = new Map(); // ruta absoluta -> quien la pide

for (const [archivo, urlPagina] of PAGINAS) {
  const html = fs.readFileSync(path.join(WEB, archivo), 'utf8');

  const mBase = html.match(/<base href="([^"]+)">/);
  if (!mBase) { fallar(archivo + ': no tiene <base href>'); continue; }
  if (mBase[1] !== BASE_ESPERADA) {
    fallar(archivo + ': <base href="' + mBase[1] + '"> no coincide con RutaBase (' + BASE_ESPERADA + ')');
    continue;
  }

  // El <base> debe ir antes de cualquier ruta, o el navegador ya empezo a pedir
  // el CSS cuando lo lee.
  const primeraRuta = html.search(/(?:href|src)="(?!\/cuentas)/);
  if (primeraRuta !== -1 && html.indexOf('<base') > primeraRuta) {
    fallar(archivo + ': el <base> va despues de la primera ruta del documento');
  }

  const base = new URL(mBase[1], ORIGEN + urlPagina).href;
  const rutas = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((r) => r !== mBase[1] && !/^(https?:|mailto:|tel:|data:|#)/.test(r));

  if (rutas.length === 0) fallar(archivo + ': no se encontro ninguna ruta interna');

  for (const r of rutas) {
    if (r.startsWith('/')) fallar(archivo + ': "' + r + '" es absoluta; tiene que ser relativa al <base>');
    const abs = new URL(r, base);
    if (!abs.pathname.startsWith(BASE_ESPERADA)) {
      fallar(archivo + ': "' + r + '" resuelve fuera de la subruta -> ' + abs.pathname);
      continue;
    }
    referidos.set(abs.pathname, (referidos.get(abs.pathname) || []).concat(archivo));
  }
}

// --- Lo mismo con las rutas que pide el JavaScript ---------------------------
for (const [archivoJs, rutaEsperada] of RUTAS_DE_JS) {
  const js = fs.readFileSync(path.join(RAIZ, archivoJs), 'utf8');
  if (!js.includes("'" + rutaEsperada + "'")) {
    fallar(archivoJs + ': ya no pide "' + rutaEsperada + '" (¿le pusieron barra inicial?)');
    continue;
  }
  // fetch() con ruta relativa se resuelve contra document.baseURI, igual que el HTML.
  const abs = new URL(rutaEsperada, ORIGEN + BASE_ESPERADA);
  referidos.set(abs.pathname, (referidos.get(abs.pathname) || []).concat(archivoJs));
}

// --- Todo lo referido tiene que existir en el disco --------------------------
console.log('--- ' + referidos.size + ' rutas unicas ---');
for (const ruta of [...referidos.keys()].sort()) {
  const relativa = ruta.slice(BASE_ESPERADA.length);
  const enDisco = path.join(WEB, relativa === '' ? 'index.html' : relativa);
  const candidatos = [enDisco, path.join(enDisco, 'index.html')];
  const existe = candidatos.some((c) => fs.existsSync(c) && fs.statSync(c).isFile());

  if (existe) console.log('  ok    ' + ruta);
  else fallar(ruta + ' no existe en web/ (la piden: ' + referidos.get(ruta).join(', ') + ')');
}

console.log('\n' + PAGINAS.length + ' paginas, ' + referidos.size + ' rutas, ' + fallos + ' fallos.');
process.exit(fallos === 0 ? 0 : 1);
