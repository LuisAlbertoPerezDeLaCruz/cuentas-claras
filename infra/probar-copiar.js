/*
 * Ejecuta web/assets/js/copiar.js en Node, con un DOM simulado, un reloj
 * controlado y un portapapeles programable.
 *
 *   node infra/probar-copiar.js
 *
 * El caso que justifica el arnes entero es el segundo: el DOM simulado reproduce
 * que asignar textContent DESTRUYE a los hijos, igual que el navegador. Las
 * herramientas reasignan el monto en cada pulsacion de tecla, asi que un boton
 * inyectado como HIJO del numero desapareceria al primer recalculo, sin ningun
 * error. Un arnes que no borrara los hijos daria el visto bueno a ese bug.
 *
 * El otro caso que importa es el del aviso rancio: si el monto cambia mientras el
 * boton dice "Copiado", el boton estaria afirmando que se copio un numero que ya
 * no esta en pantalla.
 *
 * Lo que NO cubre: que el portapapeles del sistema reciba el texto de verdad, ni
 * como se ve el boton. Eso se mira en el navegador.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const codigo = fs.readFileSync(path.join(WEB, 'assets', 'js', 'copiar.js'), 'utf8');

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };
const ok = (msg) => console.log('  ok    ' + msg);
const igual = (real, esperado, msg) =>
  real === esperado ? ok(msg) : fallar(msg + ' (esperaba ' + JSON.stringify(esperado) + ', dio ' + JSON.stringify(real) + ')');

/* ============================ el DOM simulado ============================= */

function crearElemento(etiqueta, texto) {
  const el = {
    tagName: String(etiqueta).toUpperCase(),
    className: '',
    type: '',
    hidden: false,
    dataset: {},
    atributos: {},
    hijos: [],
    parentNode: null,
    previousElementSibling: null,
    observadores: [],
    clics: [],
    _texto: texto === undefined ? '' : String(texto),

    setAttribute: function (n, v) { this.atributos[n] = v; },
    getAttribute: function (n) {
      return Object.prototype.hasOwnProperty.call(this.atributos, n) ? this.atributos[n] : null;
    },
    addEventListener: function (t, fn) { if (t === 'click') this.clics.push(fn); },
    pulsar: function () { this.clics.slice().forEach((fn) => fn()); },
    appendChild: function (h) { h.parentNode = this; this.hijos.push(h); return h; },
    querySelector: function (sel) {
      const clase = sel.replace('.', '');
      const buscar = (nodo) => {
        for (const h of nodo.hijos) {
          if (h.className && h.className.split(/\s+/).indexOf(clase) !== -1) return h;
          const dentro = buscar(h);
          if (dentro) return dentro;
        }
        return null;
      };
      return buscar(this);
    }
  };

  Object.defineProperty(el, 'innerHTML', {
    get: function () { return this._html || ''; },
    set: function (v) {
      this._html = String(v);
      this._texto = '';
      this.hijos.forEach((h) => { h.parentNode = null; });
      this.hijos = [];
    }
  });

  Object.defineProperty(el, 'textContent', {
    get: function () { return this._texto; },
    set: function (v) {
      this._texto = String(v);
      this._html = '';
      /* Igual que en el navegador: asignar textContent se lleva a los hijos.
         Es la fidelidad que hace que este arnes sirva para algo. */
      this.hijos.forEach((h) => { h.parentNode = null; });
      this.hijos = [];
      this.observadores.slice().forEach((fn) => fn());
    }
  });

  return el;
}

/* o.portapapeles: 'ok' (por omision), 'falla' o 'ausente'.
   o.forma: 'fila' (un <dt>/<dd> del desglose) o 'tarjeta'. */
