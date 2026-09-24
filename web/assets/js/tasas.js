/*
 * Consulta de tasas (BCV dólar, BCV euro y Binance P2P), compartida por las
 * herramientas que necesitan convertir a bolívares.
 *
 * Importante: el sitio es 100% estático, así que las consultas salen desde el
 * navegador del visitante. bcv.org.ve NO se puede consultar directamente por JS
 * (no envía cabeceras CORS), por eso se usan APIs intermediarias que sí publican
 * Access-Control-Allow-Origin: *.
 */

'use strict';

window.Tasas = (function () {
  var FUENTES = {
    bcv: 'https://ve.dolarapi.com/v1/dolares/oficial',
    euro: 'https://ve.dolarapi.com/v1/euros/oficial',
    binance: 'https://criptoya.com/api/binancep2p/usdt/ves/1'
  };

  // Respaldo con las tres tasas en una sola llamada, por si alguna fuente falla.
  var RESPALDO = 'https://raw.githubusercontent.com/JCZR2000/ComercioPrecioAPI/main/tasas_cambio.json';

  var TIEMPO_LIMITE_MS = 8000;
  var CLAVES = ['bcv', 'euro', 'binance'];

  // Tasas vigentes en memoria. null = no disponible.
  var valores = { bcv: null, euro: null, binance: null };
  var fechas = { bcv: null, euro: null, binance: null };

  function $(id) {
    return document.getElementById(id);
  }

  // fetch con timeout: si una API se cuelga, la UI no se queda esperando.
  function traerJson(url) {
    var controlador = new AbortController();
    var reloj = setTimeout(function () {
      controlador.abort();
    }, TIEMPO_LIMITE_MS);

    return fetch(url, { signal: controlador.signal, cache: 'no-store' })
      .then(function (respuesta) {
        if (!respuesta.ok) {
          throw new Error('HTTP ' + respuesta.status + ' en ' + url);
        }
        return respuesta.json();
      })
      .finally(function () {
        clearTimeout(reloj);
      });
  }

  /* --------------------------- pintado opcional --------------------------- */
  /* Solo actúa si la página tiene las tarjetas; las herramientas que únicamente
     necesitan el número (IVA, dividir la cuenta) no las incluyen. */

  function pintarTarjeta(clave) {
    var tarjeta = $('tarjeta-' + clave);
    if (!tarjeta) return;

    var destino = $('tasa-' + clave);
    var destinoFecha = $('fecha-' + clave);

    if (valores[clave] === null) {
      tarjeta.dataset.estado = 'error';
      destino.textContent = 'No disponible';
      destinoFecha.textContent = '';
      return;
    }

    tarjeta.dataset.estado = 'listo';
    destino.textContent = window.Formato.tasa(valores[clave]);
    destinoFecha.textContent = clave === 'binance'
      ? window.Formato.momento(fechas[clave])
      : window.Formato.fechaValor(fechas[clave]);
  }

  function marcarCargando() {
    CLAVES.forEach(function (clave) {
      var tarjeta = $('tarjeta-' + clave);
      if (!tarjeta) return;
      tarjeta.dataset.estado = 'cargando';
      $('tasa-' + clave).textContent = 'Cargando…';
      $('fecha-' + clave).textContent = '';
    });
  }

  /* ----------------------------- carga de datos --------------------------- */

  // Rellena con el respaldo solo las tasas que quedaron sin valor.
  function completarConRespaldo() {
    var faltantes = CLAVES.filter(function (clave) {
      return valores[clave] === null;
    });

    if (faltantes.length === 0) return Promise.resolve();

    return traerJson(RESPALDO)
      .then(function (datos) {
        var mapa = { bcv: datos.dolar, euro: datos.euro, binance: datos.usdt };
        faltantes.forEach(function (clave) {
          var valor = window.Formato.aNumeroPositivo(mapa[clave]);
          if (valor !== null) {
            valores[clave] = valor;
            fechas[clave] = datos.human_date || datos.fecha_bcv || null;
          }
        });
      })
      .catch(function (error) {
        console.warn('El respaldo tampoco respondió:', error.message);
      });
  }

  function cargar() {
    var boton = $('btn-actualizar');
    if (boton) boton.disabled = true;
    marcarCargando();

    var aviso = $('aviso-tasas');
    if (aviso) aviso.hidden = true;

    return Promise.allSettled([
      traerJson(FUENTES.bcv),
      traerJson(FUENTES.euro),
      traerJson(FUENTES.binance)
    ])
      .then(function (resultados) {
        var dolar = resultados[0];
        var euro = resultados[1];
        var binance = resultados[2];

        valores.bcv = dolar.status === 'fulfilled' ? window.Formato.aNumeroPositivo(dolar.value.promedio) : null;
        if (dolar.status === 'fulfilled') fechas.bcv = dolar.value.fechaActualizacion;

        valores.euro = euro.status === 'fulfilled' ? window.Formato.aNumeroPositivo(euro.value.promedio) : null;
        if (euro.status === 'fulfilled') fechas.euro = euro.value.fechaActualizacion;

        // totalAsk = lo que cuesta comprar 1 USDT en bolívares.
        valores.binance = binance.status === 'fulfilled' ? window.Formato.aNumeroPositivo(binance.value.totalAsk) : null;
        if (binance.status === 'fulfilled') fechas.binance = binance.value.time;

        resultados.forEach(function (r) {
          if (r.status === 'rejected') console.warn('Fuente sin respuesta:', r.reason.message);
        });

        return completarConRespaldo();
      })
      .then(function () {
        CLAVES.forEach(pintarTarjeta);

        var sinDatos = CLAVES.filter(function (clave) {
          return valores[clave] === null;
        });

        if (sinDatos.length > 0 && aviso) {
          aviso.textContent = 'Algunas tasas no se pudieron consultar en este momento. ' +
            'Vuelve a intentarlo en unos segundos.';
          aviso.hidden = false;
        }

        return valores;
      })
      .finally(function () {
        if (boton) boton.disabled = false;
      });
  }

  /* ------------------------------- arranque ------------------------------- */

  /* Carga las tasas y avisa a la página cada vez que cambian. El botón
     "Actualizar tasas" se conecta solo si existe en el HTML. */
  function iniciar(alCargar) {
    function ciclo() {
      return cargar().then(function (v) {
        if (typeof alCargar === 'function') alCargar(v);
        return v;
      });
    }

    var boton = $('btn-actualizar');
    if (boton) boton.addEventListener('click', ciclo);

    return ciclo();
  }

  return {
    valores: valores,
    fechas: fechas,
    traerJson: traerJson,
    cargar: cargar,
    iniciar: iniciar
  };
})();
