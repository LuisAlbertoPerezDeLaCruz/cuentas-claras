/*
 * Comparar contado contra cuotas, y cuota de un préstamo (sistema francés).
 *
 * Cuota francesa:  c = P × i / (1 − (1+i)^−n)
 * Interés implícito de una compra en cuotas: la i que cumple
 *                  contado = cuota × (1 − (1+i)^−n) / i
 * Esa ecuación no se despeja, así que se resuelve por bisección.
 */

'use strict';

(function () {
  var F = window.Formato;

  var esPrestamo = false;

  function $(id) {
    return document.getElementById(id);
  }

  // Valor presente de n cuotas de 1 a la tasa i por período.
  function valorPresente(i, n) {
    if (i === 0) return n;
    return (1 - Math.pow(1 + i, -n)) / i;
  }

  /* Busca la tasa mensual que iguala el valor presente de las cuotas al precio de
     contado. Bisección entre 0 % y 200 % mensual: converge siempre porque el valor
     presente decrece de forma monótona con la tasa. */
  function tasaImplicita(contado, cuota, n) {
    if (cuota * n <= contado) return 0;

    var bajo = 0;
    var alto = 2;

    // Si ni al 200 % mensual el valor presente baja hasta el contado, no hay solución.
    if (cuota * valorPresente(alto, n) > contado) return null;

    for (var k = 0; k < 200; k++) {
      var medio = (bajo + alto) / 2;
      if (cuota * valorPresente(medio, n) > contado) {
        bajo = medio;
      } else {
        alto = medio;
      }
    }
    return (bajo + alto) / 2;
  }

  function error(mensaje) {
    var caja = $('error');
    if (mensaje === null) {
      caja.hidden = true;
      return false;
    }
    caja.textContent = mensaje;
    caja.hidden = false;
    return true;
  }

  function limpiarCompra() {
    ['total-cuotas', 'contado', 'sobrecosto', 'interes'].forEach(function (k) {
      $('v-' + k).textContent = '—';
    });
    $('e-interes').textContent = '';
  }

  function limpiarPrestamo() {
    ['cuota', 'total-pagado', 'intereses'].forEach(function (k) {
      $('v-' + k).textContent = '—';
    });
    $('e-intereses').textContent = '';
  }

  /* ---------------------------- contado vs cuotas -------------------------- */

  function calcularCompra() {
    var contadoCrudo = $('contado').value.trim();
    var cuotaCrudo = $('monto-cuota').value.trim();

    if (contadoCrudo === '' || cuotaCrudo === '') {
      error(null);
      limpiarCompra();
      return;
    }

    var contado = F.aNumeroPositivo(contadoCrudo);
    var cuota = F.aNumeroPositivo(cuotaCrudo);
    var n = F.aEnteroPositivo($('n-cuotas').value.trim());

    if (contado === null) { error('El precio de contado debe ser mayor que cero.'); limpiarCompra(); return; }
    if (cuota === null) { error('El monto de la cuota debe ser mayor que cero.'); limpiarCompra(); return; }
    if (n === null) { error('El número de cuotas debe ser 1 o más.'); limpiarCompra(); return; }

    error(null);

    var totalCuotas = cuota * n;
    var sobrecosto = totalCuotas - contado;
    var pct = (sobrecosto / contado) * 100;

    $('v-total-cuotas').textContent = F.usd(totalCuotas) + ' (' + n + ' × ' + F.usd(cuota) + ')';
    $('v-contado').textContent = F.usd(contado);
    $('v-sobrecosto').textContent = sobrecosto >= 0
      ? F.usd(sobrecosto) + ' (' + F.porcentaje(pct) + ')'
      : 'Sales ganando ' + F.usd(-sobrecosto);

    var i = tasaImplicita(contado, cuota, n);
    if (i === null) {
      $('v-interes').textContent = 'Muy alto para calcular';
      $('e-interes').textContent = 'Las cuotas superan con mucho el precio de contado.';
      return;
    }

    var anual = (Math.pow(1 + i, 12) - 1) * 100;
    $('v-interes').textContent = F.porcentaje(i * 100) + ' mensual';
    $('e-interes').textContent = i === 0
      ? 'Sin recargo: pagas lo mismo que de contado.'
      : 'Equivale a ' + F.porcentaje(anual) + ' efectivo anual';
  }

  /* -------------------------------- préstamo ------------------------------- */

  function calcularPrestamo() {
    var capitalCrudo = $('capital').value.trim();
    var tasaCruda = $('tasa-anual').value.trim();

    if (capitalCrudo === '' || tasaCruda === '') {
      error(null);
      limpiarPrestamo();
      return;
    }

    var capital = F.aNumeroPositivo(capitalCrudo);
    var anual = F.aNumeroNoNegativo(tasaCruda);
    var meses = F.aEnteroPositivo($('meses').value.trim());

    if (capital === null) { error('El monto del préstamo debe ser mayor que cero.'); limpiarPrestamo(); return; }
    if (anual === null) { error('La tasa anual no puede ser negativa.'); limpiarPrestamo(); return; }
    if (meses === null) { error('El plazo debe ser de 1 mes o más.'); limpiarPrestamo(); return; }

    error(null);

    // Tasa nominal anual dividida entre 12, que es como la aplican los bancos.
    var i = (anual / 100) / 12;
    var cuota = i === 0 ? capital / meses : capital / valorPresente(i, meses);
    var total = cuota * meses;
    var intereses = total - capital;

    $('v-cuota').textContent = F.usd(cuota);
    $('v-total-pagado').textContent = F.usd(total) + ' (' + meses + ' cuotas)';
    $('v-intereses').textContent = F.usd(intereses);
    $('e-intereses').textContent = F.porcentaje((intereses / capital) * 100) + ' sobre el capital';
  }

  function calcular() {
    if (esPrestamo) calcularPrestamo(); else calcularCompra();
  }

  function cambiarModo(prestamo) {
    esPrestamo = prestamo;
    $('modo-compra').setAttribute('aria-pressed', String(!prestamo));
    $('modo-prestamo').setAttribute('aria-pressed', String(prestamo));
    $('form-compra').hidden = prestamo;
    $('form-prestamo').hidden = !prestamo;
    $('desglose-compra').hidden = prestamo;
    $('desglose-prestamo').hidden = !prestamo;

    $('nota').innerHTML = prestamo
      ? 'La cuota se calcula por <strong>sistema francés</strong> (cuota fija), que es como la ' +
        'arman los bancos, dividiendo la tasa anual entre doce. Si te ofrecen otra modalidad, ' +
        'compara siempre el <strong>total a pagar</strong>, no el monto de la cuota.'
      : 'El <strong>interés implícito</strong> es la tasa que hace equivalente pagar de contado y ' +
        'pagar en cuotas. Sirve para comparar dos financiamientos distintos: entre dos ofertas, ' +
        'la de menor tasa es la más barata aunque las cuotas se parezcan.';

    error(null);
    calcular();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('form-compra').addEventListener('submit', function (e) { e.preventDefault(); });
    $('form-prestamo').addEventListener('submit', function (e) { e.preventDefault(); });

    ['contado', 'n-cuotas', 'monto-cuota', 'capital', 'tasa-anual', 'meses'].forEach(function (id) {
      $(id).addEventListener('input', calcular);
    });

    $('modo-compra').addEventListener('click', function () { cambiarModo(false); });
    $('modo-prestamo').addEventListener('click', function () { cambiarModo(true); });

    calcular();
  });
})();
