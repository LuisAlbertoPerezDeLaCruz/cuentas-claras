/*
 * Ejecuta el service worker de verdad, en Node, con un entorno simulado.
 *
 *   node infra/probar-sw.js
 *
 * probar-pwa.js lee sw.js como texto: comprueba que la lista del armazon sea
 * correcta y que la linea que filtra por origen siga ahi. Esto es otra cosa:
 * aqui el archivo se CARGA y sus manejadores se DISPARAN, asi que lo que se
 * comprueba es el comportamiento, no el codigo fuente.
 *
 * Sirve sobre todo para lo que en el navegador no se puede provocar comodamente:
 * quedarse sin conexion. Aqui basta con hacer que fetch() falle.
 *
 * Lo que NO cubre: que el navegador registre el service worker de verdad, que la
 * instalacion se ofrezca y como se ve el icono instalado. Eso hay que mirarlo en
 * Chrome, en DevTools > Application.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const ORIGEN = 'https://lapfreelance56.online';
const BASE = '/cuentas-claras/';

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };
const ok = (msg) => console.log('  ok    ' + msg);

/* ======================= el entorno simulado =============================== */

// Una respuesta minima, con lo poco que usa sw.js.
function respuesta(cuerpo, opciones) {
  const o = opciones || {};
  return {
    cuerpo: cuerpo,
    ok: o.ok !== false,
    status: o.ok === false ? 404 : 200,
    clone: function () { return respuesta(cuerpo, o); }
  };
}

function crearEntorno() {
  const almacen = new Map();          // nombre de cache -> Map(url -> respuesta)
  const manejadores = {};
  const pedidosALaRed = [];
  let red = null;                     // funcion url -> respuesta, o null = sin conexion

  function cacheDe(nombre) {
    if (!almacen.has(nombre)) almacen.set(nombre, new Map());
    const m = almacen.get(nombre);
    return {
      addAll: (rutas) => Promise.all(rutas.map((r) => {
        const url = new URL(r, ORIGEN + BASE + 'sw.js').href;
        const res = red && red(url);
        if (!res || !res.ok) return Promise.reject(new Error('no se pudo cachear ' + r));
        m.set(url, res);
        return Promise.resolve();
      })).then(() => undefined),
      put: (pedido, res) => { m.set(pedido.url || String(pedido), res); return Promise.resolve(); }
    };
  }

  const entorno = {
    self: {
      location: { href: ORIGEN + BASE + 'sw.js', origin: ORIGEN },
      addEventListener: (nombre, fn) => { manejadores[nombre] = fn; },
      skipWaiting: () => Promise.resolve('skipWaiting'),
      clients: { claim: () => Promise.resolve('claim') }
    },
    caches: {
      open: (nombre) => Promise.resolve(cacheDe(nombre)),
      keys: () => Promise.resolve([...almacen.keys()]),
      delete: (nombre) => Promise.resolve(almacen.delete(nombre)),
      match: (pedido) => {
        const url = pedido.url || new URL(String(pedido), ORIGEN).href;
        for (const m of almacen.values()) if (m.has(url)) return Promise.resolve(m.get(url));
        return Promise.resolve(undefined);
      }
    },
    fetch: (pedido) => {
      const url = pedido.url || String(pedido);
      pedidosALaRed.push(url);
      if (!red) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(red(url));
    },
    Response: { error: () => respuesta(null, { ok: false }) }
  };

  return {
    entorno,
    manejadores,
    almacen,
    pedidosALaRed,
    conectar: (fn) => { red = fn; },
    desconectar: () => { red = null; }
  };
}

// El sitio entero respondiendo bien.
function sitioEnLinea(url) {
  return respuesta('contenido de ' + url);
}

function cargarSw(entorno) {
  const fuente = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  new Function('self', 'caches', 'fetch', 'Response', 'URL', fuente)(
    entorno.self, entorno.caches, entorno.fetch, entorno.Response, URL);
}

// Un evento como el que recibe sw.js, guardando si se llamo a respondWith.
function evento(url, opciones) {
  const o = opciones || {};
  const e = {
    request: { url: url, method: o.method || 'GET', mode: o.mode || 'no-cors' },
    respondio: false,
    respuesta: null,
    respondWith: function (p) { e.respondio = true; e.respuesta = p; },
    waitUntil: function (p) { e.espera = p; }
  };
  return e;
}

/* ======================= 1. instalacion y activacion ======================= */

console.log('--- instalacion ---');

const c = crearEntorno();
c.conectar(sitioEnLinea);
cargarSw(c.entorno);

const evInstall = evento('install');
c.manejadores.install(evInstall);

