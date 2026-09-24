/*
 * Feriados nacionales de Venezuela y cálculo de días hábiles.
 *
 * Se calculan localmente en vez de consultar una API porque las APIs genéricas de
 * feriados fallan justo en lo que importa: la de Nager.Date, por ejemplo, no trae
 * Jueves ni Viernes Santo y en cambio lista efemérides que no son días no
 * laborables (Día de las Madres, Día del Periodista). Eso daría días hábiles mal
 * contados en ambos sentidos.
 *
 * Fuente: Ley de Fiestas Nacionales + artículo 184 de la LOTTT.
 */

'use strict';

(function () {
  var F = window.Formato;

  var FIJOS = [
    { mes: 1, dia: 1, nombre: 'Año Nuevo' },
    { mes: 4, dia: 19, nombre: 'Declaración de la Independencia' },
    { mes: 5, dia: 1, nombre: 'Día del Trabajador' },
    { mes: 6, dia: 24, nombre: 'Batalla de Carabobo' },
    { mes: 7, dia: 5, nombre: 'Día de la Independencia' },
    { mes: 7, dia: 24, nombre: 'Natalicio de Simón Bolívar' },
    { mes: 10, dia: 12, nombre: 'Día de la Resistencia Indígena' },
    { mes: 12, dia: 24, nombre: 'Nochebuena' },
    { mes: 12, dia: 25, nombre: 'Navidad' },
    { mes: 12, dia: 31, nombre: 'Fin de año' }
  ];

  var extra = [];
  var anioMostrado = new Date().getFullYear();

  function $(id) {
    return document.getElementById(id);
  }

  /* --------------------------- fechas movibles ---------------------------- */

  // Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). De ahí salen Carnaval
  // y Semana Santa, que cambian cada año.
  function domingoDePascua(anio) {
    var a = anio % 19;
    var b = Math.floor(anio / 100);
    var c = anio % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var mes = Math.floor((h + l - 7 * m + 114) / 31);
    var dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
  }

  function sumarDias(fecha, dias) {
    var f = new Date(fecha.getTime());
    f.setDate(f.getDate() + dias);
    return f;
  }

  function aClave(fecha) {
    var mes = String(fecha.getMonth() + 1).padStart(2, '0');
    var dia = String(fecha.getDate()).padStart(2, '0');
    return fecha.getFullYear() + '-' + mes + '-' + dia;
  }

  /* ------------------------------ la lista -------------------------------- */

  function feriadosDe(anio) {
    var pascua = domingoDePascua(anio);

    var lista = FIJOS.map(function (f) {
      return { fecha: new Date(anio, f.mes - 1, f.dia), nombre: f.nombre };
    });

    lista.push({ fecha: sumarDias(pascua, -48), nombre: 'Lunes de Carnaval' });
    lista.push({ fecha: sumarDias(pascua, -47), nombre: 'Martes de Carnaval' });
    lista.push({ fecha: sumarDias(pascua, -3), nombre: 'Jueves Santo' });
    lista.push({ fecha: sumarDias(pascua, -2), nombre: 'Viernes Santo' });

    extra.forEach(function (e) {
      var fecha = F.aFechaLocal(e.fecha);
      if (fecha && fecha.getFullYear() === anio) {
        lista.push({ fecha: fecha, nombre: e.nombre });
      }
    });

    return lista.sort(function (a, b) { return a.fecha - b.fecha; });
  }

  // Conjunto de claves AAAA-MM-DD para consultar rápido si un día es feriado.
  function clavesDe(anioDesde, anioHasta) {
    var claves = {};
    for (var a = anioDesde; a <= anioHasta; a++) {
      feriadosDe(a).forEach(function (f) { claves[aClave(f.fecha)] = f.nombre; });
    }
    return claves;
  }

  /* ---------------------------- próximo feriado --------------------------- */

  function pintarProximo() {
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    var candidatos = feriadosDe(hoy.getFullYear()).concat(feriadosDe(hoy.getFullYear() + 1));
    var proximo = candidatos.find(function (f) { return f.fecha >= hoy; });
    if (!proximo) return;

    var dias = Math.round((proximo.fecha - hoy) / 86400000);

    $('proximo-nombre').textContent = proximo.nombre;
    $('proximo-fecha').textContent = F.fechaLarga(proximo.fecha);
    $('proximo-faltan').textContent = dias === 0 ? 'Es hoy' : dias === 1 ? '1 día' : dias + ' días';

    if (dias > 0) {
      var habiles = contar(hoy, sumarDias(proximo.fecha, -1)).habiles;
      $('proximo-habiles').textContent = habiles === 1
        ? 'Queda 1 día hábil por delante'
        : 'Quedan ' + habiles + ' días hábiles por delante';
    } else {
      $('proximo-habiles').textContent = '';
    }
  }

  /* ----------------------------- días hábiles ----------------------------- */

  function contar(desde, hasta) {
    var claves = clavesDe(desde.getFullYear(), hasta.getFullYear());
    var totales = 0, finde = 0, feriados = 0, habiles = 0;
    var cursor = new Date(desde.getTime());

    while (cursor <= hasta) {
      totales++;
      var dia = cursor.getDay();
      if (dia === 0 || dia === 6) {
        finde++;
      } else if (claves[aClave(cursor)]) {
        feriados++;
      } else {
        habiles++;
      }
      cursor = sumarDias(cursor, 1);
    }

    return { totales: totales, finde: finde, feriados: feriados, habiles: habiles };
  }

  function calcularRango() {
    var cajaError = $('error-fechas');
    var desde = F.aFechaLocal($('desde').value);
    var hasta = F.aFechaLocal($('hasta').value);

    function limpiar() {
      ['totales', 'finde', 'feriados', 'habiles'].forEach(function (k) {
        $('v-' + k).textContent = '—';
      });
    }

    if (!desde || !hasta) {
      cajaError.hidden = true;
      limpiar();
      return;
    }

    if (hasta < desde) {
      cajaError.textContent = 'La fecha "hasta" no puede ser anterior a la fecha "desde".';
      cajaError.hidden = false;
      limpiar();
      return;
    }

    // Un rango enorme congelaría el navegador recorriendo día por día.
    if ((hasta - desde) / 86400000 > 3650) {
      cajaError.textContent = 'El rango no puede superar los 10 años.';
      cajaError.hidden = false;
      limpiar();
      return;
    }

    cajaError.hidden = true;
    var r = contar(desde, hasta);
    $('v-totales').textContent = r.totales;
    $('v-finde').textContent = r.finde;
    $('v-feriados').textContent = r.feriados;
    $('v-habiles').textContent = r.habiles;
  }

  /* ------------------------------ lista anual ----------------------------- */

  function pintarLista() {
    var hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    $('anio-lista').textContent = anioMostrado;

    var html = feriadosDe(anioMostrado).map(function (f) {
      var pasado = f.fecha < hoy ? ' data-pasado="si"' : '';
      var dia = f.fecha.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short' });
      return '<li' + pasado + '><span>' + f.nombre + '</span>' +
        '<span class="fecha-item">' + dia + '</span></li>';
    }).join('');

    $('lista-feriados').innerHTML = html;
  }

  /* ------------------------------- arranque ------------------------------- */

  document.addEventListener('DOMContentLoaded', function () {
    var hoy = new Date();
    $('desde').value = aClave(hoy);
    $('hasta').value = aClave(new Date(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate()));

    $('formulario').addEventListener('submit', function (e) { e.preventDefault(); });
    $('desde').addEventListener('change', calcularRango);
    $('hasta').addEventListener('change', calcularRango);

    $('anio-anterior').addEventListener('click', function () { anioMostrado--; pintarLista(); });
    $('anio-siguiente').addEventListener('click', function () { anioMostrado++; pintarLista(); });

    // Los feriados extra son opcionales: si el archivo falla, la página sigue.
    fetch('/assets/data/feriados-extra.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (datos) {
        if (datos && Array.isArray(datos.feriados)) {
          extra = datos.feriados.filter(function (f) { return f.activo !== false; });
        }
      })
      .catch(function (error) {
        console.warn('No se pudieron cargar los feriados extra:', error.message);
      })
      .finally(function () {
        pintarProximo();
        pintarLista();
        calcularRango();
      });
  });
})();
