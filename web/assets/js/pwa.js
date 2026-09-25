/*
 * Registro del service worker. Es lo unico que convierte al sitio en una PWA
 * instalable; toda la logica de cache esta en web/sw.js.
 *
 * La ruta 'sw.js' va SIN barra inicial, como el resto del sitio: register()
 * resuelve la ruta contra document.baseURI, o sea contra el <base href> de la
 * pagina. Desde /cuentas-claras/cuotas/ eso da /cuentas-claras/sw.js, que es
 * donde esta. Con barra inicial ('/sw.js') buscaria en la raiz del dominio, que
 * no existe, y la instalacion fallaria en silencio.
 */

'use strict';

(function () {
  // No hay service workers en http:// a secas (si en localhost y en 127.0.0.1),
  // ni bajo file://. Que falte la API no es un error: el sitio funciona igual.
  if (!('serviceWorker' in navigator)) return;

  // Se espera a 'load' para no competir por ancho de banda con el CSS y el JS
  // de la propia pagina, que es lo que el visitante esta esperando ver.
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .catch(function (error) {
        // Un registro fallido no debe romper nada: sin service worker el sitio
        // se comporta como siempre, solo que sin funcionar sin conexion.
        console.warn('No se pudo registrar el service worker:', error.message);
      });
  });
})();
