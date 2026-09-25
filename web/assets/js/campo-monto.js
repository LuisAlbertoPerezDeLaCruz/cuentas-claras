/*
 * Campos de monto con formato venezolano mientras se escribe: al teclear
 * 1250000 se ve 1.250.000, y al salir del campo queda 1.250.000,00.
 *
 * Hace falta un módulo aparte porque <input type="number"> NO admite separadores
 * de miles: el navegador considera "1.250.000" un valor inválido y lo descarta.
 * Por eso estos campos son type="text" con inputmode="decimal", y por eso NUNCA
 * deben leerse con parseFloat directo: parseFloat("1.250.000") devuelve 1,25.
 * Usar siempre CampoMonto.valor(input).
 *
 * Convención, la misma que muestran los resultados:
 *   "."  separador de miles (lo pone esta función, se ignora al leer)
 *   ","  separador decimal
 */

'use strict';

window.CampoMonto = (function () {
  var DECIMALES = 2;

  // Deja solo dígitos y una coma decimal. Los puntos se descartan porque los
  // ponemos nosotros como separador de miles.
  function limpiar(texto) {
    var sinPuntos = String(texto).replace(/\./g, '');
    var soloValidos = sinPuntos.replace(/[^0-9,]/g, '');

    var partes = soloValidos.split(',');
    if (partes.length === 1) return partes[0];

    // Una sola coma: el resto de comas se ignora.
    return partes[0] + ',' + partes.slice(1).join('');
  }

  function agruparMiles(digitos) {
    return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // "1250000,5" -> "1.250.000,5"
  function formatear(texto) {
    var limpio = limpiar(texto);
    if (limpio === '') return '';

    var partes = limpio.split(',');
    var entero = agruparMiles(partes[0]);

    if (partes.length === 1) return entero;
    // Se respeta lo que lleve escrito de decimales; el cuadre a dos ocurre al salir.
    return entero + ',' + partes[1].slice(0, DECIMALES);
  }

  /* Al reformatear se reescribe todo el contenido, así que el cursor saltaría al
     final. Se cuenta cuántos caracteres significativos (dígitos y coma) hay antes
     del cursor y se vuelve a colocar tras esa misma cantidad. */
  function significativosAntesDe(texto, posicion) {
    var cuenta = 0;
    for (var i = 0; i < posicion && i < texto.length; i++) {
      if (/[0-9,]/.test(texto[i])) cuenta++;
    }
    return cuenta;
  }

  function posicionTras(texto, significativos) {
    if (significativos === 0) return 0;
    var cuenta = 0;
    for (var i = 0; i < texto.length; i++) {
      if (/[0-9,]/.test(texto[i])) {
        cuenta++;
        if (cuenta === significativos) return i + 1;
      }
    }
    return texto.length;
  }

  // Número a partir del texto del campo. null si está vacío o no es válido.
  function valor(input) {
    var texto = typeof input === 'string' ? input : input.value;
    var limpio = limpiar(texto);
    if (limpio === '' || limpio === ',') return null;

    var n = parseFloat(limpio.replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // Deja el campo con dos decimales: 1.250.000 -> 1.250.000,00
  function cuadrar(input) {
    var n = valor(input);
    if (n === null) {
      input.value = '';
      return;
    }
    var partes = n.toFixed(DECIMALES).split('.');
    input.value = agruparMiles(partes[0]) + ',' + partes[1];
  }

  /* Conecta un campo: formatea al escribir y cuadra los decimales al salir.
     `alCambiar` se llama después de cada cambio para recalcular la página. */
  function activar(input, alCambiar) {
    if (!input) return;

    input.addEventListener('input', function () {
      var antes = input.value;
      var cursor = input.selectionStart;
      var significativos = significativosAntesDe(antes, cursor);

      var despues = formatear(antes);
      if (despues !== antes) {
        input.value = despues;
        // Los campos de texto sí admiten mover el cursor; si el navegador no lo
        // permitiera, el formato sigue funcionando.
        try {
          var nueva = posicionTras(despues, significativos);
          input.setSelectionRange(nueva, nueva);
        } catch (e) { /* sin cursor que restaurar */ }
      }

      if (typeof alCambiar === 'function') alCambiar();
    });

    input.addEventListener('blur', function () {
      cuadrar(input);
      if (typeof alCambiar === 'function') alCambiar();
    });
  }

  return {
    activar: activar,
    valor: valor,
    formatear: formatear,
    cuadrar: cuadrar
  };
})();
