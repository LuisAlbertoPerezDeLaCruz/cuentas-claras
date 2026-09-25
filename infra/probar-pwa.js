/*
 * Comprueba el manifiesto y el service worker de la PWA.
 *
 *   node infra/probar-pwa.js            comprueba
 *   node infra/probar-pwa.js --sellar   ademas actualiza la VERSION de sw.js
 *
 * Por que existe: ninguno de los fallos de una PWA se ve en la pagina.
 *
 *   - Un manifiesto con una ruta mal resuelta no da error: el sitio simplemente
 *     deja de poder instalarse, y no hay nada en pantalla que lo diga.
 *   - Un service worker que se queda con una VERSION vieja sirve el CSS y el
 *     JavaScript de antes del despliegue. La pagina carga perfecta; lo que
 *     muestra es de la semana pasada.
 *   - Un archivo nuevo en web/ que nadie agrego al armazon rompe el sitio solo
 *     cuando el visitante se queda sin conexion, que es justo cuando nadie lo
 *     va a reportar.
 *
 * Y sobre todo: que las tasas NO pasen por la cache del service worker. Ese es
 * el peor fallo posible de esta aplicacion, porque una tasa vieja no se ve como
 * un error, se ve como el numero de hoy.
 *
 * Corre sin servidor y sin navegador: Node resuelve las rutas relativas con el
 * mismo algoritmo (WHATWG URL) que usa el navegador.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const WEB = path.join(RAIZ, 'web');
const ORIGEN = 'https://lapfreelance56.online';
const SELLAR = process.argv.includes('--sellar');

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };
const ok = (msg) => console.log('  ok    ' + msg);

// --- La subruta sale de la plantilla, como en probar-rutas.js ----------------
const plantilla = fs.readFileSync(path.join(__dirname, 'template.yaml'), 'utf8');
const mRutaBase = plantilla.match(/^ {2}RutaBase:[\s\S]*?^ {4}Default: (\S+)$/m);
if (!mRutaBase) throw new Error('No se encontro el parametro RutaBase en la plantilla.');
const BASE = '/' + mRutaBase[1] + '/';

// El manifiesto y el service worker se sirven en la raiz de la subruta, asi que
// sus rutas relativas se resuelven contra ella.
const URL_BASE = ORIGEN + BASE;

console.log('RutaBase de la plantilla: ' + BASE + '\n');

/* Ruta relativa del sitio -> archivo en disco. 'conversor/' es la URL que visita
   la gente; 'conversor/index.html' es la clave del bucket. */
function enDisco(relativa) {
  if (relativa === './') return path.join(WEB, 'index.html');
  if (relativa.endsWith('/')) return path.join(WEB, relativa, 'index.html');
  return path.join(WEB, relativa);
}

function comprobarRuta(quien, relativa) {
  if (relativa.startsWith('/')) {
    fallar(quien + ': "' + relativa + '" es absoluta; tiene que ser relativa a la subruta');
    return false;
  }
  const abs = new URL(relativa, URL_BASE);
  if (!abs.pathname.startsWith(BASE)) {
    fallar(quien + ': "' + relativa + '" resuelve fuera de la subruta -> ' + abs.pathname);
    return false;
  }
  const archivo = enDisco(relativa);
  if (!fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) {
    fallar(quien + ': "' + relativa + '" no existe en web/');
    return false;
  }
  return true;
}

/* ========================= 1. el manifiesto ================================ */

console.log('--- manifest.webmanifest ---');

const rutaManifiesto = path.join(WEB, 'manifest.webmanifest');
let manifiesto;
try {
  manifiesto = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8'));
  ok('es JSON valido');
} catch (e) {
  fallar('manifest.webmanifest no es JSON valido: ' + e.message);
  process.exit(1);
}

for (const campo of ['name', 'short_name', 'display', 'theme_color', 'background_color']) {
  if (!manifiesto[campo]) fallar('al manifiesto le falta "' + campo + '"');
}

// start_url y scope tienen que caer en la subruta. Escritos como './' lo hacen
// solos, porque el navegador los resuelve contra la URL del manifiesto.
for (const campo of ['start_url', 'scope']) {
  const valor = manifiesto[campo];
  if (!valor) { fallar('al manifiesto le falta "' + campo + '"'); continue; }
  if (valor.startsWith('/')) {
    fallar(campo + ' = "' + valor + '" es absoluta; con "./" se resuelve sola contra la subruta');
    continue;
  }
  const resuelta = new URL(valor, URL_BASE).pathname;
  if (resuelta !== BASE) fallar(campo + ' resuelve a ' + resuelta + ' y deberia ser ' + BASE);
  else ok(campo + ' -> ' + resuelta);
}

