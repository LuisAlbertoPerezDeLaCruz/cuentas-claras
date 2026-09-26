/*
 * Registro del service worker y la invitacion a instalar la aplicacion.
 *
 * La ruta 'sw.js' va SIN barra inicial, como el resto del sitio: register()
 * resuelve la ruta contra document.baseURI, o sea contra el <base href> de la
 * pagina. Desde /cuentas-claras/cuotas/ eso da /cuentas-claras/sw.js, que es
 * donde esta. Con barra inicial ('/sw.js') buscaria en la raiz del dominio, que
 * no existe, y la instalacion fallaria en silencio.
 *
 * ⚠ NINGUN navegador permite instalar sin que el usuario lo pida. prompt() exige
 * un gesto del usuario, asi que no se puede llamar al cargar la pagina: el
 * navegador lo rechaza. Lo mas cerca que se llega de "automatico" es esto: en
 * cuanto el navegador avisa que el sitio es instalable, se ofrece una banda con
 * un boton, y ese boton abre el dialogo NATIVO de instalacion ("Instalar
 * aplicacion" / "Anadir a pantalla de inicio"), que es el mensaje tipico que el
 * usuario reconoce. El texto de ese dialogo lo pone el navegador, no el sitio.
 */

'use strict';

(function () {
  /* ------------------ 1. el service worker ------------------------------- */

  // No hay service workers en http:// a secas (si en localhost y en 127.0.0.1),
  // ni bajo file://. Que falte la API no es un error: el sitio funciona igual.
  if ('serviceWorker' in navigator) {
    // Se espera a 'load' para no competir por ancho de banda con el CSS y el JS
    // de la propia pagina, que es lo que el visitante esta esperando ver.
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { scope: './' })
        .catch(function (error) {
          // Un registro fallido no debe romper nada: sin service worker el sitio
          // se comporta como siempre, solo que sin funcionar sin conexion.
          console.warn('No se pudo registrar el service worker:', error.message);
        });
    });
  }

  /* ------------------ 2. la invitacion a instalar ------------------------ */

  // Cuanto se respeta un "ahora no" antes de volver a preguntar. Sin esto la
  // banda reaparece en cada visita y se vuelve molesta.
  var CLAVE_DESCARTE = 'instalarDescartadoEl';
  var DESCANSO_MS = 30 * 24 * 60 * 60 * 1000;

  var invitacion = null;  // el evento que guarda el navegador, o null
  var banda = null;       // la banda en pantalla, o null
  var enlacePie = null;   // el enlace del pie, o null

  function descartadaHacePoco() {
    try {
      var cuando = Number(localStorage.getItem(CLAVE_DESCARTE));
      return cuando > 0 && Date.now() - cuando < DESCANSO_MS;
    } catch (error) {
      // Incognito o almacenamiento bloqueado: se muestra la banda. Preferible a
      // no ofrecer nunca la instalacion.
      return false;
    }
  }

  function recordarDescarte() {
    try { localStorage.setItem(CLAVE_DESCARTE, String(Date.now())); } catch (error) {}
  }

  function quitarBanda() {
    if (banda && banda.parentNode) banda.parentNode.removeChild(banda);
    banda = null;
  }

  function quitarEnlacePie() {
    if (enlacePie && enlacePie.parentNode) enlacePie.parentNode.removeChild(enlacePie);
    enlacePie = null;
  }

  function pedirInstalacion() {
    // Un doble toque encola dos clics antes de que la banda salga del documento.
    // Sin esta guarda el segundo revienta contra un evento que ya se consumio.
    if (!invitacion) return;

    var guardada = invitacion;
    // prompt() se puede llamar UNA sola vez por evento: el navegador consume el
    // evento al abrir su dialogo. Se suelta antes de llamarlo para que un doble
    // toque no intente usarlo dos veces.
    invitacion = null;
    quitarBanda();
    quitarEnlacePie();
    guardada.prompt();
  }

  function mostrarBanda() {
    if (banda || !invitacion || !document.body) return;

    // El nombre sale de marco.js (que ya esta cargado: va antes en todas las
    // paginas) para no tener que cambiarlo en dos sitios.
    var nombre = (window.Marco && window.Marco.NOMBRE) || 'esta aplicacion';

    banda = document.createElement('aside');
    banda.className = 'instalar';
    banda.setAttribute('aria-label', 'Instalar la aplicacion');
    banda.innerHTML =
      '<img class="instalar-icono" src="assets/iconos/icono-192.png" alt="">' +
      '<p class="instalar-texto"><strong>¿Instalar ' + nombre + '?</strong>' +
      '<span>Se abre como una app y funciona sin conexión.</span></p>' +
      '<div class="instalar-acciones">' +
      '<button type="button" class="boton boton-secundario" data-accion="no">Ahora no</button>' +
      '<button type="button" class="boton" data-accion="si">Instalar</button>' +
      '</div>';

    banda.querySelector('[data-accion="si"]').addEventListener('click', pedirInstalacion);
    banda.querySelector('[data-accion="no"]').addEventListener('click', function () {
      recordarDescarte();
      quitarBanda();
    });

    document.body.appendChild(banda);
  }

  /* Una salida para quien dijo "ahora no" y se arrepiente antes de los 30 dias,
     y para quien cerro la banda sin leerla.

     ⚠️ Solo se pone cuando hay una invitacion guardada. Un "Instalar la app" fijo
     en el pie seria un enlace muerto en todos los casos en que el navegador no
     ofrece instalacion: ya instalada, iOS, o un navegador sin soporte. Pulsarlo
     no haria nada y no habria forma de que el visitante entendiera por que. */
  function ponerEnlacePie() {
    if (enlacePie || !invitacion) return;

    // Lo monta marco.js en DOMContentLoaded; si todavia no esta, no hay donde.
    var creditos = document.querySelector('.pie-creditos');
    if (!creditos) return;

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'pie-instalar';
    boton.textContent = 'Instalar la app';
    boton.addEventListener('click', pedirInstalacion);

    // El separador va dentro del mismo tramo que el boton para que quitarlo se
    // lleve los dos y no quede un " · " suelto colgando del pie.
    enlacePie = document.createElement('span');
    enlacePie.appendChild(document.createTextNode(' · '));
    enlacePie.appendChild(boton);
    creditos.appendChild(enlacePie);
  }

  // Lo que se ofrece cuando el navegador dice que el sitio es instalable. La
  // banda respeta el "ahora no"; el enlace del pie no, porque es justo el modo
  // de deshacerlo.
  function ofrecer() {
    if (!descartadaHacePoco()) mostrarBanda();
    ponerEnlacePie();
  }

  // ⚠ Este listener se registra al cargar el script, NO dentro de 'load'. El
  // navegador dispara beforeinstallprompt muy pronto, a veces antes de que el
  // documento este listo, y el evento no se repite: registrarlo tarde es no
  // verlo nunca y que la banda no aparezca jamas.
  window.addEventListener('beforeinstallprompt', function (evento) {
    // Sin preventDefault() el navegador se queda con el evento y guardarlo para
    // llamar a prompt() despues deja de servir.
    evento.preventDefault();
    invitacion = evento;

    // Se espera al documento por el enlace del pie: marco.js monta el pie en
    // DOMContentLoaded, asi que antes de eso no hay donde colgarlo. marco.js va
    // antes que este archivo en las ocho paginas, o sea que su manejador corre
    // primero y cuando llega este el pie ya existe.
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ofrecer);
    else ofrecer();
  });

  // Si instala desde el menu del navegador mientras la banda esta en pantalla,
  // la banda sobra. Tambien cubre la instalacion desde otra pestana.
  window.addEventListener('appinstalled', function () {
    invitacion = null;
    quitarBanda();
    quitarEnlacePie();
  });
})();
