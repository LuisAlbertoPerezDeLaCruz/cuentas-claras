/*
 * IVA (16 % general) e IGTF (3 % sobre pagos en moneda distinta al bolívar).
 *
 * Directo:  subtotal = base × (1 + iva);  total = subtotal × 1,03
 * Inverso:  subtotal = total / 1,03;      base  = subtotal / (1 + iva)
 */

'use strict';

(function () {
  var F = window.Formato;
  var TASA_IGTF = 0.03;

  var modoInverso = false;

  /* Lo que el usuario decidió sobre el IGTF. Se guarda aparte porque al pasar a
     bolívares la casilla se fuerza apagada, y al volver a divisas hay que
     devolverla como él la dejó, no siempre encendida ni siempre apagada. */
  var igtfDeseado = true;

  function $(id) {
    return document.getElementById(id);
  }

  function limpiar(texto) {
    ['base', 'iva', 'subtotal', 'igtf', 'total'].forEach(function (k) {
      $('v-' + k).textContent = texto;
      $('e-' + k).textContent = '';
    });
  }

  // Muestra el importe en la moneda elegida y, debajo, su equivalente en la otra
  // usando la tasa del BCV (la que rige para facturar).
  function pintar(clave, montoUsd, montoBs, moneda) {
    if (moneda === 'usd') {
      $('v-' + clave).textContent = F.usd(montoUsd);
      $('e-' + clave).textContent = montoBs === null ? '' : F.bs(montoBs);
    } else {
      $('v-' + clave).textContent = F.bs(montoBs);
      $('e-' + clave).textContent = montoUsd === null ? '' : F.usd(montoUsd);
    }
  }

  function calcular() {
    var cajaError = $('error-monto');
    var crudo = $('monto').value.trim();
    var moneda = $('moneda').value;
    var iva = Number($('iva').value) / 100;
    var tasaBcv = window.Tasas.valores.bcv;

    /* El IGTF grava los pagos en moneda distinta al bolívar. Si el pago es en
       bolívares no aplica, marque lo que marque la casilla. */
    var pagoEnDivisas = moneda === 'usd';
    var conIgtf = pagoEnDivisas && $('aplica-igtf').checked;

    $('et-iva').textContent = '(' + $('iva').value + ' %)';
    $('simbolo').textContent = moneda === 'usd' ? '$' : 'Bs';

    if (crudo === '') {
      cajaError.hidden = true;
      limpiar('—');
      return;
    }

    // El campo lleva separadores de miles: se lee con CampoMonto, no con parseFloat.
    var monto = window.CampoMonto.valor($('monto'));
    if (monto === null || monto <= 0) {
      cajaError.textContent = 'Ingresa un monto mayor que cero.';
      cajaError.hidden = false;
      limpiar('—');
      return;
    }

    cajaError.hidden = true;

    var factorIgtf = conIgtf ? 1 + TASA_IGTF : 1;
    var base, subtotal, total;

    if (modoInverso) {
      total = monto;
      subtotal = total / factorIgtf;
      base = subtotal / (1 + iva);
    } else {
      base = monto;
      subtotal = base * (1 + iva);
      total = subtotal * factorIgtf;
    }

    var montoIva = subtotal - base;
    var montoIgtf = total - subtotal;

    // Cada importe se expresa en las dos monedas; si no hay tasa, solo en la elegida.
    var partes = { base: base, iva: montoIva, subtotal: subtotal, igtf: montoIgtf, total: total };

    if (!pagoEnDivisas) {
      $('v-igtf').textContent = 'No aplica';
      $('e-igtf').textContent = 'Solo grava pagos en divisas';
      delete partes.igtf;
    }

    Object.keys(partes).forEach(function (clave) {
      var valor = partes[clave];
      var enUsd, enBs;

      if (moneda === 'usd') {
        enUsd = valor;
        enBs = tasaBcv === null ? null : valor * tasaBcv;
      } else {
        enBs = valor;
        enUsd = tasaBcv === null ? null : valor / tasaBcv;
      }

      pintar(clave, enUsd, enBs, moneda);
    });
  }

  function ajustarCasillaIgtf() {
    var enBolivares = $('moneda').value === 'bs';
    var casilla = $('aplica-igtf');

    casilla.disabled = enBolivares;
    casilla.checked = enBolivares ? false : igtfDeseado;

    $('casilla-igtf').dataset.inactiva = enBolivares ? 'si' : 'no';
    $('texto-igtf').textContent = enBolivares
      ? 'IGTF: no aplica en bolívares'
      : 'Cobrar IGTF (3 %)';
  }

  function cambiarModo(inverso) {
    modoInverso = inverso;
    $('modo-directo').setAttribute('aria-pressed', String(!inverso));
    $('modo-inverso').setAttribute('aria-pressed', String(inverso));
    $('etiqueta-monto').textContent = inverso ? 'Total cobrado (con impuestos)' : 'Monto sin impuestos';
    calcular();
  }

  /* El texto lo arma tasas.js, no esta página: hay dos tasas del BCV publicadas a la
     vez (vigente y próximo día hábil) y solo ese módulo sabe cuál está en uso y con
     qué fecha valor. Aquí se RESPETA la preferencia, pero el selector no se repite:
     vive en la portada y en el conversor. */
  function mostrarTasa() {
    $('nota-tasa').textContent = window.Tasas.textoNota();
    calcular();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('formulario').addEventListener('submit', function (e) { e.preventDefault(); });
    window.CampoMonto.activar($('monto'), calcular);
    $('moneda').addEventListener('change', function () {
      ajustarCasillaIgtf();
      calcular();
    });
    $('iva').addEventListener('change', calcular);
    $('aplica-igtf').addEventListener('change', function () {
      if (!$('aplica-igtf').disabled) igtfDeseado = $('aplica-igtf').checked;
      calcular();
    });

    $('modo-directo').addEventListener('click', function () { cambiarModo(false); });
    $('modo-inverso').addEventListener('click', function () { cambiarModo(true); });

    ajustarCasillaIgtf();
    window.Tasas.iniciar(mostrarTasa);
  });
})();
