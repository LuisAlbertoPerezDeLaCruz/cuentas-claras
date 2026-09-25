/*
 * Service worker de Cuentas Claras.
 *
 * Vive en /cuentas-claras/sw.js, y no en la raiz del bucket, a proposito: un
 * service worker no puede gobernar rutas por encima de aquella desde la que se
 * sirve. Servido desde la raiz no podria limitarse a la subruta; servido desde
 * la subruta, su alcance es exactamente el sitio.
 *
 * ---------------------------------------------------------------------------
 * LAS TASAS NO SE GUARDAN EN CACHE. NUNCA.
 * ---------------------------------------------------------------------------
 * Es el peor fallo posible en esta aplicacion: una tasa vieja servida desde la
 * cache no se ve como un error, se ve como el numero de hoy, y el visitante
 * calcula un precio equivocado sin enterarse.
 *
 * La garantia no depende de acordarse de una lista de dominios: este archivo
 * solo llama a respondWith() para peticiones GET de ESTE origen y dentro de la
 * subruta. ve.dolarapi.com, criptoya.com y raw.githubusercontent.com son otro
 * origen, asi que salen a la red como si no hubiera service worker. Agregar
 * manana una cuarta fuente de tasas no cambia nada aqui.
 */

'use strict';

/* VERSION identifica la cache. Al cambiarla, install() vuelve a descargar todo
   el armazon y activate() borra la cache anterior.

   El sufijo es un hash del contenido de los archivos de ARMAZON. No es
   decorativo: sin el, editar el CSS y desplegar dejaria a los visitantes con el
   CSS viejo cacheado y sin forma de saberlo. Lo comprueba y lo actualiza
   "node infra/probar-pwa.js --sellar". */
var VERSION = 'v1-b9ea493d6fa710ba';
var CACHE = 'cuentas-claras-' + VERSION;

/* La subruta en la que esta montado el sitio, deducida de la ubicacion de este
   propio archivo en vez de escrita a mano, igual que Marco.BASE la deduce del
   <base href>. Si el sitio se mueve a otra subruta, esto la sigue solo. */
var RAIZ = new URL('./', self.location.href).pathname;

/* El armazon: todo lo que hace falta para que el sitio funcione sin conexion.
   Rutas RELATIVAS a este archivo; una barra inicial las sacaria de la subruta.

   Se guardan las paginas en su forma con barra final ('conversor/'), que es la
   URL que visita la gente y la que consulta la cache, no 'conversor/index.html',
   que es la clave del bucket. */
var ARMAZON = [
  './',
  'conversor/',
  'iva-igtf/',
  'feriados/',
  'dividir-cuenta/',
  'cuotas/',
  'autor/',
  '404.html',
  'manifest.webmanifest',
  'assets/css/base.css',
  'assets/js/campo-monto.js',
  'assets/js/conversor.js',
  'assets/js/cuotas.js',
  'assets/js/dividir.js',
  'assets/js/feriados.js',
  'assets/js/formato.js',
  'assets/js/iva-igtf.js',
  'assets/js/marco.js',
  'assets/js/pwa.js',
  'assets/js/tasas.js',
  'assets/data/feriados-extra.json',
  'assets/iconos/icono.svg',
  'assets/iconos/icono-32.png',
  'assets/iconos/icono-180.png',
  'assets/iconos/icono-192.png',
  'assets/iconos/icono-512.png',
  'assets/iconos/icono-maskable-512.png'
];

/* ------------------------------- instalacion ------------------------------ */

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // cache.addAll() es todo o nada: si un solo archivo falla, la version
        // entera se descarta y sigue mandando la anterior. Es lo que se quiere:
        // mejor una cache vieja completa que una nueva a medias.
        return cache.addAll(ARMAZON);
      })
      // Sin esto la version nueva se queda esperando a que se cierren todas las
      // pestanas abiertas. Aqui es seguro tomar el control de inmediato porque
      // cada pagina carga todo su JavaScript de una vez, con nombres fijos: no
      // hay piezas que se pidan despues y puedan quedar descompasadas entre la
      // version vieja y la nueva.
      .then(function () { return self.skipWaiting(); })
  );
});

/* -------------------------------- activacion ------------------------------ */

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys()
      .then(function (nombres) {
        return Promise.all(nombres.map(function (nombre) {
          // Solo las caches de este sitio, por si el origen aloja algo mas.
          var mia = nombre.indexOf('cuentas-claras-') === 0;
          return (mia && nombre !== CACHE) ? caches.delete(nombre) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* --------------------------------- peticiones ----------------------------- */

function esDeMiSitio(pedido) {
  if (pedido.method !== 'GET') return false;
  var url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return false;   // <- aqui quedan fuera las tasas
  return url.pathname.indexOf(RAIZ) === 0;
}

/* Paginas: primero la red, la cache como respaldo.
   Al reves (cache primero) un despliegue tardaria una visita entera en verse, y
   las paginas no son pesadas: no vale la pena. */
function paginaDeRedOCache(pedido) {
  return fetch(pedido)
    .then(function (respuesta) {
      if (respuesta.ok) {
        var copia = respuesta.clone();
        caches.open(CACHE).then(function (cache) { cache.put(pedido, copia); });
      }
      return respuesta;
    })
    .catch(function () {
      return caches.match(pedido, { ignoreSearch: true })
        .then(function (guardada) {
          // Una ruta que nunca se visito no esta en la cache; sin conexion, al
          // menos se le da la portada, desde la que puede navegar el resto.
          return guardada || caches.match(RAIZ);
        });
    });
}

/* Recursos (CSS, JS, iconos, datos): la cache responde ya y la copia se renueva
   por detras para la proxima visita. */
function recursoDeCacheYRenovar(pedido) {
  return caches.match(pedido).then(function (guardada) {
    var deLaRed = fetch(pedido)
      .then(function (respuesta) {
        if (respuesta.ok) {
          var copia = respuesta.clone();
          caches.open(CACHE).then(function (cache) { cache.put(pedido, copia); });
        }
        return respuesta;
      })
      .catch(function () {
        // Sin conexion y sin copia guardada no hay nada que devolver; que falle
        // el recurso, no la pagina entera.
        return guardada || Response.error();
      });

    return guardada || deLaRed;
  });
}

self.addEventListener('fetch', function (evento) {
  if (!esDeMiSitio(evento.request)) return;   // sin respondWith: va a la red

  if (evento.request.mode === 'navigate') {
    evento.respondWith(paginaDeRedOCache(evento.request));
  } else {
    evento.respondWith(recursoDeCacheYRenovar(evento.request));
  }
});
