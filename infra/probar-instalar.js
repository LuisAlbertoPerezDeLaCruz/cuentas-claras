/*
 * Ejecuta web/assets/js/pwa.js en Node, con un DOM simulado, y dispara sus
 * eventos.
 *
 *   node infra/probar-instalar.js
 *
 * probar-pwa.js lee los archivos como texto (manifiesto, armazon, VERSION).
 * Esto es otra cosa: aqui pwa.js se CARGA y sus manejadores se DISPARAN, asi que
 * lo que se comprueba es el comportamiento.
 *
 * El caso que justifica el arnes entero es el primero: beforeinstallprompt se
 * dispara ANTES de 'load'. Es un evento que no se repite, asi que un listener
 * registrado dentro de 'load' no lo ve nunca y la banda no aparece jamas —
 * fallo silencioso, porque en el escritorio el navegador a veces lo dispara mas
 * tarde y parece funcionar. Aqui el evento va antes de 'load' a proposito.
 *
 * Lo que NO cubre: el dialogo nativo de instalacion, como se ve la banda y si
 * Chrome considera el sitio instalable. Eso hay que mirarlo en el telefono y en
 * DevTools > Application.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PWA = path.join(__dirname, '..', 'web', 'assets', 'js', 'pwa.js');
const codigo = fs.readFileSync(PWA, 'utf8');

let fallos = 0;
const fallar = (msg) => { console.log('  FALLA  ' + msg); fallos++; };
const ok = (msg) => console.log('  ok    ' + msg);

/* ======================== el DOM simulado ================================== */

function crearElemento(etiqueta) {
  return {
    etiqueta: etiqueta,
    className: '',
    atributos: {},
    parentNode: null,
    html: '',
    botones: {},
    clics: [],
    setAttribute: function (nombre, valor) { this.atributos[nombre] = valor; },
    addEventListener: function (tipo, fn) { if (tipo === 'click') this.clics.push(fn); },
    pulsar: function () { this.clics.forEach((fn) => fn()); },

    // Al asignar innerHTML se crean los botones que pwa.js buscara despues. No
    // es un parser de HTML: solo lo justo para poder pulsarlos.
    get innerHTML() { return this.html; },
    set innerHTML(valor) {
      this.html = valor;
      this.botones = {};
      const suyo = this;
      for (const m of valor.matchAll(/data-accion="([^"]+)"/g)) {
        this.botones[m[1]] = {
          parentNode: suyo,
          clics: [],
          addEventListener: function (tipo, fn) { if (tipo === 'click') this.clics.push(fn); },
          pulsar: function () { this.clics.forEach((fn) => fn()); }
        };
      }
    },

    querySelector: function (selector) {
      const m = selector.match(/data-accion="([^"]+)"/);
      return (m && this.botones[m[1]]) || null;
    },

    hijos: [],
    appendChild: function (hijo) { hijo.parentNode = this; this.hijos.push(hijo); return hijo; },
    removeChild: function (hijo) {
      this.hijos = this.hijos.filter((h) => h !== hijo);
      hijo.parentNode = null;
      return hijo;
    }
  };
}