function crearEntorno(o) {
  const op = o || {};
  const copiados = [];
  const relojes = [];
  let siguienteId = 1;

  const marcados = [];
  const valor = crearElemento('span', op.texto === undefined ? '16,00 Bs' : op.texto);
  valor.dataset.copiar = '';

  let contenedor;
  if (op.forma === 'tarjeta') {
    contenedor = crearElemento('article');
    contenedor.className = 'tarjeta tarjeta-resultado';
    const titulo = crearElemento('h3', 'Dolar BCV');
    titulo.className = 'tarjeta-titulo';
    contenedor.appendChild(titulo);
    valor.className = 'tarjeta-valor';
    contenedor.appendChild(valor);
    const meta = crearElemento('p');
    meta.className = 'tarjeta-meta';
    contenedor.appendChild(meta);
  } else {
    const fila = crearElemento('div');
    fila.className = 'fila';
    const dt = crearElemento('dt', 'IVA (16 %)');
    contenedor = crearElemento('dd');
    contenedor.previousElementSibling = dt;
    fila.appendChild(dt);
    fila.appendChild(contenedor);
    contenedor.appendChild(valor);
    const equiv = crearElemento('span');
    equiv.className = 'equivalente';
    contenedor.appendChild(equiv);
  }
  marcados.push(valor);

  const manejadoresDoc = {};
  const documento = {
    createElement: crearElemento,
    querySelectorAll: function (sel) {
      return sel === '[data-copiar]' ? marcados : [];
    },
    addEventListener: function (t, fn) { (manejadoresDoc[t] = manejadoresDoc[t] || []).push(fn); }
  };

  const navegador = {};
  if (op.portapapeles !== 'ausente') {
    navegador.clipboard = {
      writeText: function (texto) {
        if (op.portapapeles === 'falla') return Promise.reject(new Error('denegado'));
        copiados.push(texto);
        return Promise.resolve();
      }
    };
  }

  const ventana = {};

  function MutationObserverFalso(fn) {
    this.observe = function (el) { el.observadores.push(fn); };
  }

  const setTimeoutFalso = (fn, ms) => {
    const id = siguienteId++;
    relojes.push({ id: id, fn: fn, ms: ms });
    return id;
  };
  const clearTimeoutFalso = (id) => {
    const i = relojes.findIndex((r) => r.id === id);
    if (i !== -1) relojes.splice(i, 1);
  };

  new Function('window', 'document', 'navigator', 'MutationObserver', 'setTimeout', 'clearTimeout', codigo)(
    ventana, documento, navegador, MutationObserverFalso, setTimeoutFalso, clearTimeoutFalso
  );

  return {
    Copiar: ventana.Copiar,
    valor: valor,
    contenedor: contenedor,
    copiados: copiados,
    relojes: relojes,
    boton: function () { return contenedor.hijos.find((h) => h.className === 'copiar') || null; },
    montar: function () { (manejadoresDoc.DOMContentLoaded || []).forEach((fn) => fn()); },
    avanzar: function () {
      const pendientes = relojes.splice(0);
      pendientes.forEach((r) => r.fn());
      return pendientes.length;
    }
  };
}

// Deja pasar las promesas del portapapeles, que son microtareas.
const asentar = () => new Promise((r) => setImmediate(r));

/* ============================== las pruebas =============================== */

