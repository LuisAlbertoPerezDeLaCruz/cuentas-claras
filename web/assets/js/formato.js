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

  /* "AAAA-MM-DD" a partir de cualquier marca ISO ("2026-10-09T00:00:00-04:00" o
     "2026-10-13"), o null si no la trae. Sin pasar por Date: la zona horaria
     correría la fecha un día.

     Dos cadenas así se comparan con < y > directamente: son de ancho fijo y con
     ceros a la izquierda, así que el orden alfabético ES el cronológico. Eso es
     lo que permite decidir cuál de dos tasas del BCV es la vigente y cuál la del
     siguiente día hábil sin tocar Date. */
  function diaIso(entrada) {
    if (!entrada) return null;
    var m = String(entrada).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }

  // "13/10/2026". El regex vive solo en diaIso; este formateo y el de abajo salen de ahí.
  function diaCorto(entrada) {
    var iso = diaIso(entrada);
    if (!iso) return '';
    return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  }

  // Las tasas del BCV tienen "fecha valor": el día para el que rigen. Se muestra solo la
  // fecha (sin hora) y sin pasar por Date, para que la zona horaria no la corra un día.
  function fechaValor(entrada) {
    var corta = diaCorto(entrada);
    return corta ? 'Fecha valor: ' + corta : '';
  }

  function dos(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /* "Hoy" en Venezuela, como AAAA-MM-DD. El huso del dispositivo del visitante NO
     puede correrlo un día: la zona la fija timeZone, no el navegador.

     Se lee con formatToParts y no formateando a texto: así el patrón de la
     configuración regional es irrelevante, porque lo que se usa son los campos con
     nombre. "en-CA" queda solo como pista y su salida nunca se parsea. */
  function hoyEnVenezuela(ahora) {
    var momento = ahora || new Date();

    try {
      var partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(momento);

      var p = {};
      partes.forEach(function (x) { p[x.type] = x.value; });
      if (p.year && p.month && p.day) return p.year + '-' + p.month + '-' + p.day;
    } catch (error) {
      // Motor sin ICU o sin esa zona horaria: se cae al cálculo de abajo.
    }

    /* Venezuela está fija en -04:00 desde 2016 y no tiene horario de verano, así que
       restar cuatro horas al UTC es exacto y tampoco depende del huso local. */
    var d = new Date(momento.getTime() - 4 * 60 * 60 * 1000);
    return d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate());
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
    diaIso: diaIso,
    diaCorto: diaCorto,
    fechaValor: fechaValor,
    hoyEnVenezuela: hoyEnVenezuela,
    momento: momento,
    aFechaLocal: aFechaLocal,
    fechaLarga: fechaLarga
  };
})();
