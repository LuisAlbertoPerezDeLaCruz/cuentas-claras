/*
 * Conversor USD -> Bs. La consulta de tasas vive en tasas.js; aquí solo el cálculo.
 */

'use strict';

(function () {
  var F = window.Formato;

  function $(id) {
    return document.getElementById(id);
  }

  function pintarResultado(id, valor) {
    $(id).textContent = valor === null ? 'No disponible' : F.bs(valor);
  }

  function limpiarResultados(texto) {
    ['res-bcv', 'res-binance', 'res-promedio', 'res-euro'].forEach(function (id) {
      $(id).textContent = texto;
    });
  }

  function calcular() {
    var tasas = window.Tasas.valores;
    var cajaError = $('error-monto');
    var crudo = $('monto').value.trim();

    if (crudo === '') {
      cajaError.hidden = true;
      limpiarResultados('—');
      return;
    }

    var monto = F.aNumeroPositivo(crudo);
    if (monto === null) {
      cajaError.textContent = 'Ingresa un monto en dólares mayor que cero.';
      cajaError.hidden = false;
      limpiarResultados('—');
      return;
    }

    cajaError.hidden = true;

    // 1) Tasa BCV
    pintarResultado('res-bcv', tasas.bcv === null ? null : monto * tasas.bcv);

    // 2) Tasa Binance
    pintarResultado('res-binance', tasas.binance === null ? null : monto * tasas.binance);

    // 3) Promedio entre el dólar BCV y el euro BCV
    var promedio = (tasas.bcv === null || tasas.euro === null)
      ? null
      : monto * ((tasas.bcv + tasas.euro) / 2);
    pintarResultado('res-promedio', promedio);

    // 4) El monto en dólares valorado a la tasa del euro BCV.
    //    En Venezuela a veces se exige cobrar el dólar a tasa euro.
    pintarResultado('res-euro', tasas.euro === null ? null : monto * tasas.euro);
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('formulario').addEventListener('submit', function (evento) {
      evento.preventDefault();
      calcular();
    });

    $('monto').addEventListener('input', calcular);

    // Recalcula cada vez que llegan tasas nuevas (carga inicial y botón actualizar).
    window.Tasas.iniciar(calcular);
  });
})();
