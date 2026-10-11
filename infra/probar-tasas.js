/*
 * Ejecuta web/assets/js/tasas.js en Node, con un DOM simulado y un reloj fijo, y
 * dispara sus manejadores.
 *
 *   node infra/probar-tasas.js
 *
 * Es el primer arnes de tasas.js. Lo que se prueba es el reparto de las DOS tasas
 * del BCV que pueden estar publicadas a la vez: el BCV publica por la tarde la del
 * siguiente dia habil, asi que durante unas horas hay una vigente y una proxima, y
 * el usuario elige con cual calcular.
 *
 * El caso que justifica el arnes entero es el 4: dolarapi con fecha 12, respaldo
 * con fecha 13 y hoy = 13. Es el unico que distingue "comparar las dos fechas entre
 * si" de "compararlas con hoy". Sin el, la prueba pasa igual con un codigo que
 * etiqueta como "proxima" una tasa que YA esta rigiendo. Es el analogo del caso
 * otro-dominio.com de probar-sw.js.
 *
 * Se carga el formato.js real, no un doble: asi se ejercitan de verdad el contrato
 * de null de aNumeroPositivo, el regex de diaIso y hoyEnVenezuela.
 *
 * Lo que NO cubre: como se ve el selector, que el .segmentado ocupe el ancho en un
 * telefono y que las APIs de verdad sigan sirviendo estos campos. Eso se mira con
 * servir.sh en el navegador.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const codigoFormato = fs.readFileSync(path.join(WEB, 'assets', 'js', 'formato.js'), 'utf8');
const codigoTasas = fs.readFileSync(path.join(WEB, 'assets', 'js', 'tasas.js'), 'utf8');

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };
const ok = (msg) => console.log('  ok    ' + msg);
const igual = (real, esperado, msg) =>
  real === esperado ? ok(msg) : fallar(msg + ' (esperaba ' + esperado + ', dio ' + real + ')');

/* ========================= datos de las fuentes =========================== */

// El instante en que se congela el reloj en la mayoria de los casos: domingo 11.
const AHORA = '2026-10-11T12:00:00Z';
const haceHoras = (h, desde) => (Date.parse(desde || AHORA) - h * 3600 * 1000) / 1000;

// Medidos con curl el 11-oct-2026.
const DOLAR_09 = { promedio: 875.6505, fechaActualizacion: '2026-10-09T00:00:00-04:00' };
const EURO_09 = { promedio: 980.61472543, fechaActualizacion: '2026-10-09T00:00:00-04:00' };
const BINANCE = { totalAsk: 1015, time: 1791703103 };
const RESPALDO_13 = {
  dolar: 876.7976,
  euro: 982.00454402,
  usdt: 1017.0,
  fecha_bcv: '2026-10-13',
  timestamp: haceHoras(1),
  human_date: '2026-10-11 07:00:22'
};

const con = (base, cambios) => Object.assign({}, base, cambios);

/* ============================ el entorno ================================== */

/* Un Date falso para poder fijar "hoy". new F() devuelve una instancia real de Date
   (un constructor que retorna un objeto gana), asi que Intl.formatToParts la acepta
   y el new Date(anio, mes, dia) de aFechaLocal sigue funcionando. Sin esto habria
   que meter una puerta trasera de pruebas en el codigo de produccion. */
function relojFijo(iso) {
  const Real = Date;
  const F = function (...a) { return a.length ? new Real(...a) : new Real(iso); };
  F.now = () => new Real(iso).getTime();
  F.prototype = Real.prototype;
  F.UTC = Real.UTC;
  F.parse = Real.parse;
  return F;
}