// opciones: { marco, guardado, almacenBloqueado }
function crearEntorno(opciones) {
  const o = opciones || {};
  const manejadoresWindow = {};
  const manejadoresDoc = {};
  const registros = [];
  const guardado = new Map();
  if (o.guardado !== undefined) guardado.set('instalarDescartadoEl', String(o.guardado));

  // El pie que monta marco.js. pwa.js cuelga de aqui el enlace de instalar.
  const creditos = crearElemento('p');
  creditos.hijos = [];
  creditos.appendChild = function (hijo) { hijo.parentNode = this; this.hijos.push(hijo); return hijo; };
  creditos.removeChild = function (hijo) {
    this.hijos = this.hijos.filter((h) => h !== hijo);
    hijo.parentNode = null;
    return hijo;
  };

  const cuerpo = crearElemento('body');
  cuerpo.hijos = [];
  cuerpo.appendChild = function (hijo) { hijo.parentNode = this; this.hijos.push(hijo); return hijo; };
  cuerpo.removeChild = function (hijo) {
    this.hijos = this.hijos.filter((h) => h !== hijo);
    hijo.parentNode = null;
    return hijo;
  };

  const documento = {
    // 'loading' = el pie todavia no esta montado, igual que antes de
    // DOMContentLoaded en el navegador.
    readyState: o.cuerpoListo === false ? 'loading' : 'complete',
    body: o.cuerpoListo === false ? null : cuerpo,
    createElement: crearElemento,
    createTextNode: function (texto) { return { texto: texto, parentNode: null }; },
    querySelector: function (selector) {
      if (selector === '.pie-creditos') return o.sinPie ? null : creditos;
      return null;
    },
    addEventListener: function (tipo, fn) {
      (manejadoresDoc[tipo] = manejadoresDoc[tipo] || []).push(fn);
    }
  };

  const ventana = {
    Marco: o.marco === false ? undefined : { NOMBRE: 'Cuentas Claras' },
    addEventListener: function (tipo, fn) {
      (manejadoresWindow[tipo] = manejadoresWindow[tipo] || []).push(fn);
    }
  };

  const navegador = {
    serviceWorker: {
      register: function (ruta, opciones) {
        registros.push({ ruta: ruta, opciones: opciones });
        return Promise.resolve({});
      }
    }
  };

  const almacen = o.almacenBloqueado
    ? {
        getItem: function () { throw new Error('acceso denegado'); },
        setItem: function () { throw new Error('acceso denegado'); }
      }
    : {
        getItem: function (k) { return guardado.has(k) ? guardado.get(k) : null; },
        setItem: function (k, v) { guardado.set(k, v); }
      };

  const entorno = {
    cuerpo: cuerpo,
    documento: documento,
    registros: registros,
    guardado: guardado,

    banda: function () { return cuerpo.hijos.find((h) => h.className === 'instalar') || null; },

    // El enlace del pie va envuelto en un <span> junto a su separador.
    enlacePie: function () {
      const tramo = creditos.hijos.find((h) => h.etiqueta === 'span');
      if (!tramo) return null;
      return tramo.hijos.find((h) => h.className === 'pie-instalar') || null;
    },

    separadorSuelto: function () {
      return creditos.hijos.some((h) => h.texto === ' · ');
    },

    disparar: function (tipo, evento) {
      const lista = manejadoresWindow[tipo] || [];
      lista.forEach((fn) => fn(evento));
      return lista.length;
    },

    dispararEnDocumento: function (tipo) {
      (manejadoresDoc[tipo] || []).forEach((fn) => fn());
    },

    // El evento que dispara el navegador, con la cuenta de prompt() y de
    // preventDefault() para poder comprobarlas.
    invitacion: function () {
      return {
        prompts: 0,
        prevenido: false,
        preventDefault: function () { this.prevenido = true; },
        prompt: function () { this.prompts++; return Promise.resolve({ outcome: 'accepted' }); }
      };
    }
  };

  new Function('window', 'document', 'navigator', 'localStorage', codigo)(
    ventana, documento, navegador, almacen
  );

  return entorno;
}

/* ============================ las pruebas ================================== */

console.log('--- el service worker se sigue registrando ---');
{
  const e = crearEntorno();
  if (e.registros.length) fallar('se registro antes de "load"; deberia esperar a que cargue la pagina');
  e.disparar('load');
  if (e.registros.length !== 1) {
    fallar('tras "load" hay ' + e.registros.length + ' registros, se esperaba 1');
  } else {
    const r = e.registros[0];
    if (r.ruta !== 'sw.js') fallar('la ruta es "' + r.ruta + '"; tiene que ser relativa ("sw.js")');
    else if (!r.opciones || r.opciones.scope !== './') fallar('el scope no es "./"');
    else ok('register("sw.js", { scope: "./" }) al cargar la pagina');
  }
}

console.log('\n--- la banda de instalacion ---');
{
  // El caso que importa: el evento llega ANTES de 'load'.
  const e = crearEntorno();
  const inv = e.invitacion();
  if (!e.disparar('beforeinstallprompt', inv)) {
    fallar('nadie escucha beforeinstallprompt (¿el listener quedo dentro de "load"?)');
  }
  const banda = e.banda();
  if (!banda) fallar('el evento llego antes de "load" y la banda no aparecio');
  else ok('aparece con beforeinstallprompt disparado antes de "load"');

  if (!inv.prevenido) fallar('no se llamo a preventDefault(): el evento no se puede guardar');
  else ok('llama a preventDefault()');

  if (inv.prompts !== 0) fallar('llamo a prompt() sola; el navegador exige un gesto del usuario');
  else ok('no llama a prompt() sin que el usuario lo pida');

  if (banda) {
    if (!/¿Instalar Cuentas Claras\?/.test(banda.innerHTML)) {
      fallar('el texto no nombra el sitio: ' + banda.innerHTML.slice(0, 80));
    } else ok('el texto sale de Marco.NOMBRE');

    // Misma regla que el resto del sitio: una barra inicial sacaria la ruta de
    // la subruta y el icono de la banda no cargaria.
    const src = (banda.innerHTML.match(/src="([^"]*)"/) || [])[1];
    if (!src) fallar('la banda no lleva icono');
    else if (src.startsWith('/') || /^https?:/.test(src)) fallar('el icono usa una ruta absoluta: ' + src);
    else ok('el icono va con ruta relativa (' + src + ')');
  }
}

