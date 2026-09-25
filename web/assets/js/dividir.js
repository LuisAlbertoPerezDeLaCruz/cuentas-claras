/*
 * Dividir la cuenta entre varias personas, con propina.
 *
 * Partes iguales: total × (1 + propina) / personas
 * Por consumo:    a cada quien su consumo + la parte proporcional de la propina.
 */

'use strict';

(function () {
  var F = window.Formato;

  var porConsumo = false;
  var comensales = [
    { nombre: 'Persona 1', monto: '' },
    { nombre: 'Persona 2', monto: '' }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function moneda() {
    return $('moneda').value;
  }

  // Muestra el importe en la moneda elegida y su equivalente en la otra.
  function pintar(clave, valor) {
    var tasa = window.Tasas.valores.bcv;
    var esUsd = moneda() === 'usd';

    $('v-' + clave).textContent = esUsd ? F.usd(valor) : F.bs(valor);

    var equivalente = $('e-' + clave);
    if (!equivalente) return;
    if (tasa === null) {
      equivalente.textContent = '';
    } else {
      equivalente.textContent = esUsd ? F.bs(valor * tasa) : F.usd(valor / tasa);
    }
  }

  function limpiar(texto) {
    ['cuenta', 'propina', 'total', 'persona'].forEach(function (k) {
      $('v-' + k).textContent = texto;
      $('e-' + k).textContent = '';
    });
    $('reparto').hidden = true;
  }

  function error(mensaje) {
    var caja = $('error');
    if (mensaje === null) {
      caja.hidden = true;
      return false;
    }
    caja.textContent = mensaje;
    caja.hidden = false;
    limpiar('—');
    return true;
  }

  /* ----------------------------- lista editable --------------------------- */

  function pintarLista() {
    var simbolo = moneda() === 'usd' ? '$' : 'Bs';

    $('lista-personas').innerHTML = comensales.map(function (c, i) {
      return '<li>' +
        '<input class="nombre-persona" data-i="' + i + '" type="text" value="' + c.nombre +
        '" aria-label="Nombre de la persona ' + (i + 1) + '" ' +
        'style="flex:1;background:transparent;border:0;color:inherit;font:inherit;outline:none;">' +
        '<span class="fecha-item">' + simbolo + ' ' +
        '<input class="monto-persona" data-i="' + i + '" type="text" inputmode="decimal" ' +
        'value="' + c.monto + '" placeholder="0,00" aria-label="Consumo de ' + c.nombre + '" ' +
        'style="width:90px;background:transparent;border:0;color:inherit;font:inherit;' +
        'text-align:right;outline:none;">' +
        '</span></li>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('.nombre-persona'), function (el) {
      el.addEventListener('input', function () {
        comensales[Number(el.dataset.i)].nombre = el.value;
      });
    });

    // Los campos se recrean en cada pintado, así que se vuelven a conectar.
    Array.prototype.forEach.call(document.querySelectorAll('.monto-persona'), function (el) {
      window.CampoMonto.activar(el, function () {
        comensales[Number(el.dataset.i)].monto = el.value;
        calcular();
      });
    });
  }

  /* -------------------------------- cálculo -------------------------------- */

  function calcular() {
    var propinaPct = F.aNumeroNoNegativo($('propina').value.trim());
    if (propinaPct === null) return error('La propina debe ser un porcentaje de cero o más.');

    $('et-propina').textContent = '(' + propinaPct + ' %)';
    $('simbolo').textContent = moneda() === 'usd' ? '$' : 'Bs';

    var factor = 1 + propinaPct / 100;

    if (porConsumo) {
      var montos = comensales.map(function (c) {
        return c.monto.trim() === '' ? 0 : window.CampoMonto.valor(c.monto);
      });

      if (montos.some(function (m) { return m === null; })) {
        return error('Hay un consumo que no es un número válido.');
      }

      var cuenta = montos.reduce(function (a, b) { return a + b; }, 0);
      if (cuenta <= 0) {
        error(null);
        limpiar('—');
        return;
      }

      error(null);
      var propina = cuenta * (propinaPct / 100);
      var total = cuenta + propina;

      pintar('cuenta', cuenta);
      pintar('propina', propina);
      pintar('total', total);

      // La propina se reparte en proporción a lo que consumió cada quien.
      var esUsd = moneda() === 'usd';
      $('reparto').innerHTML = comensales.map(function (c, i) {
        var pagar = montos[i] * factor;
        return '<li><span>' + (c.nombre || 'Persona ' + (i + 1)) + '</span>' +
          '<span class="fecha-item">' + (esUsd ? F.usd(pagar) : F.bs(pagar)) + '</span></li>';
      }).join('');
      $('reparto').hidden = false;
      $('fila-por-persona').hidden = true;
      return;
    }

    // Partes iguales
    $('fila-por-persona').hidden = false;
    $('reparto').hidden = true;

    var crudo = $('total').value.trim();
    if (crudo === '') {
      error(null);
      limpiar('—');
      return;
    }

    var cuentaIgual = window.CampoMonto.valor($('total'));
    if (cuentaIgual === null || cuentaIgual <= 0) return error('Ingresa un total mayor que cero.');

    var personas = F.aEnteroPositivo($('personas').value.trim());
    if (personas === null) return error('El número de personas debe ser 1 o más.');

    error(null);

    var propinaIgual = cuentaIgual * (propinaPct / 100);
    var totalIgual = cuentaIgual + propinaIgual;

    pintar('cuenta', cuentaIgual);
    pintar('propina', propinaIgual);
    pintar('total', totalIgual);
    pintar('persona', totalIgual / personas);
  }

  function cambiarModo(consumo) {
    porConsumo = consumo;
    $('modo-igual').setAttribute('aria-pressed', String(!consumo));
    $('modo-consumo').setAttribute('aria-pressed', String(consumo));
    $('campo-total').hidden = consumo;
    $('campo-personas').hidden = consumo;
    $('zona-consumo').hidden = !consumo;
    // "Cada persona paga" solo tiene sentido repartiendo en partes iguales;
    // por consumo cada quien paga algo distinto y va en la lista de abajo.
    $('fila-por-persona').hidden = consumo;
    if (consumo) pintarLista();
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

    window.CampoMonto.activar($('total'), calcular);

    ['personas', 'propina'].forEach(function (id) {
      $(id).addEventListener('input', calcular);
    });

    $('moneda').addEventListener('change', function () {
      if (porConsumo) pintarLista();
      calcular();
    });

    $('modo-igual').addEventListener('click', function () { cambiarModo(false); });
    $('modo-consumo').addEventListener('click', function () { cambiarModo(true); });

    $('btn-agregar').addEventListener('click', function () {
      comensales.push({ nombre: 'Persona ' + (comensales.length + 1), monto: '' });
      pintarLista();
      calcular();
    });

    window.Tasas.iniciar(mostrarTasa);
  });
})();