async function principal() {
  console.log('--- donde se inyecta el boton ---');

  {
    const e = crearEntorno();
    e.montar();
    const b = e.boton();
    if (!b) { fallar('no se inyecto ningun boton'); }
    else {
      ok('el boton se inyecta en el contenedor del monto');
      igual(e.valor.hijos.length, 0, 'el monto NO tiene hijos: el boton no esta dentro');
      igual(b.tagName, 'BUTTON', 'es un <button>');
      igual(b.type, 'button', 'con type=button, para no enviar el formulario');
      igual(b.dataset.icono, 'copiar', 'arranca con el icono de copiar');
      igual(b.textContent, '', 'sin texto: el boton es solo el icono');
      b.innerHTML.indexOf('<svg') === 0 ? ok('el icono es un SVG, no un caracter Unicode')
        : fallar('el icono no es un SVG: ' + b.innerHTML.slice(0, 40));
    }
  }

  {
    /* EL CASO QUE JUSTIFICA EL ARNES. Las herramientas reasignan el monto en cada
       tecla; si el boton fuera hijo, desapareceria al primer recalculo. */
    const e = crearEntorno();
    e.montar();
    e.valor.textContent = '18,00 Bs';
    e.valor.textContent = '20,00 Bs';
    e.boton() ? ok('el boton sobrevive a que el monto se repinte dos veces')
              : fallar('el boton desaparecio al repintar el monto: estaba inyectado como hijo');
  }

  console.log('--- cuando hay algo que copiar ---');

  {
    for (const relleno of ['—', 'No disponible', 'Cargando…', 'No aplica', '']) {
      const e = crearEntorno({ texto: relleno });
      e.montar();
      igual(e.boton().hidden, true, 'oculto con "' + relleno + '"');
    }
  }

  {
    for (const monto of ['16,00 Bs', '$100,00', '0,00 Bs', '1.250.000,00 Bs', '5,47 %']) {
      const e = crearEntorno({ texto: monto });
      e.montar();
      igual(e.boton().hidden, false, 'visible con "' + monto + '"');
    }
  }

  {
    // El monto se vacia: el boton se oculta y deja de prometer nada.
    const e = crearEntorno();
    e.montar();
    e.boton().pulsar();
    await asentar();
    e.valor.textContent = '—';
    igual(e.boton().hidden, true, 'si el monto se vacia, el boton se oculta');
    igual(e.boton().dataset.icono, 'copiar', 'y vuelve al icono de copiar');
  }

  console.log('--- copiar ---');

  {
    const e = crearEntorno({ texto: '1.250.000,00 Bs' });
    e.montar();
    /* Se guarda el SVG de base para compararlo despues. Mirar solo data-icono no
       basta: un pintado que ponga el marcador "listo" y dibuje el mismo icono
       pasaria la prueba mientras el usuario no ve ningun cambio. Lo encontro un
       sabotaje. */
    const iconoBase = e.boton().innerHTML;
    e.boton().pulsar();
    await asentar();
    igual(e.copiados.length, 1, 'una pulsacion copia una vez');
    igual(e.copiados[0], '1.250.000,00', 'copia SOLO el numero, sin la moneda');
    igual(e.boton().dataset.icono, 'listo', 'y lo confirma cambiando al icono de visto');
    igual(e.boton().dataset.aviso, 'ok', 'con su estado visual');
    igual(e.boton().getAttribute('aria-label'), 'IVA (16 %) copiado', 'y lo dice en la etiqueta');
    e.boton().innerHTML !== iconoBase
      ? ok('y el SVG dibujado cambia de verdad, no solo el marcador')
      : fallar('data-icono dice "listo" pero se dibuja el mismo icono de copiar');
  }

  {
    const e = crearEntorno({ texto: '—' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    igual(e.copiados.length, 0, 'un boton oculto pulsado por teclado no copia un guion');
  }

  {
    const e = crearEntorno({ portapapeles: 'falla' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    igual(e.copiados.length, 0, 'portapapeles denegado: no se copio nada');
    igual(e.boton().textContent, 'No se pudo', 'y el usuario se entera, con palabras');
    igual(e.boton().dataset.aviso, 'error', 'con estado de error, no de exito');
    igual(e.boton().getAttribute('aria-label'), 'No se pudo copiar IVA (16 %)', 'tambien en la etiqueta');
  }

  {
    const e = crearEntorno({ portapapeles: 'ausente' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    igual(e.boton().textContent, 'No se pudo', 'sin API de portapapeles tampoco se finge exito');
  }

  console.log('--- el aviso no puede quedar rancio ---');

  {
    const e = crearEntorno();
    e.montar();
    e.boton().pulsar();
    await asentar();
    igual(e.boton().dataset.icono, 'listo', 'muestra el visto');
    e.avanzar();
    igual(e.boton().dataset.icono, 'copiar', 'y al vencer el tiempo vuelve al icono de copiar');
    igual(e.boton().dataset.aviso, undefined, 'sin estado visual residual');
    igual(e.boton().getAttribute('aria-label'), 'Copiar IVA (16 %)', 'y a su etiqueta de base');
  }

  {
    // Doble toque: un solo temporizador pendiente, no dos apilados.
    const e = crearEntorno();
    e.montar();
    e.boton().pulsar();
    await asentar();
    e.boton().pulsar();
    await asentar();
    igual(e.relojes.length, 1, 'dos toques dejan un solo temporizador');
    igual(e.boton().dataset.icono, 'listo', 'y el aviso sigue en pie');
  }

  {
    /* Si el monto cambia mientras dice "Copiado", el boton estaria afirmando que
       se copio un numero que ya no esta en pantalla. */
    const e = crearEntorno({ texto: '16,00 Bs' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    e.valor.textContent = '32,00 Bs';
    igual(e.boton().dataset.icono, 'copiar', 'si el monto cambia, el aviso se retira');
  }

  {
    // Pero un repintado con el MISMO numero no tiene por que borrarlo.
    const e = crearEntorno({ texto: '16,00 Bs' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    e.valor.textContent = '16,00 Bs';
    igual(e.boton().dataset.icono, 'listo', 'un repintado con el mismo numero no lo borra');
    // Y si solo cambia la moneda alrededor, el numero copiado sigue valiendo.
    e.valor.textContent = '$16,00';
    igual(e.boton().dataset.icono, 'listo', 'cambiar la moneda alrededor no invalida el numero');
  }

  console.log('--- solo el numero ---');

  {
    const e = crearEntorno();
    const CASOS = [
      ['1.250.000,00 Bs', '1.250.000,00', 'quita la moneda de la derecha'],
      ['$100,00', '100,00', 'quita el simbolo de la izquierda'],
      ['875,6505 Bs', '875,6505', 'respeta los cuatro decimales de una tasa'],
      ['5,47 % mensual', '5,47', 'quita el % y la palabra'],
      ['$120,00 (6 × $20,00)', '120,00', 'de dos numeros se queda con el primero'],
      ['Sales ganando $12,00', '12,00', 'toma el primer NUMERO, no el principio del texto'],
      ['$1.353,90 (12 cuotas)', '1.353,90', 'no se lleva el numero del parentesis'],
      ['0,00 Bs', '0,00', 'el cero es un numero valido'],
      ['—', '', 'sin numero no devuelve nada'],
      ['No aplica', '', 'ni con texto sin cifras']
    ];
    CASOS.forEach(([entrada, esperado, porque]) => {
      igual(e.Copiar.soloNumero(entrada), esperado, porque);
    });
  }

  {
    // Y el que de verdad importa: lo que llega al portapapeles.
    const e = crearEntorno({ texto: '$120,00 (6 × $20,00)' });
    e.montar();
    e.boton().pulsar();
    await asentar();
    igual(e.copiados[0], '120,00', 'al portapapeles va el numero pelado, pegable');
  }

  console.log('--- accesibilidad ---');

  {
    const e = crearEntorno({ forma: 'fila' });
    e.montar();
    igual(e.boton().getAttribute('aria-label'), 'Copiar IVA (16 %)',
      'en el desglose, la etiqueta sale del <dt>');
    igual(e.boton().getAttribute('title'), 'Copiar IVA (16 %)',
      'y el title la repite, que es lo unico que ve el raton sobre un icono');
  }

  {
    const e = crearEntorno({ forma: 'tarjeta' });
    e.montar();
    igual(e.boton().getAttribute('aria-label'), 'Copiar Dolar BCV',
      'en las tarjetas, del titulo de la tarjeta');
    igual(e.boton().getAttribute('aria-live'), 'polite',
      'y el cambio de etiqueta se anuncia');
  }

  console.log('--- el markup del sitio ---');

  {
    const ESPERADOS = {
      'index.html': 3,
      'conversor/index.html': 7,
      'iva-igtf/index.html': 5,
      'dividir-cuenta/index.html': 4,
      'cuotas/index.html': 7
    };
    const SIN = ['feriados/index.html', 'autor/index.html', '404.html'];

    Object.keys(ESPERADOS).forEach((p) => {
      const html = fs.readFileSync(path.join(WEB, p), 'utf8');
      const marcas = (html.match(/data-copiar/g) || []).length;
      igual(marcas, ESPERADOS[p], p + ' marca sus montos');
      /* El agujero conocido: probar-pwa.js comprueba que el archivo este en el
         ARMAZON, pero NO que cada pagina lo cargue. Una pagina con montos
         marcados y sin el script pasaria todas las pruebas y fallaria solo en el
         navegador del visitante. */
      html.indexOf('assets/js/copiar.js') !== -1
        ? ok(p + ' carga copiar.js')
        : fallar(p + ' marca montos pero NO carga copiar.js');
    });

    SIN.forEach((p) => {
      const html = fs.readFileSync(path.join(WEB, p), 'utf8');
      (html.indexOf('data-copiar') === -1 && html.indexOf('copiar.js') === -1)
        ? ok(p + ' no tiene montos y no carga el modulo')
        : fallar(p + ' carga copiar.js sin tener montos');
    });

    const sw = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
    sw.indexOf("'assets/js/copiar.js'") !== -1
      ? ok('copiar.js esta en el ARMAZON del service worker')
      : fallar('copiar.js no esta en el ARMAZON: no funcionaria sin conexion');
  }

  {
    /* Ningun monto marcado puede llevar un hijo con id: el boton se inyecta en el
       contenedor y las herramientas asignan textContent al propio monto. */
    const e = crearEntorno();
    igual(typeof e.Copiar.hayNumero, 'function', 'el modulo expone hayNumero para poder probarlo');
    igual(e.Copiar.hayNumero('—'), false, 'hayNumero("—") es false');
    igual(e.Copiar.hayNumero('0'), true, 'hayNumero("0") es true');
  }

  console.log('\n' + fallos + ' fallos.');
  process.exit(fallos === 0 ? 0 : 1);
}

principal().catch((error) => {
  console.error('El arnes se rompio:', error);
  process.exit(1);
});