{
  // Chrome puede volver a disparar el evento en la misma pagina.
  const e = crearEntorno();
  e.disparar('beforeinstallprompt', e.invitacion());
  e.disparar('beforeinstallprompt', e.invitacion());
  if (e.cuerpo.hijos.length !== 1) fallar('dos eventos dejaron ' + e.cuerpo.hijos.length + ' bandas');
  else ok('dos eventos seguidos no duplican la banda');
}

{
  // Sin beforeinstallprompt (iOS, o ya instalada) no se inventa nada.
  const e = crearEntorno();
  e.disparar('load');
  if (e.cuerpo.hijos.length) fallar('aparecio la banda sin que el navegador avisara que es instalable');
  else ok('sin beforeinstallprompt no se muestra nada');
}

{
  // El evento puede llegar antes de que exista el <body>.
  const e = crearEntorno({ cuerpoListo: false });
  e.disparar('beforeinstallprompt', e.invitacion());
  if (e.banda()) fallar('se inyecto en un documento que todavia se estaba cargando');
  e.documento.body = e.cuerpo;
  e.documento.readyState = 'complete';
  e.dispararEnDocumento('DOMContentLoaded');
  if (!e.banda()) fallar('el evento llego con el documento cargando y la banda nunca se inyecto');
  else ok('si el evento llega antes de tiempo, espera a DOMContentLoaded');
}

console.log('\n--- los botones ---');
{
  const e = crearEntorno();
  const inv = e.invitacion();
  e.disparar('beforeinstallprompt', inv);
  e.banda().querySelector('[data-accion="si"]').pulsar();
  if (inv.prompts !== 1) fallar('"Instalar" llamo a prompt() ' + inv.prompts + ' veces, se esperaba 1');
  else ok('"Instalar" abre el dialogo nativo');
  if (e.banda()) fallar('la banda sigue en pantalla despues de instalar');
  else ok('"Instalar" quita la banda');
  if (e.guardado.has('instalarDescartadoEl')) fallar('instalar no deberia guardar un descarte');
  else ok('instalar no marca la invitacion como descartada');
}

{
  const e = crearEntorno();
  const inv = e.invitacion();
  e.disparar('beforeinstallprompt', inv);
  const banda = e.banda();
  banda.querySelector('[data-accion="no"]').pulsar();
  if (inv.prompts !== 0) fallar('"Ahora no" llamo a prompt()');
  else if (e.banda()) fallar('"Ahora no" no quito la banda');
  else if (!e.guardado.has('instalarDescartadoEl')) fallar('"Ahora no" no se recordo: volveria a preguntar en cada visita');
  else ok('"Ahora no" cierra y recuerda el descarte');
}

{
  // Un doble toque en "Instalar" no puede llamar dos veces a prompt(): el
  // navegador consume el evento en la primera y la segunda lanzaria.
  const e = crearEntorno();
  const inv = e.invitacion();
  e.disparar('beforeinstallprompt', inv);
  const boton = e.banda().querySelector('[data-accion="si"]');
  boton.pulsar();
  try {
    boton.pulsar();
    if (inv.prompts !== 1) fallar('el segundo toque llamo a prompt() otra vez');
    else ok('un segundo toque en "Instalar" no repite prompt()');
  } catch (error) {
    fallar('el segundo toque lanzo: ' + error.message);
  }
}

console.log('\n--- la memoria del "ahora no" ---');
{
  const hace10dias = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const e = crearEntorno({ guardado: hace10dias });
  e.disparar('beforeinstallprompt', e.invitacion());
  if (e.banda()) fallar('descartada hace 10 dias y vuelve a preguntar');
  else ok('descartada hace 10 dias: no insiste');
}

{
  const hace40dias = Date.now() - 40 * 24 * 60 * 60 * 1000;
  const e = crearEntorno({ guardado: hace40dias });
  e.disparar('beforeinstallprompt', e.invitacion());
  if (!e.banda()) fallar('descartada hace 40 dias y ya no la ofrece nunca mas');
  else ok('descartada hace 40 dias: vuelve a ofrecerla');
}

