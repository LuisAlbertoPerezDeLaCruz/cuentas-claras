/*
 * Prueba la CloudFront Function de infra/template.yaml sin desplegar nada.
 *
 *   node infra/probar-funcion-rutas.js
 *
 * El codigo de la funcion NO se copia aqui: se extrae de la plantilla, que es la
 * unica fuente de verdad. Asi la prueba no puede quedar validando una version
 * vieja de la funcion.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const PLANTILLA = path.join(__dirname, 'template.yaml');
const RUTA_BASE = 'cuentas-claras'; // el valor por omision del parametro RutaBase

function extraerFuncion() {
  const yaml = fs.readFileSync(PLANTILLA, 'utf8');
  const lineas = yaml.split('\n');
  const inicio = lineas.findIndex((l) => l.includes('FunctionCode: !Sub |'));
  if (inicio === -1) throw new Error('No se encontro FunctionCode en la plantilla.');

  const sangria = lineas[inicio + 1].match(/^ */)[0].length;
  const cuerpo = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.trim() !== '' && l.match(/^ */)[0].length < sangria) break;
    cuerpo.push(l.slice(sangria));
  }

  // CloudFormation sustituye ${RutaBase} al crear la pila.
  const codigo = cuerpo.join('\n').replace(/\$\{RutaBase\}/g, RUTA_BASE);
  return new Function(codigo + '\nreturn handler;')();
}

const handler = extraerFuncion();

// Cada caso: [uri que llega al borde, resultado esperado]
//   reescribe: la funcion cambia request.uri y S3 recibe esa clave
//   302/301:   la funcion responde sola, sin llegar al origen
const B = '/' + RUTA_BASE;
const CASOS = [
  // La raiz del dominio no tiene contenido: se manda a la aplicacion.
  ['/',                               { redireccion: 302, destino: B + '/' }],
  ['/index.html',                     { redireccion: 302, destino: B + '/' }],

  // Forma canonica: las carpetas terminan en barra.
  [B,                                 { redireccion: 301, destino: B + '/' }],
  [B + '/conversor',                  { redireccion: 301, destino: B + '/conversor/' }],
  [B + '/dividir-cuenta',             { redireccion: 301, destino: B + '/dividir-cuenta/' }],

  // Documentos indice: S3 con OAC no los resuelve solo.
  [B + '/',                           { reescribe: B + '/index.html' }],
  [B + '/conversor/',                 { reescribe: B + '/conversor/index.html' }],
  [B + '/iva-igtf/',                  { reescribe: B + '/iva-igtf/index.html' }],
  [B + '/autor/',                     { reescribe: B + '/autor/index.html' }],

  // Archivos: se piden tal cual.
  [B + '/index.html',                 { reescribe: B + '/index.html' }],
  [B + '/404.html',                   { reescribe: B + '/404.html' }],
  [B + '/assets/css/base.css',        { reescribe: B + '/assets/css/base.css' }],
  [B + '/assets/js/marco.js',         { reescribe: B + '/assets/js/marco.js' }],
  [B + '/assets/data/feriados-extra.json',
                                      { reescribe: B + '/assets/data/feriados-extra.json' }],

  // Las dos piezas de la PWA. Llevan punto, asi que la funcion las deja pasar
  // tal cual; el service worker tiene que servirse desde DENTRO de la subruta o
  // su alcance no podria cubrirla.
  [B + '/sw.js',                      { reescribe: B + '/sw.js' }],
  [B + '/manifest.webmanifest',       { reescribe: B + '/manifest.webmanifest' }],

  // Fuera de la subruta: no existe en el bucket, S3 da 403 y CloudFront
  // responde con la 404 del sitio. La funcion no tiene que hacer nada especial.
  ['/otra-cosa',                      { redireccion: 301, destino: '/otra-cosa/' }],
  ['/otra-cosa/',                     { reescribe: '/otra-cosa/index.html' }],

  // Las rutas viejas, sin el prefijo, ya no son del sitio: caen en la 404.
  // Esta es la regresion que hay que vigilar si alguien "arregla" la funcion
  // volviendola a hacer agnostica de la subruta.
  ['/conversor/',                     { reescribe: '/conversor/index.html' }]
];

let fallos = 0;

for (const [uri, esperado] of CASOS) {
  const salida = handler({ request: { uri: uri, headers: {} } });

  let obtenido;
  if (salida.statusCode) {
    obtenido = { redireccion: salida.statusCode, destino: salida.headers.location.value };
  } else {
    obtenido = { reescribe: salida.uri };
  }

  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(
    (ok ? '  ok  ' : ' FALLA') + '  ' + uri.padEnd(42) +
    JSON.stringify(obtenido) + (ok ? '' : '   esperaba ' + JSON.stringify(esperado))
  );
}

console.log('\n' + CASOS.length + ' casos, ' + fallos + ' fallos.');
process.exit(fallos === 0 ? 0 : 1);