function crearElemento(id) {
  return {
    id: id,
    textContent: '',
    hidden: false,
    disabled: false,
    dataset: {},
    atributos: {},
    clics: [],
    setAttribute: function (n, v) { this.atributos[n] = v; },
    getAttribute: function (n) {
      return Object.prototype.hasOwnProperty.call(this.atributos, n) ? this.atributos[n] : null;
    },
    addEventListener: function (tipo, fn) { if (tipo === 'click') this.clics.push(fn); },
    pulsar: function () { this.clics.forEach((fn) => fn()); }
  };
}

const IDS_TARJETAS = [
  'tarjeta-bcv', 'tasa-bcv', 'fecha-bcv',
  'tarjeta-euro', 'tasa-euro', 'fecha-euro',
  'tarjeta-binance', 'tasa-binance', 'fecha-binance',
  'aviso-tasas', 'btn-actualizar'
];
const IDS_SELECTOR = ['selector-fecha', 'fv-vigente', 'fv-proxima', 'dif-tasas', 'nota-selector'];

/* o.fuentes: por clave (bcv, euro, binance, respaldo), el JSON a devolver o la
   cadena 'falla' para que la peticion se rechace. */
function crearEntorno(o) {
  const op = o || {};
  const fuentes = Object.assign(
    { bcv: DOLAR_09, euro: EURO_09, binance: BINANCE, respaldo: RESPALDO_13 },
    op.fuentes || {}
  );

  const elementos = {};
  const ids = []
    .concat(op.tarjetas === false ? [] : IDS_TARJETAS)
    .concat(op.selector === false ? [] : IDS_SELECTOR)
    .concat(op.notaTasa ? ['nota-tasa'] : []);
  ids.forEach((id) => { elementos[id] = crearElemento(id); });

  const documento = {
    getElementById: (id) => (elementos[id] !== undefined ? elementos[id] : null)
  };

  const guardado = op.guardado instanceof Map ? op.guardado : new Map();
  if (typeof op.guardado === 'string') guardado.set('tasaBcvPreferida', op.guardado);

  const almacen = op.almacenBloqueado
    ? {
        getItem: function () { throw new Error('acceso denegado'); },
        setItem: function () { throw new Error('acceso denegado'); }
      }
    : {
        getItem: function (k) { return guardado.has(k) ? guardado.get(k) : null; },
        setItem: function (k, v) {
          if (op.soloEscrituraBloqueada) throw new Error('acceso denegado');
          guardado.set(k, v);
        }
      };

  const llamadas = [];
  const fetchFalso = (url) => {
    llamadas.push(url);
    const clave = url.indexOf('dolares') !== -1 ? 'bcv'
      : url.indexOf('euros') !== -1 ? 'euro'
      : url.indexOf('criptoya') !== -1 ? 'binance'
      : 'respaldo';
    const r = fuentes[clave];
    if (r === 'falla') return Promise.reject(new Error('fuente caida: ' + clave));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(r) });
  };

  const ventana = {};
  const Reloj = relojFijo(op.ahora || AHORA);

  new Function('window', 'Date', codigoFormato)(ventana, Reloj);
  new Function('window', 'document', 'localStorage', 'fetch', 'Date', codigoTasas)(
    ventana, documento, almacen, fetchFalso, Reloj
  );

  return {
    Tasas: ventana.Tasas,
    Formato: ventana.Formato,
    el: (id) => elementos[id],
    guardado: guardado,
    llamadas: llamadas,
    avisos: []
  };
}

// Silencia los console.warn de las fuentes caidas, que aqui son esperados.
const warnReal = console.warn;
console.warn = () => {};

/* ============================ las pruebas ================================= */

