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
    var conIgtf = $('aplica-igtf').checked;
    var tasaBcv = window.Tasas.valores.bcv;

    $('et-iva').textContent = '(' + $('iva').value + ' %)';
    $('simbolo').textContent = moneda === 'usd' ? '$' : 'Bs';

    if (crudo === '') {
      cajaError.hidden = true;
      limpiar('—');
      return;
    }

    var monto = F.aNumeroPositivo(crudo);
    if (monto === null) {
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

  function cambiarModo(inverso) {
    modoInverso = inverso;
    $('modo-directo').setAttribute('aria-pressed', String(!inverso));
    $('modo-inverso').setAttribute('aria-pressed', String(inverso));
    $('etiqueta-monto').textContent = inverso ? 'Total cobrado (con impuestos)' : 'Monto sin impuestos';
    calcular();
  }

  function mostrarTasa() {
    var tasa = window.Tasas.valores.bcv;
    $('nota-tasa').textContent = tasa === null
      ? 'No se pudo consultar la tasa del BCV: los importes se muestran solo en la moneda elegida.'
      : 'Equivalencias calculadas con la tasa BCV vigente: ' + F.tasa(tasa) + ' por dólar.';
    calcular();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('formulario').addEventListener('submit', function (e) { e.preventDefault(); });
    $('monto').addEventListener('input', calcular);
    $('moneda').addEventListener('change', calcular);
    $('iva').addEventListener('change', calcular);
    $('aplica-igtf').addEventListener('change', calcular);

    $('modo-directo').addEventListener('click', function () { cambiarModo(false); });
    $('modo-inverso').addEventListener('click', function () { cambiarModo(true); });

    window.Tasas.iniciar(mostrarTasa);
  });
})();
