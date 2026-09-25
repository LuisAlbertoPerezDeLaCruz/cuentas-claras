/*
 * Conversor entre dólares y bolívares, en los dos sentidos.
 * La consulta de tasas vive en tasas.js; aquí solo el cálculo.
 *
 * Directo:  bolívares = monto × tasa
 * Inverso:  dólares   = monto ÷ tasa
 */

'use strict';

(function () {
  var F = window.Formato;

  var modoInverso = false;

  /* Cada sentido recuerda su propio monto: si escribiste 100 dólares, te cambias
     a bolívares y vuelves, los 100 siguen ahí. Vacío la primera vez. */
  var montos = { directo: '', inverso: '' };

  function claveModo() {
    return modoInverso ? 'inverso' : 'directo';
  }

  // Cada resultado con su tasa y el texto de la fórmula en cada sentido.
  var RESULTADOS = [
    { id: 'bcv', formula: 'dólar BCV' },
    { id: 'binance', formula: 'dólar Binance' },
    { id: 'promedio', formula: '(dólar BCV + euro BCV) / 2' },
    { id: 'euro', formula: 'euro BCV' }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  // Devuelve la tasa de cada tarjeta, o null si esa fuente no respondió.
  function tasaDe(id) {
    var t = window.Tasas.valores;
    if (id === 'promedio') {
      return (t.bcv === null || t.euro === null) ? null : (t.bcv + t.euro) / 2;
    }
    return t[id];
  }

  function pintarResultado(id, valor) {
    var destino = $('res-' + id);
    if (valor === null) {
      destino.textContent = 'No disponible';
      return;
    }
    destino.textContent = modoInverso ? F.usd(valor) : F.bs(valor);
  }

  function limpiarResultados(texto) {
    RESULTADOS.forEach(function (r) {
      $('res-' + r.id).textContent = texto;
    });
  }

  function pintarFormulas() {
    var signo = modoInverso ? ' ÷ ' : ' × ';
    RESULTADOS.forEach(function (r) {
      $('f-' + r.id).textContent = 'monto' + signo + r.formula;
    });
  }

  function calcular() {
    var cajaError = $('error-monto');

    if ($('monto').value.trim() === '') {
      cajaError.hidden = true;
      limpiarResultados('—');
      return;
    }

    // El campo lleva separadores de miles, así que se lee con CampoMonto.
    var monto = window.CampoMonto.valor($('monto'));
    if (monto === null || monto <= 0) {
      cajaError.textContent = modoInverso
        ? 'Ingresa un monto en bolívares mayor que cero.'
        : 'Ingresa un monto en dólares mayor que cero.';
      cajaError.hidden = false;
      limpiarResultados('—');
      return;
    }

    cajaError.hidden = true;

    RESULTADOS.forEach(function (r) {
      var tasa = tasaDe(r.id);
      if (tasa === null) {
        pintarResultado(r.id, null);
        return;
      }
      pintarResultado(r.id, modoInverso ? monto / tasa : monto * tasa);
    });
  }

  function cambiarModo(inverso) {
    if (inverso === modoInverso) return;

    // Se guarda lo que había en el sentido que se abandona y se recupera lo del
    // sentido al que se entra.
    montos[claveModo()] = $('monto').value;
    modoInverso = inverso;
    $('monto').value = montos[claveModo()];

    $('modo-directo').setAttribute('aria-pressed', String(!inverso));
    $('modo-inverso').setAttribute('aria-pressed', String(inverso));

    $('etiqueta-monto').textContent = inverso
      ? 'Monto en bolívares (Bs)'
      : 'Monto en dólares (USD)';
    $('simbolo').textContent = inverso ? 'Bs' : '$';
    $('monto').placeholder = inverso ? '1.000.000,00' : '100,00';

    pintarFormulas();
    calcular();
  }

  document.addEventListener('DOMContentLoaded', function () {
    // No hay botón de calcular: el resultado se actualiza al escribir. Esto solo
    // evita que pulsar Enter recargue la página.
    $('formulario').addEventListener('submit', function (evento) {
      evento.preventDefault();
    });

    window.CampoMonto.activar($('monto'), function () {
      montos[claveModo()] = $('monto').value;
      calcular();
    });

    $('modo-directo').addEventListener('click', function () { cambiarModo(false); });
    $('modo-inverso').addEventListener('click', function () { cambiarModo(true); });

    pintarFormulas();

    // Recalcula cada vez que llegan tasas nuevas (carga inicial y botón actualizar).
    window.Tasas.iniciar(calcular);
  });
})();