(async function () {
  await evInstall.espera;

  const nombres = [...c.almacen.keys()];
  if (nombres.length !== 1) fallar('install() dejo ' + nombres.length + ' caches, esperaba 1');
  else ok('install() creo la cache ' + nombres[0]);

  const guardadas = c.almacen.get(nombres[0]);
  ok('el armazon quedo guardado: ' + guardadas.size + ' entradas');

  // Las paginas se guardan por su URL con barra final, que es la que pide el
  // navegador al navegar; 'conversor/index.html' nunca se pide.
  const portada = ORIGEN + BASE;
  if (!guardadas.has(portada)) fallar('la portada no quedo en la cache como ' + portada);
  else ok('la portada esta en la cache como ' + portada);

  /* --- activacion: borra las caches viejas y respeta las ajenas ----------- */
  console.log('\n--- activacion ---');

  c.almacen.set('cuentas-claras-v0-viejisima', new Map());
  c.almacen.set('otra-cosa-v3', new Map());

  const evActivate = evento('activate');
  c.manejadores.activate(evActivate);
  await evActivate.espera;

  const quedan = [...c.almacen.keys()];
  if (quedan.includes('cuentas-claras-v0-viejisima')) fallar('activate() no borro la cache vieja del sitio');
  else ok('activate() borro la cache de la version anterior');

  if (!quedan.includes('otra-cosa-v3')) fallar('activate() borro una cache que no es del sitio');
  else ok('activate() no toco las caches ajenas');

  /* ================== 2. las tasas nunca pasan por la cache ============== */

  console.log('\n--- las tasas (lo que no debe interceptar) ---');

  const AJENAS = [
    'https://ve.dolarapi.com/v1/dolares/oficial',
    'https://ve.dolarapi.com/v1/euros/oficial',
    'https://criptoya.com/api/binancep2p/usdt/ves/1',
    'https://raw.githubusercontent.com/JCZR2000/ComercioPrecioAPI/main/tasas_cambio.json'
  ];

  for (const url of AJENAS) {
    const e = evento(url);
    c.manejadores.fetch(e);
    if (e.respondio) fallar('intercepto ' + url + ': podria servir una tasa vieja desde la cache');
    else ok('no intercepta ' + new URL(url).host);
  }

  // El caso que de verdad distingue "filtrar por origen" de "filtrar por ruta":
  // otro dominio cuya ruta empieza igual que la subruta. Filtrando solo por la
  // ruta, este se colaria a la cache; es exactamente el agujero por el que se
  // serviria una tasa vieja si alguien quitara la comparacion de origenes.
  const eImpostor = evento('https://otro-dominio.com' + BASE + 'tasas.json');
  c.manejadores.fetch(eImpostor);
  if (eImpostor.respondio) {
    fallar('intercepto otro dominio con la misma ruta: filtra por ruta y no por origen');
  } else {
    ok('no intercepta otro dominio aunque su ruta empiece por la subruta');
  }

  // Y tampoco lo que no es GET ni lo que cae fuera de la subruta.
  const fuera = [
    [evento(ORIGEN + BASE + 'conversor/', { method: 'POST' }), 'un POST'],
    [evento(ORIGEN + '/otra-cosa/'), 'una ruta fuera de la subruta'],
    [evento(ORIGEN + '/cuentas-claras-falso/pagina'), 'una subruta que solo empieza igual']
  ];
  for (const [e, que] of fuera) {
    c.manejadores.fetch(e);
    if (e.respondio) fallar('intercepto ' + que);
    else ok('no intercepta ' + que);
  }

  /* ================== 3. con conexion ==================================== */

  console.log('\n--- con conexion ---');

  const eCss = evento(ORIGEN + BASE + 'assets/css/base.css');
  c.manejadores.fetch(eCss);
  if (!eCss.respondio) { fallar('no intercepto el CSS del propio sitio'); }
  else {
    const r = await eCss.respuesta;
    ok('el CSS lo sirve la cache al instante (' + (r && r.ok ? 'respuesta valida' : 'sin respuesta') + ')');
  }

  // Una pagina se pide siempre a la red primero, para que un despliegue se vea
  // en la visita siguiente y no dos visitas despues.
  c.pedidosALaRed.length = 0;
  const eNav = evento(ORIGEN + BASE + 'cuotas/', { mode: 'navigate' });
  c.manejadores.fetch(eNav);
  await eNav.respuesta;
  if (!c.pedidosALaRed.includes(ORIGEN + BASE + 'cuotas/')) {
    fallar('la pagina no se pidio a la red: un despliegue tardaria en verse');
  } else {
    ok('las paginas se piden a la red primero');
  }

  /* ================== 4. sin conexion ==================================== */

  console.log('\n--- sin conexion ---');

  c.desconectar();

  const eNavSin = evento(ORIGEN + BASE + 'cuotas/', { mode: 'navigate' });
  c.manejadores.fetch(eNavSin);
  const rNav = await eNavSin.respuesta;
  if (!rNav || !rNav.ok) fallar('sin conexion, una pagina ya visitada no se sirvio desde la cache');
  else ok('sin conexion, las paginas salen de la cache');

  const eCssSin = evento(ORIGEN + BASE + 'assets/css/base.css');
  c.manejadores.fetch(eCssSin);
  const rCss = await eCssSin.respuesta;
  if (!rCss || !rCss.ok) fallar('sin conexion, el CSS no se sirvio desde la cache');
  else ok('sin conexion, el CSS sale de la cache');

  // Una ruta que el visitante nunca abrio no esta guardada; en vez de un error
  // del navegador se le da la portada, desde la que puede seguir navegando.
  const eDesconocida = evento(ORIGEN + BASE + 'no-la-visito-nunca/', { mode: 'navigate' });
  c.manejadores.fetch(eDesconocida);
  const rDesconocida = await eDesconocida.respuesta;
  if (!rDesconocida || !rDesconocida.ok) fallar('sin conexion, una ruta no visitada no cayo en la portada');
  else ok('sin conexion, una ruta no visitada cae en la portada');

  // Y lo mas importante del modo sin conexion: las tasas siguen sin tocarse.
  for (const url of AJENAS) {
    const e = evento(url);
    c.manejadores.fetch(e);
    if (e.respondio) fallar('sin conexion intercepto ' + url + ': serviria una tasa vieja');
  }
  ok('sin conexion tampoco intercepta las tasas: fallan, que es lo correcto');

  console.log('\n' + (fallos === 0 ? 'Todo en orden.' : fallos + ' fallos.'));
  process.exit(fallos === 0 ? 0 : 1);
})();