async function principal() {
  /* ---------------------------------------------------------------------- */
  console.log('--- A. clasificar por fecha, nunca por fuente ---');

  {
    // 1. El caso real del 11-oct-2026.
    const e = crearEntorno();
    await e.Tasas.iniciar();
    igual(e.Tasas.juegos.vigente.fecha, '2026-10-09', 'vigente es la del 9');
    igual(e.Tasas.juegos.vigente.origen, 'dolarapi', 'la vigente viene de dolarapi');
    igual(e.Tasas.juegos.proxima.fecha, '2026-10-13', 'proxima es la del 13');
    igual(e.Tasas.juegos.proxima.origen, 'respaldo', 'la proxima viene del respaldo');
    igual(e.Tasas.seleccion.hayProxima, true, 'hay proxima que ofrecer');
    igual(e.Tasas.valores.bcv, 875.6505, 'por omision se usa la vigente');
  }

  {
    // 2. Antes de la publicacion de la tarde: las dos fuentes traen la misma fecha.
    const e = crearEntorno({ fuentes: { respaldo: con(RESPALDO_13, { fecha_bcv: '2026-10-09' }) } });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.hayProxima, false, 'misma fecha valor: no hay proxima');
    igual(e.el('selector-fecha').hidden, true, 'el selector se oculta entero');
    igual(e.Tasas.valores.bcv, 875.6505, 'se sigue usando dolarapi');
  }

  {
    // 3. Un respaldo con fecha anterior no desplaza a la vigente ni se ofrece.
    const e = crearEntorno({ fuentes: { respaldo: con(RESPALDO_13, { fecha_bcv: '2026-10-08' }) } });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.hayProxima, false, 'respaldo atrasado: no hay proxima');
    igual(e.Tasas.valores.bcv, 875.6505, 'el respaldo viejo no pisa el valor fresco');
  }

  {
    /* 4. EL CASO QUE JUSTIFICA EL RELOJ. La fecha del respaldo va por delante de la
       de dolarapi, pero ya es hoy: esa tasa YA rige, no es la de manana. */
    const e = crearEntorno({
      ahora: '2026-10-13T12:00:00Z',
      fuentes: {
        bcv: con(DOLAR_09, { fechaActualizacion: '2026-10-12T00:00:00-04:00' }),
        euro: con(EURO_09, { fechaActualizacion: '2026-10-12T00:00:00-04:00' }),
        respaldo: con(RESPALDO_13, { timestamp: haceHoras(1, '2026-10-13T12:00:00Z') })
      }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.juegos.vigente.fecha, '2026-10-13', 'la del 13 ya rige el dia 13');
    igual(e.Tasas.juegos.vigente.origen, 'respaldo', 'y es la del respaldo');
    igual(e.Tasas.seleccion.hayProxima, false, 'no hay ninguna futura que ofrecer');
    igual(e.Tasas.valores.bcv, 876.7976, 'se calcula con la que rige hoy');
  }

  {
    // 5. clasificar() no puede depender del orden de la lista ni del nombre.
    const e = crearEntorno();
    const futura = { origen: 'respaldo', fecha: '2026-10-13', bcv: 876.7976, euro: 1, rancio: false };
    const actual = { origen: 'dolarapi', fecha: '2026-10-09', bcv: 875.6505, euro: 1, rancio: false };
    const alReves = e.Tasas.clasificar([futura, actual], '2026-10-11');
    igual(alReves.vigente.fecha, '2026-10-09', 'con la futura primero, la vigente sigue siendo la del 9');
    igual(alReves.proxima.fecha, '2026-10-13', 'y la proxima la del 13');
    const tercera = { origen: 'api', fecha: '2026-10-14', bcv: 880, euro: 1, rancio: false };
    const conTres = e.Tasas.clasificar([actual, futura, tercera], '2026-10-11');
    igual(conTres.proxima.fecha, '2026-10-13', 'con tres candidatos gana la futura MAS CERCANA');
  }

  /* ---------------------------------------------------------------------- */
  console.log('--- B. el respaldo tapando huecos ---');

  {
    /* 6. La regresion del bug viejo: el respaldo tapa el hueco del dolar y la fecha
       pintada tiene que ser fecha_bcv, no human_date (el instante del raspado). */
    const e = crearEntorno({
      fuentes: { bcv: 'falla', respaldo: con(RESPALDO_13, { fecha_bcv: '2026-10-09' }) }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, 876.7976, 'el respaldo tapa el hueco del dolar');
    igual(e.Tasas.fechas.bcv, '2026-10-09', 'la fecha es fecha_bcv, NO human_date');
    igual(e.el('fecha-bcv').textContent, 'Fecha valor: 09/10/2026', 'y asi se pinta');
    igual(e.Tasas.valores.euro, 980.61472543, 'el euro sigue siendo el de dolarapi');
  }

  {
    // 7. Cae dolarapi entera y lo unico legible es una fecha futura.
    const e = crearEntorno({ fuentes: { bcv: 'falla', euro: 'falla' } });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, 876.7976, 'se usa la del 13 a falta de otra');
    igual(e.Tasas.fechas.bcv, '2026-10-13', 'y se dice honestamente su fecha valor');
    igual(e.Tasas.seleccion.hayProxima, false, 'no se ofrece como eleccion: es la unica');
    igual(e.el('selector-fecha').hidden, true, 'selector oculto');
  }

  {
    // 8. El espejo del 6: para binance el metadato correcto SI es human_date.
    const e = crearEntorno({ fuentes: { binance: 'falla' } });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.binance, 1017, 'el respaldo tapa el hueco de binance');
    igual(e.Tasas.fechas.binance, '2026-10-11 07:00:22', 'con human_date, no con fecha_bcv');
  }

  {
    // 9. Todo caido: null en los tres, aviso, y nada lanza.
    const e = crearEntorno({
      fuentes: { bcv: 'falla', euro: 'falla', binance: 'falla', respaldo: 'falla' }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, null, 'bcv sin dato');
    igual(e.Tasas.valores.binance, null, 'binance sin dato');
    igual(e.el('aviso-tasas').hidden, false, 'el aviso aparece');
    igual(e.el('selector-fecha').hidden, true, 'selector oculto');
    igual(e.el('btn-actualizar').disabled, false, 'el boton queda rehabilitado');
    igual(e.el('tarjeta-bcv').dataset.estado, 'error', 'la tarjeta queda en error');
  }

  {
    // 10. El respaldo se pide SIEMPRE, no solo cuando falta algo.
    const e = crearEntorno();
    await e.Tasas.iniciar();
    igual(e.llamadas.length, 4, 'cuatro peticiones, el respaldo incluido');
  }

  /* ---------------------------------------------------------------------- */
  console.log('--- C. la preferencia ---');

  {
    // 11. Sin nada guardado: el comportamiento de siempre. Protege a los usuarios reales.
    const e = crearEntorno();
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.cual, 'vigente', 'por omision, vigente');
  }

  {
    // 12. Guardada 'proxima' y disponible.
    const e = crearEntorno({ guardado: 'proxima' });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.cual, 'proxima', 'se respeta lo guardado');
    igual(e.Tasas.valores.bcv, 876.7976, 'dolar de la proxima');
    igual(e.Tasas.valores.euro, 982.00454402, 'euro de la proxima: se mueven juntos');
    igual(e.Tasas.fechas.bcv, '2026-10-13', 'con su fecha valor');
  }

  {
    // 13. Guardada 'proxima' y hoy no hay. El deseo NO se borra.
    const e = crearEntorno({
      guardado: 'proxima',
      fuentes: { respaldo: con(RESPALDO_13, { fecha_bcv: '2026-10-09' }) }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.cual, 'vigente', 'el efectivo cae a vigente');
    igual(e.guardado.get('tasaBcvPreferida'), 'proxima', 'pero lo guardado sigue siendo proxima');
    igual(e.el('nota-selector').hidden, false, 'y se le explica por que');
  }

  {
    // 14. Basura guardada.
    for (const basura of ['manana', '', '0', 'VIGENTE', 'null']) {
      const e = crearEntorno({ guardado: basura });
      await e.Tasas.iniciar();
      igual(e.Tasas.seleccion.cual, 'vigente', 'guardado invalido (' + basura + ') -> vigente');
      /* Y se comprueba la validacion en si, no solo su efecto: sin ella, leer()
         devuelve la basura tal cual y seleccion.cual sale 'vigente' de todas formas,
         asi que la linea de arriba pasaria igual con el filtro borrado. */
      igual(e.Tasas.preferencia.leer(), 'vigente', 'y leer() ya devuelve un valor valido');
    }
  }

  {
    // 15. Pulsar cambia los numeros EN EL MISMO OBJETO y sin volver a la red.
    const e = crearEntorno();
    let avisado = 0;
    await e.Tasas.iniciar(() => { avisado++; });
    const ref = e.Tasas.valores;
    const peticiones = e.llamadas.length;
    const avisosAntes = avisado;

    e.el('fv-proxima').pulsar();

    igual(ref.bcv, 876.7976, 'el objeto que ya tenia la pagina cambio de valor');
    igual(e.Tasas.valores === ref, true, 'y es el mismo objeto, no uno nuevo');
    igual(e.llamadas.length, peticiones, 'sin ninguna peticion nueva');
    igual(avisado, avisosAntes + 1, 'la pagina fue avisada para recalcular');
    igual(e.guardado.get('tasaBcvPreferida'), 'proxima', 'y la eleccion quedo guardada');
    igual(e.el('fv-proxima').getAttribute('aria-pressed'), 'true', 'aria-pressed de proxima');
    igual(e.el('fv-vigente').getAttribute('aria-pressed'), 'false', 'aria-pressed de vigente');
  }

  {
    // 16. Volver a vigente guarda el valor explicito, no borra la clave.
    const e = crearEntorno({ guardado: 'proxima' });
    await e.Tasas.iniciar();
    e.el('fv-vigente').pulsar();
    igual(e.Tasas.valores.bcv, 875.6505, 'vuelve a la vigente');
    igual(e.guardado.get('tasaBcvPreferida'), 'vigente', 'guardado explicito');
  }

  {
    // 17. Pulsar la que ya esta activa es idempotente.
    const e = crearEntorno();
    await e.Tasas.iniciar();
    e.el('fv-vigente').pulsar();
    e.el('fv-vigente').pulsar();
    igual(e.Tasas.valores.bcv, 875.6505, 'sigue en la vigente');
    igual(e.el('fv-vigente').getAttribute('aria-pressed'), 'true', 'y el estado es coherente');
  }

  {
    // 18. Incognito: localStorage LANZA. La eleccion vale en la visita, no se recuerda.
    const e = crearEntorno({ almacenBloqueado: true });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.cual, 'vigente', 'con el almacen bloqueado, vigente');
    e.el('fv-proxima').pulsar();
    igual(e.Tasas.valores.bcv, 876.7976, 'y aun asi se puede elegir en esta visita');

    const f = crearEntorno({ soloEscrituraBloqueada: true });
    await f.Tasas.iniciar();
    f.el('fv-proxima').pulsar();
    igual(f.Tasas.valores.bcv, 876.7976, 'si solo falla setItem, tampoco revienta');
  }

  {
    /* 19. La proxima con el euro inservible. NUNCA se mezcla el euro de un dia con
       el dolar de otro: el promedio BCV-euro seria un numero equivocado que parece
       correcto. */
    const e = crearEntorno({
      guardado: 'proxima',
      fuentes: { respaldo: con(RESPALDO_13, { euro: 0 }) }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, 876.7976, 'el dolar de la proxima si sirve');
    igual(e.Tasas.valores.euro, null, 'y el euro queda No disponible, sin mezclar fechas');
  }

  /* ---------------------------------------------------------------------- */
  console.log('--- D. lo que se pinta ---');

  {
    const e = crearEntorno({ guardado: 'proxima' });
    await e.Tasas.iniciar();
    // 20.
    igual(e.el('fecha-bcv').textContent, 'Fecha valor: 13/10/2026', 'la tarjeta dice la fecha valor elegida');
    // 24.
    igual(e.el('fv-proxima').textContent, 'Desde el martes 13', 'la etiqueta nombra el dia de la semana');
    // 21.
    const dif = e.el('dif-tasas').textContent;
    const bien = dif.indexOf('1,1471 Bs') !== -1 && dif.indexOf('+0,13 %') !== -1 && dif.indexOf('más') !== -1;
    bien ? ok('la brecha dice 1,1471 Bs mas por dolar (+0,13 %)') : fallar('brecha mal escrita: ' + dif);
  }

  {
    // 22. Mismo numero con fechas distintas: no se puede afirmar una diferencia.
    const e = crearEntorno({ fuentes: { respaldo: con(RESPALDO_13, { dolar: 875.6505 }) } });
    await e.Tasas.iniciar();
    const dif = e.el('dif-tasas').textContent;
    igual(e.Tasas.seleccion.hayProxima, true, 'la eleccion existe: las fechas difieren');
    dif.indexOf('0,00') === -1 && dif.indexOf('misma tasa') !== -1
      ? ok('no dice +0,00 %, dice que es la misma tasa')
      : fallar('deberia decir que no hay diferencia: ' + dif);
  }

  {
    // 23. Una proxima mas baja.
    const e = crearEntorno({ fuentes: { respaldo: con(RESPALDO_13, { dolar: 870 }) } });
    await e.Tasas.iniciar();
    const dif = e.el('dif-tasas').textContent;
    dif.indexOf('menos') !== -1 && dif.indexOf('(-') !== -1
      ? ok('una proxima mas baja se describe como "menos"')
      : fallar('no describe la bajada: ' + dif);
  }

  {
    // 25. Las paginas sin selector (iva-igtf, dividir) no se enteran de nada.
    const e = crearEntorno({ selector: false, tarjetas: false, notaTasa: true });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, 875.6505, 'sin selector ni tarjetas, los valores llegan igual');
  }

  {
    // 26. textoNota en sus tres estados.
    const a = crearEntorno({ selector: false, tarjetas: false });
    await a.Tasas.iniciar();
    const tA = a.Tasas.textoNota();
    tA.indexOf('vigente (fecha valor 09/10/2026)') !== -1 && tA.indexOf('875,6505 Bs') !== -1
      ? ok('nota en vigente') : fallar('nota en vigente: ' + tA);

    const b = crearEntorno({ selector: false, tarjetas: false, guardado: 'proxima' });
    await b.Tasas.iniciar();
    const tB = b.Tasas.textoNota();
    tB.indexOf('próximo día hábil (fecha valor 13/10/2026)') !== -1
      ? ok('nota en proxima, nombrando su fecha valor') : fallar('nota en proxima: ' + tB);

    const c = crearEntorno({
      selector: false, tarjetas: false,
      fuentes: { bcv: 'falla', euro: 'falla', respaldo: 'falla' }
    });
    await c.Tasas.iniciar();
    igual(c.Tasas.textoNota(),
      'No se pudo consultar la tasa del BCV: los importes se muestran solo en la moneda elegida.',
      'el texto de fallo se conserva palabra por palabra');
  }

  /* ---------------------------------------------------------------------- */
  console.log('--- E. frescura del respaldo ---');

  {
    // 31. Un archivo sin tocar en mas de un dia no se ofrece como la tasa de manana.
    const e = crearEntorno({ fuentes: { respaldo: con(RESPALDO_13, { timestamp: haceHoras(30) }) } });
    await e.Tasas.iniciar();
    igual(e.Tasas.seleccion.hayProxima, false, 'respaldo rancio: no se ofrece como proxima');
    igual(e.Tasas.valores.bcv, 875.6505, 'y la vigente sigue siendo la de dolarapi');
  }

  {
    // 32. Rancio Y unico: se usa, pero avisando que se confirme.
    const e = crearEntorno({
      fuentes: {
        bcv: 'falla', euro: 'falla',
        respaldo: con(RESPALDO_13, { fecha_bcv: '2026-10-09', timestamp: haceHoras(10) })
      }
    });
    await e.Tasas.iniciar();
    igual(e.Tasas.valores.bcv, 876.7976, 'se usa el respaldo a falta de otra cosa');
    igual(e.el('aviso-tasas').hidden, false, 'pero con aviso');
    e.el('aviso-tasas').textContent.indexOf('bcv.org.ve') !== -1
      ? ok('el aviso remite a bcv.org.ve') : fallar('el aviso no remite al BCV');
  }

  /* ---------------------------------------------------------------------- */
  console.log('--- F. invariantes que no se pueden perder ---');

  {
    // 27 y 28. La identidad de los objetos expuestos.
    const e = crearEntorno();
    const v = e.Tasas.valores;
    const f = e.Tasas.fechas;
    const j = e.Tasas.juegos;
    const s = e.Tasas.seleccion;
    await e.Tasas.iniciar();
    e.el('fv-proxima').pulsar();
    await e.Tasas.cargar();
    igual(e.Tasas.valores === v, true, 'valores sigue siendo el mismo objeto');
    igual(e.Tasas.fechas === f, true, 'fechas sigue siendo el mismo objeto');
    igual(e.Tasas.juegos === j, true, 'juegos sigue siendo el mismo objeto');
    igual(e.Tasas.seleccion === s, true, 'seleccion sigue siendo el mismo objeto');
  }

  {
    // 29. La superficie vieja de la API: renombrar algo rompe tres paginas en silencio.
    const e = crearEntorno();
    ['valores', 'fechas', 'traerJson', 'cargar', 'iniciar'].forEach((m) => {
      igual(e.Tasas[m] !== undefined, true, 'la API sigue exponiendo ' + m);
    });
  }

  {
    // 30. El markup del selector esta en las dos paginas que lo llevan y en ninguna otra.
    const CON = ['index.html', 'conversor/index.html'];
    const SIN = ['iva-igtf/index.html', 'dividir-cuenta/index.html', 'cuotas/index.html',
      'feriados/index.html', 'autor/index.html', '404.html'];
    const necesarios = ['selector-fecha', 'fv-vigente', 'fv-proxima', 'dif-tasas', 'nota-selector'];

    CON.forEach((p) => {
      const html = fs.readFileSync(path.join(WEB, p), 'utf8');
      const faltan = necesarios.filter((id) => html.indexOf('id="' + id + '"') === -1);
      faltan.length === 0
        ? ok(p + ' trae el selector completo')
        : fallar(p + ' le falta: ' + faltan.join(', '));
    });

    SIN.forEach((p) => {
      const html = fs.readFileSync(path.join(WEB, p), 'utf8');
      const sobran = necesarios.filter((id) => html.indexOf('id="' + id + '"') !== -1);
      sobran.length === 0
        ? ok(p + ' no lleva selector')
        : fallar(p + ' lleva ids que no le tocan: ' + sobran.join(', '));
    });
  }

  {
    // El texto de la nota no puede volver a estar duplicado en las dos herramientas.
    ['assets/js/iva-igtf.js', 'assets/js/dividir.js'].forEach((p) => {
      const js = fs.readFileSync(path.join(WEB, p), 'utf8');
      js.indexOf('Equivalencias calculadas con') === -1
        ? ok(p + ' usa Tasas.textoNota() y no su propia copia del texto')
        : fallar(p + ' volvio a duplicar el texto de la nota');
    });
  }

  console.log('\n' + fallos + ' fallos.');
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((error) => {
  console.warn = warnReal;
  console.error('El arnes se rompio:', error);
  process.exit(1);
});
