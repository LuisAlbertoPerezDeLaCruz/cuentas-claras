/*
 * Cabecera y pie comunes. Se inyectan por JavaScript para tener una sola fuente
 * de verdad de la navegación en vez de repetirla en cada página.
 *
 * El contenido de cada herramienta sí va escrito en su HTML: lo que se inyecta
 * aquí es solo el marco, para no perder indexación en buscadores.
 *
 * Las rutas son absolutas (/conversor/) porque el sitio vive en la raíz del
 * dominio, tanto en CloudFront como al servirlo localmente.
 */

'use strict';

window.Marco = (function () {
  // Cambiar el nombre del sitio aquí lo cambia en todas las páginas.
  var NOMBRE = 'Cuentas';
  var NOMBRE_ACENTO = 'Claras';

  var PAGINAS = [
    { ruta: '/conversor/', texto: 'Conversor' },
    { ruta: '/iva-igtf/', texto: 'IVA e IGTF' },
    { ruta: '/feriados/', texto: 'Feriados' },
    { ruta: '/dividir-cuenta/', texto: 'Dividir cuenta' },
    { ruta: '/cuotas/', texto: 'Cuotas' },
    { ruta: '/autor/', texto: 'Autor' }
  ];

  // "/conversor/index.html" y "/conversor/" son la misma página.
  function rutaActual() {
    return location.pathname.replace(/index\.html$/, '');
  }

  function construirBarra() {
    var actual = rutaActual();

    var enlaces = PAGINAS.map(function (p) {
      var marcador = p.ruta === actual ? ' aria-current="page"' : '';
      return '<a href="' + p.ruta + '"' + marcador + '>' + p.texto + '</a>';
    }).join('');

    var barra = document.createElement('header');
    barra.className = 'barra';
    barra.innerHTML =
      '<div class="barra-interna">' +
      '<a class="marca" href="/">' + NOMBRE + ' <span>' + NOMBRE_ACENTO + '</span></a>' +
      '<nav class="menu" aria-label="Herramientas">' + enlaces + '</nav>' +
      '</div>';
    return barra;
  }

  function construirPie() {
    var pie = document.createElement('footer');
    pie.className = 'pie';
    pie.innerHTML =
      '<p>Las tasas provienen de APIs públicas de terceros y son <strong>referenciales</strong>. ' +
      'Para operaciones oficiales consulta directamente al BCV.</p>' +
      '<p class="pie-creditos">' + NOMBRE + ' ' + NOMBRE_ACENTO + ' — herramientas del día a día. ' +
      '<a href="/autor/">Sobre el autor</a></p>';
    return pie;
  }

  function montar() {
    document.body.insertBefore(construirBarra(), document.body.firstChild);
    document.body.appendChild(construirPie());
  }

  document.addEventListener('DOMContentLoaded', montar);

  return { NOMBRE: NOMBRE + ' ' + NOMBRE_ACENTO, PAGINAS: PAGINAS };
})();
