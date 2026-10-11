/*
 * Botón "Copiar" en cada monto calculado del sitio.
 *
 * Es declarativo a propósito: se marca el elemento que contiene el número con
 * data-copiar y este módulo hace el resto. Así la lógica no se repite en los
 * cinco archivos de las herramientas, y una página nueva solo tiene que poner el
 * atributo.
 *
 * ⚠ EL BOTÓN SE INSERTA COMO HERMANO DEL MONTO, NUNCA COMO HIJO.
 * Las herramientas asignan `elemento.textContent` en cada pulsación de tecla, y
 * eso destruye a los hijos. Un botón dentro del monto desaparecería al primer
 * recálculo, sin ningún error. Es la misma trampa que ya costó un rato con un
 * <dd> que llevaba un <span> dentro.
 *
 * ⚠ Que haya algo que copiar se decide por si el texto TIENE UN DÍGITO, no por
 * una lista de textos de relleno. "—", "No disponible", "Cargando…" y "No
 * aplica" no tienen ninguno; cualquier monto real sí. Enumerar los rellenos
 * obligaría a actualizar este archivo cada vez que una herramienta cambie el
 * suyo, y el síntoma sería un botón que copia un guion.
 */

'use strict';

window.Copiar = (function () {
  var ETIQUETA = 'Copiar';
  var TIEMPO_AVISO_MS = 1800;

  function hayNumero(texto) {
    return /\d/.test(texto);
  }

  /* Con quince botones en una página, un lector de pantalla diría "Copiar"
     quince veces sin decir qué. La etiqueta de la fila (<dt>) o el título de la
     tarjeta dan el contexto. */
  function etiquetaDe(valor) {
    var dd = valor.parentNode;
    var previo = dd && dd.previousElementSibling;
    if (previo && previo.tagName === 'DT') return previo.textContent.trim();

    var tarjeta = dd;
    while (tarjeta && (!tarjeta.className || tarjeta.className.indexOf('tarjeta') === -1)) {
      tarjeta = tarjeta.parentNode;
    }
    var titulo = tarjeta && tarjeta.querySelector && tarjeta.querySelector('.tarjeta-titulo');
    return titulo ? titulo.textContent.trim() : '';
  }

  function pedirCopia(texto) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      // Navegador sin portapapeles, o servido por http:// sin cifrar.
      return Promise.reject(new Error('sin portapapeles'));
    }
    return navigator.clipboard.writeText(texto);
  }

  function activar(valor) {
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'copiar';
    boton.textContent = ETIQUETA;
    // El propio botón anuncia el resultado: su texto es el que cambia.
    boton.setAttribute('aria-live', 'polite');

    var nombre = etiquetaDe(valor);
    boton.setAttribute('aria-label', nombre ? 'Copiar ' + nombre : ETIQUETA);

    var reloj = null;
    var copiado = null;   // el texto que se copió, para saber si ya quedó viejo

    function restaurar() {
      if (reloj) {
        clearTimeout(reloj);
        reloj = null;
      }
      copiado = null;
      boton.textContent = ETIQUETA;
      delete boton.dataset.aviso;
    }

    function avisar(mensaje, clase) {
      // Un segundo toque no puede apilar temporizadores: el primero en vencer
      // restauraría el botón mientras el segundo aviso todavía debería verse.
      if (reloj) clearTimeout(reloj);
      boton.textContent = mensaje;
      boton.dataset.aviso = clase;
      reloj = setTimeout(restaurar, TIEMPO_AVISO_MS);
    }

    boton.addEventListener('click', function () {
      var texto = valor.textContent.trim();
      if (!hayNumero(texto)) return;

      copiado = texto;
      pedirCopia(texto)
        .then(function () { avisar('Copiado', 'ok'); })
        .catch(function () {
          // Falla de verdad: el usuario tiene que saber que no se copió nada.
          copiado = null;
          avisar('No se pudo', 'error');
        });
    });

    /* El monto se repinta en cada tecla. Dos cosas que hay que seguir:
       - si deja de haber número, el botón se oculta;
       - si el número CAMBIA mientras dice "Copiado", vuelve a "Copiar", porque
         si no estaría afirmando que se copió un número que ya no está. */
    function sincronizar() {
      var texto = valor.textContent.trim();
      boton.hidden = !hayNumero(texto);
      if (boton.hidden) {
        restaurar();
        return;
      }
      if (copiado !== null && texto !== copiado) restaurar();
    }

    sincronizar();

    if (typeof MutationObserver === 'function') {
      new MutationObserver(sincronizar).observe(valor, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    valor.parentNode.appendChild(boton);
    return boton;
  }

  function montar(raiz) {
    var donde = raiz || document;
    var marcados = donde.querySelectorAll('[data-copiar]');
    var botones = [];
    for (var i = 0; i < marcados.length; i++) botones.push(activar(marcados[i]));
    return botones;
  }

  document.addEventListener('DOMContentLoaded', function () { montar(); });

  return { montar: montar, activar: activar, hayNumero: hayNumero };
})();
