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
 *
 * ⚠ Se copia SOLO EL NÚMERO, sin moneda ni texto alrededor: de "1.250.000,00 Bs"
 * sale "1.250.000,00", y de "$120,00 (6 × $20,00)" sale "120,00". Lo que se pega
 * es un número utilizable, no una frase. El formato se deja tal como se ve
 * (es-VE: punto de miles, coma decimal), que es lo que el usuario reconoce.
 *
 * ⚠ El botón no lleva texto, lleva el icono universal de copiar (dos hojas
 * superpuestas) en SVG con currentColor. SVG y no un carácter Unicode por lo
 * mismo que los iconos de la PWA no usan <text>: un glifo se dibuja distinto en
 * cada sistema. Y por eso aria-label es obligatorio, no decorativo.
 */

'use strict';

window.Copiar = (function () {
  var ETIQUETA = 'Copiar';
  var TIEMPO_AVISO_MS = 1800;

  /* aria-hidden porque el significado lo da el aria-label del botón; si no, un
     lector de pantalla no tendría nada que decir de un botón sin texto. */
  var ABRE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true" focusable="false">';

  var ICONOS = {
    // Dos hojas superpuestas: el icono universal de copiar.
    copiar: ABRE + '<rect x="9" y="9" width="11" height="11" rx="2"></rect>' +
      '<path d="M5 15V5a2 2 0 0 1 2-2h8"></path></svg>',
    // Un visto: la confirmación.
    listo: ABRE + '<path d="M20 6 9 17l-5-5"></path></svg>'
  };

  function hayNumero(texto) {
    return /\d/.test(texto);
  }

  /* El primer número del texto, con su formato tal cual.

     Tiene que ser el PRIMER número y no el principio del texto: /cuotas/ escribe
     "Sales ganando $12,00", que empieza con palabras. Y tiene que ser solo el
     primero: "$120,00 (6 × $20,00)" lleva dos, y lo que se quiere es el total.

     El grupo de miles exige exactamente tres dígitos tras el punto, para que un
     punto de final de frase no entre en la captura. */
  function soloNumero(texto) {
    var m = String(texto).match(/-?\d+(?:\.\d{3})*(?:,\d+)?/);
    return m ? m[0] : '';
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
    // El botón anuncia el resultado: su etiqueta es la que cambia.
    boton.setAttribute('aria-live', 'polite');

    var nombre = etiquetaDe(valor);
    var deBase = nombre ? 'Copiar ' + nombre : ETIQUETA;

    var reloj = null;
    var copiado = null;   // el número que se copió, para saber si ya quedó viejo

    /* Un solo sitio pinta el botón, para que el icono, el estado y la etiqueta no
       puedan quedar contradiciéndose. estado: '' | 'ok' | 'error'.

       En el fallo sí se usan palabras. Es la ruta rara y lo que importa ahí es
       que se entienda: un icono de error en un botón de copiar no dice nada. */
    function pintar(estado) {
      if (estado === 'error') {
        boton.textContent = 'No se pudo';
        boton.dataset.aviso = 'error';
        boton.dataset.icono = 'error';
        boton.setAttribute('aria-label', 'No se pudo copiar' + (nombre ? ' ' + nombre : ''));
        boton.setAttribute('title', 'No se pudo copiar');
        return;
      }

      if (estado === 'ok') {
        boton.innerHTML = ICONOS.listo;
        boton.dataset.aviso = 'ok';
        boton.dataset.icono = 'listo';
        boton.setAttribute('aria-label', (nombre ? nombre + ' copiado' : 'Copiado'));
        boton.setAttribute('title', 'Copiado');
        return;
      }

      boton.innerHTML = ICONOS.copiar;
      delete boton.dataset.aviso;
      boton.dataset.icono = 'copiar';
      boton.setAttribute('aria-label', deBase);
      boton.setAttribute('title', deBase);
    }

    function restaurar() {
      if (reloj) {
        clearTimeout(reloj);
        reloj = null;
      }
      copiado = null;
      pintar('');
    }

    function avisar(estado) {
      // Un segundo toque no puede apilar temporizadores: el primero en vencer
      // restauraría el botón mientras el segundo aviso todavía debería verse.
      if (reloj) clearTimeout(reloj);
      pintar(estado);
      reloj = setTimeout(restaurar, TIEMPO_AVISO_MS);
    }

    pintar('');

    boton.addEventListener('click', function () {
      var texto = valor.textContent.trim();
      if (!hayNumero(texto)) return;

      // Solo el numero: lo que se pega tiene que ser utilizable.
      var numero = soloNumero(texto) || texto;

      copiado = numero;
      pedirCopia(numero)
        .then(function () { avisar('ok'); })
        .catch(function () {
          // Falla de verdad: el usuario tiene que saber que no se copió nada.
          copiado = null;
          avisar('error');
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
      if (copiado !== null && soloNumero(texto) !== copiado) restaurar();
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

  return { montar: montar, activar: activar, hayNumero: hayNumero, soloNumero: soloNumero };
})();
