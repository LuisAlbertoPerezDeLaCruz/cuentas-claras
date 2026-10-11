/*
 * Consulta de tasas (BCV dólar, BCV euro y Binance P2P), compartida por las
 * herramientas que necesitan convertir a bolívares.
 *
 * Importante: el sitio es 100% estático, así que las consultas salen desde el
 * navegador del visitante. bcv.org.ve NO se puede consultar directamente por JS
 * (no envía cabeceras CORS), por eso se usan APIs intermediarias que sí publican
 * Access-Control-Allow-Origin: *.
 *
 * El BCV publica cada día hábil, por la tarde, la tasa con FECHA VALOR del
 * siguiente día hábil. Durante esas horas hay dos tasas publicadas a la vez y las
 * dos son legales: los comercios grandes cobran con la vigente y los pequeños con
 * la del día siguiente. Este módulo mantiene las dos y deja que el usuario elija.
 */

'use strict';

window.Tasas = (function () {
  var FUENTES = {
    bcv: 'https://ve.dolarapi.com/v1/dolares/oficial',
    euro: 'https://ve.dolarapi.com/v1/euros/oficial',
    binance: 'https://criptoya.com/api/binancep2p/usdt/ves/1'
  };

  /* Las tres tasas en una sola llamada. Cumple dos papeles: tapa los huecos de las
     fuentes de arriba (su papel original) y además es hoy la única fuente que trae
     la tasa RECIÉN PUBLICADA, en su campo fecha_bcv. */
  var RESPALDO = 'https://raw.githubusercontent.com/JCZR2000/ComercioPrecioAPI/main/tasas_cambio.json';

  var TIEMPO_LIMITE_MS = 8000;
  var CLAVES = ['bcv', 'euro', 'binance'];

  /* Un archivo de respaldo que dejó de actualizarse sigue siendo JSON válido, así
     que la frescura se comprueba a mano. Se usa su campo timestamp (epoch en
     segundos), no human_date, que es una cadena sin zona horaria. */
  var HORAS_PARA_NO_OFRECERLA = 24;
  var HORAS_PARA_AVISAR = 6;

  /* La preferencia de fecha valor. Es GLOBAL al sitio: un solo valor.

     Vive aquí y no en un archivo nuevo porque el único módulo que la consume es
     este, que ya va cargado en las cuatro páginas que la necesitan. Un archivo
     nuevo habría que meterlo en el ARMAZON de sw.js, resellar VERSION y acordarse
     de añadir el <script> en cada página, y eso último no lo comprueba ningún
     arnés: la página olvidada pasaría las pruebas y fallaría en el navegador.

     Por defecto 'vigente': es el comportamiento que ya tienen los usuarios reales
     del sitio y sus números no deben moverse sin que lo pidan. */
  var CLAVE_PREF = 'tasaBcvPreferida';
  var ELEGIBLES = ['vigente', 'proxima'];

  /* La eleccion de esta visita. En incognito localStorage lanza, así que sin esta
     copia en memoria el usuario no podría elegir nada: cada lectura volvería a
     'vigente' y pulsar el botón no haría nada visible. Aquí la elección vale para
     la visita y lo único que se pierde es recordarla la próxima vez. */
  var preferenciaEnMemoria = null;

  /* Los dos juegos de tasas BCV que pueden estar publicados a la vez, cada uno con
     su fecha valor. Se mutan EN SITIO y se exponen por referencia.

     Cuál es la vigente y cuál la próxima se decide COMPARANDO LAS FECHAS, nunca
     por la fuente de la que vino cada una: antes de la publicación de la tarde las
     dos fuentes traen la misma fecha, y por la mañana el respaldo puede ir por
     delante de dolarapi con una tasa que YA rige. */
  var juegos = {
    vigente: { bcv: null, euro: null, fecha: null, origen: null, horas: null },
    proxima: { bcv: null, euro: null, fecha: null, origen: null, horas: null }
  };

  /* Qué juego se usa de verdad, y la brecha entre los dos. 'cual' es el EFECTIVO,
     que no siempre es el deseado: si el usuario guardó 'proxima' y hoy no hay
     próxima, el deseo se conserva en localStorage y el efectivo cae a 'vigente'. */
  var seleccion = { cual: 'vigente', hayProxima: false, diferencia: null };

  /* Proyección del juego elegido. Es lo que leen las páginas.

     ⚠️ valores.bcv significa "la tasa BCV ELEGIDA", no "la vigente". Quien necesite
     específicamente la de hoy tiene que leer juegos.vigente.bcv.

     Se mutan en sitio y se exponen por referencia: los consumidores leen
     window.Tasas.valores una vez y siempre ven el último estado. Reasignar estos
     objetos (valores = juegos[cual]) los dejaría mirando un objeto muerto, con
     números que no vuelven a cambiar nunca, y sin ningún error visible. */
  var valores = { bcv: null, euro: null, binance: null };
  var fechas = { bcv: null, euro: null, binance: null };

  // Páginas suscritas a los cambios. Cambiar la preferencia las avisa sin ir a la red.
  var oyentes = [];

  // Se enciende cuando el respaldo, ya rancio, es lo único que hay para la vigente.
  var vigenteRancia = false;

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

  /* ----------------------------- la preferencia -------------------------- */

  function leerPreferencia() {
    if (preferenciaEnMemoria !== null) return preferenciaEnMemoria;

    try {
      var v = localStorage.getItem(CLAVE_PREF);
      // Nunca se confía en lo guardado: puede traer basura o el valor de un refactor
      // futuro que ya no exista.
      return ELEGIBLES.indexOf(v) === -1 ? 'vigente' : v;
    } catch (error) {
      /* En incógnito localStorage LANZA al leer, no devuelve null. Sin este
         try/catch la página se cae antes de pintar la primera tasa. */
      return 'vigente';
    }
  }

  function guardarPreferencia(cual) {
    if (ELEGIBLES.indexOf(cual) === -1) return;

    // Primero en memoria, que es lo que hace que la elección funcione siempre.
    preferenciaEnMemoria = cual;

    try {
      localStorage.setItem(CLAVE_PREF, cual);
    } catch (error) {
      // Incógnito: la elección vale para esta visita y no se recuerda. Mejor eso
      // que no dejar elegir.
    }
  }

  /* -------------------- clasificar los juegos por su fecha ---------------- */

  /* Ordenan solo por fecha valor. Con la misma fecha manda el orden de inserción
     (dolarapi antes que el respaldo) porque Array.prototype.sort es estable, y eso
     es lo que conserva la regla vieja de que el respaldo solo tapa huecos. */
  function porFechaDesc(a, b) {
    return a.fecha < b.fecha ? 1 : (a.fecha > b.fecha ? -1 : 0);
  }

  function porFechaAsc(a, b) {
    return a.fecha > b.fecha ? 1 : (a.fecha < b.fecha ? -1 : 0);
  }

  /* De los juegos publicados que se pudieron leer, cuál rige hoy y cuál es el del
     próximo día hábil. Recibe una LISTA para que el día que exista la Lambda que lea
     bcv.org.ve entre como un candidato más, sin tocar esta función.

     Devuelve candidatos, pero de ellos solo se usa la FECHA: el juego se arma
     después campo por campo con todos los que comparten esa fecha. */
  function clasificar(candidatos, hoy) {
    var utiles = candidatos.filter(function (c) { return c.fecha !== null; });

    var enVigor = utiles.filter(function (c) { return c.fecha <= hoy; }).sort(porFechaDesc);
    var futuros = utiles.filter(function (c) { return c.fecha > hoy; }).sort(porFechaAsc);

    /* La fecha más reciente que ya rige y de la que alguien trae el dólar. Si de
       ninguna se pudo leer el dólar, vale la más reciente igual (traerá el euro).
       Y si no se pudo leer ninguna en vigor, se usa la futura más cercana a falta de
       otra cosa: es un dato real del BCV y la tarjeta imprime su fecha valor. */
    var vigente = enVigor.filter(function (c) { return c.bcv !== null; })[0] ||
      enVigor[0] || futuros[0] || null;

    /* Próxima solo si de verdad va por delante de la vigente, trae el dólar y no sale
       de un archivo rancio. Cuando la vigente ES futuros[0] esta comparación da falso
       sola y no hay elección que ofrecer. */
    var proxima = null;
    for (var i = 0; i < futuros.length; i++) {
      if (vigente && futuros[i].fecha > vigente.fecha &&
          futuros[i].bcv !== null && !futuros[i].rancio) {
        proxima = futuros[i];
        break;
      }
    }

    return { vigente: vigente, proxima: proxima, utiles: utiles };
  }

  /* Arma un juego tomando, de todos los candidatos con ESA fecha valor, el primero
     que trae cada campo. Como dolarapi va primero en la lista, el respaldo solo
     aporta lo que falte: es el papel original del respaldo, conservado.

     La igualdad de fecha no es un detalle: mezclar el euro de un día con el dólar
     de otro da un promedio BCV-euro equivocado que parece correcto.

     'origen' es quién aportó el DÓLAR, que es de quien depende el aviso de frescura. */
  function armarJuego(destino, fecha, candidatos) {
    destino.bcv = null;
    destino.euro = null;
    destino.fecha = fecha;
    destino.origen = null;
    destino.horas = null;
    if (fecha === null) return;

    candidatos.forEach(function (c) {
      if (c.fecha !== fecha) return;
      if (destino.bcv === null && c.bcv !== null) {
        destino.bcv = c.bcv;
        destino.origen = c.origen;
        destino.horas = typeof c.horas === 'number' ? c.horas : null;
      }
      if (destino.euro === null && c.euro !== null) destino.euro = c.euro;
    });
  }

  /* --------------------------- pintado opcional --------------------------- */
  /* Solo actúa si la página tiene los elementos; las herramientas que únicamente
     necesitan el número (IVA, dividir la cuenta) no los incluyen. */

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

  /* «Desde el martes 13». La fecha valor ya viene dada en los datos, así que no hay
     que calcular ningún día hábil: solo falta el nombre del día.

     aFechaLocal construye el Date desde las PARTES de la cadena, no parseando ISO,
     así que el huso del dispositivo no puede correrlo un día. Y justo por eso aquí
     NO va timeZone: el Date es medianoche local, y releerlo en otra zona sí podría
     desplazar el día de la semana. La ida y la vuelta usan la misma zona. */
  function etiquetaProxima(iso) {
    var d = window.Formato.aFechaLocal(iso);
    if (!d) return 'Próxima';
    return 'Desde el ' + d.toLocaleDateString('es-VE', { weekday: 'long' }) + ' ' + d.getDate();
  }

  function calcularDiferencia() {
    if (!seleccion.hayProxima || juegos.vigente.bcv === null) return null;

    var a = juegos.vigente.bcv;
    var b = juegos.proxima.bcv;

    return {
      absoluta: b - a,
      porcentaje: (b - a) / a * 100,
      cuando: etiquetaProxima(juegos.proxima.fecha).replace('Desde el ', 'el '),
      /* Si las dos se renderizan igual el usuario NO puede ver ninguna diferencia,
         así que afirmar que la hay sería falso. Se compara lo pintado, no el float:
         un delta de 1e-6 es invisible con cuatro decimales. */
      mismoNumero: window.Formato.tasa(a) === window.Formato.tasa(b)
    };
  }

  function textoDiferencia() {
    var d = seleccion.diferencia;
    if (!d) return '';
    if (d.mismoNumero) {
      return 'El BCV publicó la misma tasa para ' + d.cuando + ': no hay diferencia.';
    }
    return window.Formato.tasa(Math.abs(d.absoluta)) +
      (d.absoluta > 0 ? ' más' : ' menos') + ' por dólar (' +
      (d.absoluta > 0 ? '+' : '-') + window.Formato.porcentaje(Math.abs(d.porcentaje)) +
      ') que la vigente.';
  }

  /* El selector se oculta entero cuando no hay dos tasas distintas que elegir: un
     selector de una sola opción es una elección falsa. Esta función es la ÚNICA que
     escribe los dos aria-pressed y el hidden, siempre desde seleccion y nunca de
     forma incremental, para que no puedan quedar en un estado contradictorio. */
  function pintarSelector() {
    var caja = $('selector-fecha');
    var nota = $('nota-selector');

    if (caja) caja.hidden = !seleccion.hayProxima;

    if (seleccion.hayProxima) {
      if (caja) {
        $('fv-proxima').textContent = etiquetaProxima(juegos.proxima.fecha);
        $('fv-vigente').setAttribute('aria-pressed', String(seleccion.cual === 'vigente'));
        $('fv-proxima').setAttribute('aria-pressed', String(seleccion.cual === 'proxima'));
        $('dif-tasas').textContent = textoDiferencia();
      }
      if (nota) {
        nota.textContent = '';
        nota.hidden = true;
      }
      return;
    }

    /* Sin próxima, lo único que merece una frase es el caso de quien la había
       elegido: para los demás, que no esté publicada todavía no es un fallo. */
    if (nota) {
      var laQueria = leerPreferencia() === 'proxima';
      nota.textContent = laQueria
        ? 'Todavía no hay tasa del próximo día hábil publicada. Se está usando la vigente.'
        : '';
      nota.hidden = !laQueria;
    }
  }

  function pintarAviso() {
    var aviso = $('aviso-tasas');
    if (!aviso) return;

    var sinDatos = CLAVES.filter(function (clave) {
      return valores[clave] === null;
    });

    if (sinDatos.length > 0) {
      aviso.textContent = 'Algunas tasas no se pudieron consultar en este momento. ' +
        'Vuelve a intentarlo en unos segundos.';
      aviso.hidden = false;
      return;
    }

    if (vigenteRancia) {
      aviso.textContent = 'No se pudo consultar la tasa vigente. Se muestra la última ' +
        'publicada por el BCV (fecha valor ' + window.Formato.diaCorto(juegos.vigente.fecha) +
        '); confírmala en bcv.org.ve antes de cobrar.';
      aviso.hidden = false;
      return;
    }

    aviso.hidden = true;
  }

  /* El texto de la nota de /iva-igtf/ y /dividir-cuenta/. Vive aquí, y no duplicado
     en las dos herramientas, porque solo este módulo sabe qué juego está en uso y
     con qué fecha valor. Esas dos páginas RESPETAN la preferencia pero no repiten el
     selector: la reflejan en esta frase. */
  function textoNota() {
    if (valores.bcv === null) {
      return 'No se pudo consultar la tasa del BCV: los importes se muestran solo en la moneda elegida.';
    }

    var cuando = window.Formato.diaCorto(fechas.bcv);

    if (seleccion.cual === 'proxima') {
      return 'Equivalencias calculadas con la tasa BCV del próximo día hábil (fecha valor ' +
        cuando + '): ' + window.Formato.tasa(valores.bcv) + ' por dólar. ' +
        'Para cambiarla, usa el selector de la portada o del conversor.';
    }

    return 'Equivalencias calculadas con la tasa BCV vigente (fecha valor ' + cuando + '): ' +
      window.Formato.tasa(valores.bcv) + ' por dólar.';
  }

  /* ----------------------------- carga de datos --------------------------- */

  function antiguedadHoras(datos) {
    var t = window.Formato.aNumeroPositivo(datos.timestamp);
    if (t === null) return null;  // sin marca de tiempo no se puede juzgar
    return (Date.now() / 1000 - t) / 3600;
  }

  /* Convierte la respuesta de dolarapi en un candidato. El euro solo se adjunta si
     su propia fecha valor coincide con la del dólar: un juego mezcla nunca. */
  function candidatoDolarapi(dolar, euro) {
    var fechaDolar = dolar ? window.Formato.diaIso(dolar.fechaActualizacion) : null;
    var fechaEuro = euro ? window.Formato.diaIso(euro.fechaActualizacion) : null;
    var fecha = fechaDolar || fechaEuro;
    if (fecha === null) return null;

    return {
      origen: 'dolarapi',
      fecha: fecha,
      rancio: false,
      bcv: fechaDolar === fecha && dolar ? window.Formato.aNumeroPositivo(dolar.promedio) : null,
      euro: fechaEuro === fecha && euro ? window.Formato.aNumeroPositivo(euro.promedio) : null
    };
  }

  function candidatoRespaldo(datos) {
    var fecha = window.Formato.diaIso(datos.fecha_bcv);
    if (fecha === null) return null;

    var horas = antiguedadHoras(datos);

    return {
      origen: 'respaldo',
      fecha: fecha,
      /* Un archivo sin tocar en un día ya no sigue al BCV: no se ofrece como la tasa
         de mañana aunque su fecha_bcv siga pareciendo futura. Esto depende del reloj
         del dispositivo, así que solo puede OCULTAR una tasa, nunca mostrar una
         equivocada: es la dirección segura en la que fallar. */
      rancio: horas !== null && horas > HORAS_PARA_NO_OFRECERLA,
      horas: horas,
      bcv: window.Formato.aNumeroPositivo(datos.dolar),
      euro: window.Formato.aNumeroPositivo(datos.euro)
    };
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
      traerJson(FUENTES.binance),
      traerJson(RESPALDO)
    ])
      .then(function (resultados) {
        var dolar = resultados[0];
        var euro = resultados[1];
        var binance = resultados[2];
        var respaldo = resultados[3];

        resultados.forEach(function (r) {
          if (r.status === 'rejected') console.warn('Fuente sin respuesta:', r.reason.message);
        });

        /* Binance va aparte de los juegos: es tasa de mercado, no tiene fecha valor
           y la preferencia no lo toca. Su metadato de tiempo sí es "cuándo se leyó",
           así que aquí human_date/timestamp son lo correcto. */
        var datosRespaldo = respaldo.status === 'fulfilled' ? respaldo.value : null;

        valores.binance = binance.status === 'fulfilled'
          ? window.Formato.aNumeroPositivo(binance.value.totalAsk)
          : null;
        if (binance.status === 'fulfilled') fechas.binance = binance.value.time;

        if (valores.binance === null && datosRespaldo) {
          var usdt = window.Formato.aNumeroPositivo(datosRespaldo.usdt);
          if (usdt !== null) {
            valores.binance = usdt;
            fechas.binance = datosRespaldo.human_date || datosRespaldo.timestamp || null;
          }
        }

        // Candidatos de juego BCV. dolarapi primero: con la misma fecha valor gana ella.
        var candidatos = [];
        var cDolarapi = candidatoDolarapi(
          dolar.status === 'fulfilled' ? dolar.value : null,
          euro.status === 'fulfilled' ? euro.value : null
        );
        if (cDolarapi) candidatos.push(cDolarapi);
        if (datosRespaldo) {
          var cRespaldo = candidatoRespaldo(datosRespaldo);
          if (cRespaldo) candidatos.push(cRespaldo);
        }

        var clasificados = clasificar(candidatos, window.Formato.hoyEnVenezuela());

        armarJuego(juegos.vigente, clasificados.vigente ? clasificados.vigente.fecha : null,
          clasificados.utiles);
        armarJuego(juegos.proxima, clasificados.proxima ? clasificados.proxima.fecha : null,
          clasificados.utiles);

        vigenteRancia = juegos.vigente.origen === 'respaldo' &&
          typeof juegos.vigente.horas === 'number' &&
          juegos.vigente.horas > HORAS_PARA_AVISAR;

        aplicar();
        return valores;
      })
      .finally(function () {
        if (boton) boton.disabled = false;
      });
  }

  /* ------------------------- aplicar la preferencia ----------------------- */

  function avisar() {
    oyentes.forEach(function (fn) {
      fn(valores);
    });
  }

  /* El único sitio que escribe en valores/fechas. Siempre por mutación, nunca
     reasignando los objetos. */
  function aplicar() {
    var deseada = leerPreferencia();

    /* Una próxima cuyo dólar no sirve no ofrece ninguna elección, aunque tenga fecha. */
    seleccion.hayProxima = juegos.proxima.bcv !== null;
    seleccion.cual = (deseada === 'proxima' && seleccion.hayProxima) ? 'proxima' : 'vigente';

    var j = juegos[seleccion.cual];
    valores.bcv = j.bcv;
    fechas.bcv = j.fecha;
    valores.euro = j.euro;
    fechas.euro = j.fecha;

    seleccion.diferencia = calcularDiferencia();

    CLAVES.forEach(pintarTarjeta);
    pintarSelector();
    pintarAviso();
    avisar();
  }

  /* Cambia la preferencia sin volver a la red. Se guarda el DESEO, aunque hoy no se
     pueda cumplir: el usuario lo querrá mañana y borrárselo en silencio es lo que
     hace sentir roto un producto. */
  function usar(cual) {
    if (ELEGIBLES.indexOf(cual) === -1) return;
    guardarPreferencia(cual);
    aplicar();
  }

  /* ------------------------------- arranque ------------------------------- */

  /* Carga las tasas y avisa a la página cada vez que cambian: al llegar de la red,
     al pulsar "Actualizar tasas" y al cambiar la fecha valor elegida. El botón y el
     selector se conectan solos si existen en el HTML. */
  function iniciar(alCargar) {
    if (typeof alCargar === 'function') oyentes.push(alCargar);

    var boton = $('btn-actualizar');
    if (boton) boton.addEventListener('click', cargar);

    var caja = $('selector-fecha');
    if (caja) {
      $('fv-vigente').addEventListener('click', function () { usar('vigente'); });
      $('fv-proxima').addEventListener('click', function () { usar('proxima'); });
    }

    return cargar();
  }

  return {
    valores: valores,
    fechas: fechas,
    juegos: juegos,
    seleccion: seleccion,
    traerJson: traerJson,
    cargar: cargar,
    iniciar: iniciar,
    usar: usar,
    textoNota: textoNota,
    clasificar: clasificar,
    preferencia: { CLAVE: CLAVE_PREF, leer: leerPreferencia, guardar: guardarPreferencia }
  };
})();
