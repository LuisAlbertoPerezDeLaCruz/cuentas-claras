/*
 * Formato de números y fechas, compartido por todas las herramientas.
 * Se expone como window.Formato para no depender de módulos ES (así el sitio
 * funciona igual servido desde S3 sin preocuparse por el tipo MIME).
 */

'use strict';

window.Formato = (function () {
  var fmtBs = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Las tasas se muestran con más decimales porque el BCV publica hasta ocho.
  var fmtTasa = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  });

  var fmtPorcentaje = new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  });

  function aNumeroPositivo(valor) {
    var n = typeof valor === 'string' ? parseFloat(valor) : valor;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
  }

  // Acepta el cero, a diferencia de aNumeroPositivo (sirve para propinas o tasas al 0%).
  function aNumeroNoNegativo(valor) {
    var n = typeof valor === 'string' ? parseFloat(valor) : valor;
    return typeof n === 'number' && isFinite(n) && n >= 0 ? n : null;
  }

  function aEnteroPositivo(valor) {
    var n = typeof valor === 'string' ? parseInt(valor, 10) : valor;
    return typeof n === 'number' && isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  // Las tasas del BCV tienen "fecha valor": el día para el que rigen. Se muestra solo la
  // fecha (sin hora) y sin pasar por Date, para que la zona horaria no la corra un día.
  function fechaValor(entrada) {
    if (!entrada) return '';
    var m = String(entrada).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return 'Fecha valor: ' + m[3] + '/' + m[2] + '/' + m[1];
  }

  // Binance sí es una cotización de mercado con hora: se muestra el instante de la consulta.
  function momento(entrada) {
    if (!entrada) return '';
    var fecha = typeof entrada === 'number'
      ? new Date(entrada * 1000)
      : new Date(String(entrada).replace(' ', 'T'));
    if (isNaN(fecha.getTime())) return '';
    return 'Actualizado: ' + fecha.toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Convierte "2026-09-24" en una fecha local, sin que el huso horario la corra un día.
  function aFechaLocal(iso) {
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function fechaLarga(fecha) {
    return fecha.toLocaleDateString('es-VE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  return {
    bs: function (n) { return fmtBs.format(n) + ' Bs'; },
    usd: function (n) { return '$' + fmtBs.format(n); },
    numero: function (n) { return fmtBs.format(n); },
    tasa: function (n) { return fmtTasa.format(n) + ' Bs'; },
    porcentaje: function (n) { return fmtPorcentaje.format(n) + ' %'; },
    aNumeroPositivo: aNumeroPositivo,
    aNumeroNoNegativo: aNumeroNoNegativo,
    aEnteroPositivo: aEnteroPositivo,
    fechaValor: fechaValor,
    momento: momento,
    aFechaLocal: aFechaLocal,
    fechaLarga: fechaLarga
  };
})();