// "id" se resuelve contra el ORIGEN, no contra la URL del manifiesto: un "./"
// aqui apuntaria a la raiz del dominio. Sin el, vale start_url, que ya es
// correcto; por eso el manifiesto no lo trae.
if ('id' in manifiesto) {
  fallar('el manifiesto trae "id": se resuelve contra el origen, no contra la subruta. Quitalo.');
}

// El color de la barra tiene que ser el mismo del sitio, o al instalarlo se ve
// una franja de otro color encima de la pagina.
const mFondo = fs.readFileSync(path.join(WEB, 'assets/css/base.css'), 'utf8').match(/--fondo:\s*(#[0-9a-f]{6})/i);
if (mFondo && manifiesto.theme_color.toLowerCase() !== mFondo[1].toLowerCase()) {
  fallar('theme_color (' + manifiesto.theme_color + ') no coincide con --fondo de base.css (' + mFondo[1] + ')');
} else if (mFondo) {
  ok('theme_color coincide con --fondo de base.css');
}

/* --- los iconos -------------------------------------------------------------
   Android instala el icono que diga el manifiesto SIN comprobar que el tamano
   declarado sea el real: un PNG de 192 anunciado como 512 se instala borroso. */

function medidasPng(archivo) {
  const b = fs.readFileSync(archivo);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

const proposito = { any: 0, maskable: 0 };

for (const icono of manifiesto.icons || []) {
  if (!comprobarRuta('icons', icono.src)) continue;

  proposito[icono.purpose] = (proposito[icono.purpose] || 0) + 1;

  if (icono.src.endsWith('.png')) {
    const m = medidasPng(enDisco(icono.src));
    if (!m) { fallar(icono.src + ': no parece un PNG'); continue; }
    if (icono.sizes !== m.ancho + 'x' + m.alto) {
      fallar(icono.src + ': declara sizes="' + icono.sizes + '" y el archivo mide ' + m.ancho + 'x' + m.alto);
      continue;
    }
    ok(icono.src + ' (' + icono.sizes + ', ' + icono.purpose + ')');
  } else {
    ok(icono.src + ' (' + icono.sizes + ', ' + icono.purpose + ')');
  }
}

// 192 y 512 son los dos que pide Chrome para ofrecer la instalacion.
for (const medida of ['192x192', '512x512']) {
  const hay = (manifiesto.icons || []).some((i) => i.sizes === medida && i.purpose === 'any');
  if (!hay) fallar('falta un icono de ' + medida + ' con purpose "any"');
}
// Sin uno maskable, Android mete el icono dentro de un circulo blanco.
if (!proposito.maskable) fallar('falta un icono con purpose "maskable"');

for (const atajo of manifiesto.shortcuts || []) comprobarRuta('shortcuts', atajo.url);
if (manifiesto.shortcuts) ok(manifiesto.shortcuts.length + ' atajos');

/* ========================= 2. el service worker ============================ */

console.log('\n--- sw.js ---');

const sw = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');

// --- lo primero: que las tasas no toquen la cache ---------------------------
const FUENTES_DE_TASAS = ['ve.dolarapi.com', 'criptoya.com', 'raw.githubusercontent.com'];

// Se busca en el codigo, no en los comentarios: sw.js explica en un comentario
// por que NO cachea esos dominios, y eso es lo contrario de un fallo.
const swCodigo = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const host of FUENTES_DE_TASAS) {
  if (swCodigo.includes(host)) {
    fallar('sw.js nombra ' + host + ': las tasas no pueden pasar por la cache del service worker');
  }
}

// La garantia no es una lista de dominios, es esta comparacion: a lo que no es
// de este origen no se le llama respondWith(), y el navegador va a la red.
if (!/url\.origin\s*!==\s*self\.location\.origin/.test(swCodigo)) {
  fallar('sw.js ya no compara url.origin con self.location.origin: sin esa linea nada impide cachear las tasas');
} else {
  ok('solo intercepta peticiones de este origen (las tasas van siempre a la red)');
}

if (!/pedido\.method\s*!==\s*'GET'/.test(swCodigo)) fallar('sw.js ya no filtra por metodo GET');

// --- el armazon --------------------------------------------------------------
const mArmazon = sw.match(/var ARMAZON = \[([\s\S]*?)\];/);
if (!mArmazon) { fallar('no se encontro la lista ARMAZON en sw.js'); process.exit(1); }

const ARMAZON = [...mArmazon[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
for (const r of ARMAZON) comprobarRuta('ARMAZON', r);
ok(ARMAZON.length + ' rutas en el armazon, todas dentro de la subruta');

// --- que no falte nada ------------------------------------------------------
// Un archivo nuevo en web/ que no entre al armazon no falla hasta que alguien
// se queda sin conexion. Aqui se compara el armazon con el disco.
function recorrer(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? recorrer(p) : [path.relative(WEB, p)];
  });
}

// Lo que vive en web/ pero el sitio no pide nunca, con el motivo al lado. Es una
// lista corta y explicita a proposito: cualquier otro archivo que aparezca en
// web/ tiene que entrar al armazon o la prueba falla.
const FUERA_DEL_ARMAZON = {
  // El navegador lo vuelve a pedir a la red el solo, para detectar si hay
  // version nueva; cachearlo seria dejarlo sin forma de actualizarse.
  'sw.js': 'lo gestiona el navegador',
  // Es la fuente de la que sale icono-maskable-512.png. No lo pide ninguna
  // pagina ni el manifiesto: se queda aqui para poder regenerar el PNG.
  'assets/iconos/icono-maskable.svg': 'solo fuente de los iconos'
};

const enElDisco = new Set(recorrer(WEB)
  .filter((f) => !(f in FUERA_DEL_ARMAZON))
  .map((f) => {
    if (f === 'index.html') return './';
    if (f.endsWith('/index.html')) return f.slice(0, -'index.html'.length);
    return f;
  }));

const enElArmazon = new Set(ARMAZON);
for (const f of [...enElDisco].sort()) {
  if (!enElArmazon.has(f)) fallar('"' + f + '" existe en web/ y no esta en ARMAZON (no funcionaria sin conexion)');
}
for (const f of [...enElArmazon].sort()) {
  if (!enElDisco.has(f)) fallar('"' + f + '" esta en ARMAZON y ya no existe en web/ (install() fallaria entero)');
}
if (enElDisco.size === enElArmazon.size) ok('el armazon cubre exactamente lo que hay en web/');

// --- la VERSION -------------------------------------------------------------
// El sufijo es un hash del contenido del armazon. Si el CSS cambia y la VERSION
// no, el service worker instalado sigue sirviendo el CSS viejo: la pagina carga
// bien y muestra algo que ya no es.
const resumen = crypto.createHash('sha256');
for (const r of [...ARMAZON].sort()) {
  resumen.update(r);
  const archivo = enDisco(r);
  if (fs.existsSync(archivo)) resumen.update(fs.readFileSync(archivo));
}
const hash = resumen.digest('hex').slice(0, 16);

const mVersion = sw.match(/var VERSION = '([^']*)';/);
if (!mVersion) {
  fallar('no se encontro la constante VERSION en sw.js');
} else {
  const serie = mVersion[1].split('-')[0];
  const esperada = serie + '-' + hash;

  if (mVersion[1] === esperada) {
    ok('VERSION al dia (' + esperada + ')');
  } else if (SELLAR) {
    fs.writeFileSync(path.join(WEB, 'sw.js'), sw.replace(mVersion[0], "var VERSION = '" + esperada + "';"));
    ok('VERSION actualizada: ' + mVersion[1] + ' -> ' + esperada);
  } else {
    fallar('VERSION es "' + mVersion[1] + '" y el armazon ya no es ese. Ejecuta:\n' +
           '             node infra/probar-pwa.js --sellar');
  }
}

/* ========================= 3. las paginas ================================== */

console.log('\n--- paginas ---');

const paginas = recorrer(WEB).filter((f) => f.endsWith('.html'));
for (const p of paginas.sort()) {
  const html = fs.readFileSync(path.join(WEB, p), 'utf8');
  const falta = [];
  if (!html.includes('rel="manifest" href="manifest.webmanifest"')) falta.push('<link rel="manifest">');
  if (!html.includes('name="theme-color"')) falta.push('<meta name="theme-color">');
  if (!html.includes('src="assets/js/pwa.js"')) falta.push('<script src="assets/js/pwa.js">');
  if (falta.length) fallar(p + ': le falta ' + falta.join(', '));
  else ok(p);
}

console.log('\n' + ARMAZON.length + ' rutas en el armazon, ' + paginas.length + ' paginas, ' + fallos + ' fallos.');
process.exit(fallos === 0 ? 0 : 1);