{
  // Incognito o almacenamiento bloqueado: leer localStorage lanza. Preferible
  // mostrar la banda a no ofrecer nunca la instalacion, y sobre todo no romper.
  let e;
  try {
    e = crearEntorno({ almacenBloqueado: true });
    e.disparar('beforeinstallprompt', e.invitacion());
  } catch (error) {
    fallar('con localStorage bloqueado lanzo: ' + error.message);
  }
  if (e && !e.banda()) fallar('con localStorage bloqueado no aparece la banda');
  else if (e) {
    ok('con localStorage bloqueado aparece igual');
    try {
      e.banda().querySelector('[data-accion="no"]').pulsar();
      ok('"Ahora no" no lanza aunque no se pueda guardar');
    } catch (error) {
      fallar('"Ahora no" lanzo con localStorage bloqueado: ' + error.message);
    }
  }
}

console.log('\n--- el enlace del pie ---');
{
  const e = crearEntorno();
  const inv = e.invitacion();
  e.disparar('beforeinstallprompt', inv);
  const enlace = e.enlacePie();
  if (!enlace) fallar('no se agrego el enlace al pie');
  else if (enlace.etiqueta !== 'button') fallar('el enlace del pie es un <' + enlace.etiqueta + '>; hace algo, no navega');
  else ok('aparece en el pie cuando se puede instalar');

  if (enlace) {
    enlace.pulsar();
    if (inv.prompts !== 1) fallar('el enlace del pie no abrio el dialogo');
    else ok('el enlace del pie abre el dialogo nativo');
    if (e.enlacePie()) fallar('el enlace sigue en el pie despues de instalar');
    else if (e.separadorSuelto()) fallar('quedo un " · " suelto en el pie');
    else ok('al usarlo se va, y se lleva su separador');
  }
}

{
  // El motivo de existir del enlace: deshacer un "ahora no".
  const e = crearEntorno();
  const inv = e.invitacion();
  e.disparar('beforeinstallprompt', inv);
  e.banda().querySelector('[data-accion="no"]').pulsar();
  if (!e.enlacePie()) fallar('"Ahora no" se llevo tambien el enlace del pie: no hay vuelta atras');
  else ok('"Ahora no" cierra la banda pero deja el enlace del pie');
  e.enlacePie().pulsar();
  if (inv.prompts !== 1) fallar('el enlace del pie no funciona tras un "ahora no"');
  else ok('el enlace del pie sirve para deshacer el "ahora no"');
}

{
  // Visita siguiente dentro de los 30 dias: sin banda, pero con salida.
  const e = crearEntorno({ guardado: Date.now() - 10 * 24 * 60 * 60 * 1000 });
  e.disparar('beforeinstallprompt', e.invitacion());
  if (e.banda()) fallar('descartada hace 10 dias y vuelve a insistir con la banda');
  else if (!e.enlacePie()) fallar('descartada hace 10 dias y tampoco queda el enlace del pie');
  else ok('descartada hace poco: sin banda, pero con el enlace del pie');
}

{
  // Sin beforeinstallprompt (iOS, ya instalada, navegador sin soporte) el
  // enlace no puede aparecer: seria un enlace muerto.
  const e = crearEntorno();
  e.disparar('load');
  if (e.enlacePie()) fallar('hay "Instalar la app" en el pie sin que se pueda instalar');
  else ok('sin beforeinstallprompt no hay enlace en el pie');
}

{
  // Una pagina sin pie montado no puede reventar.
  let e;
  try {
    e = crearEntorno({ sinPie: true });
    e.disparar('beforeinstallprompt', e.invitacion());
    if (!e.banda()) fallar('sin pie tampoco aparecio la banda');
    else ok('sin pie en la pagina, la banda sigue apareciendo');
  } catch (error) {
    fallar('sin .pie-creditos lanzo: ' + error.message);
  }
}

console.log('\n--- instalada desde el menu del navegador ---');
{
  const e = crearEntorno();
  e.disparar('beforeinstallprompt', e.invitacion());
  if (!e.disparar('appinstalled')) fallar('nadie escucha appinstalled');
  if (e.banda()) fallar('la banda sigue ofreciendo instalar una app ya instalada');
  else ok('appinstalled quita la banda');
  if (e.enlacePie()) fallar('el pie sigue ofreciendo instalar una app ya instalada');
  else ok('appinstalled quita el enlace del pie');
}

console.log('\n--- sin marco.js ---');
{
  const e = crearEntorno({ marco: false });
  e.disparar('beforeinstallprompt', e.invitacion());
  const banda = e.banda();
  if (!banda) fallar('sin window.Marco no aparece la banda');
  else if (/undefined/.test(banda.innerHTML)) fallar('sin window.Marco el texto dice "undefined"');
  else ok('sin window.Marco el texto sigue siendo legible');
}

console.log('\n' + fallos + ' fallos.');
process.exit(fallos === 0 ? 0 : 1);
