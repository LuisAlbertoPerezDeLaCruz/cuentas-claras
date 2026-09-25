# Cuentas Claras — herramientas del día a día (Venezuela)

Memoria del proyecto para retomarlo en sesiones futuras.

## Qué es

Sitio estático con calculadoras de uso cotidiano en Venezuela. Nació como la primera tarea del
curso de AWS de Luis (un conversor USD→Bs en S3), **ya tiene usuarios reales**, y se amplió para
que además le sirva como **carta de presentación como desarrollador**.

Restricciones que marcan todas las decisiones:
- **Sin EC2 ni servidores**: todo estático, servido por CDN.
- **Muy bajo costo**: centavos al mes.
- **Luis administra AWS**. Aquí se entregan código, plantilla y guía; no se ejecutan acciones en
  su cuenta.

## Estado (25-sep-2026)

- ✅ Seis páginas construidas y **verificadas en el navegador**, con los cálculos contrastados a
  mano y la consola limpia.
- ✅ `infra/template.yaml` escrita y validada como YAML; la función del borde probada con
  **19 casos** (`node infra/probar-funcion-rutas.js`).
- ⬜ **Pendiente: desplegar.** No se ha creado ninguna pila ni bucket todavía.
- ✅ **Subruta resuelta (25-sep-2026).** El sitio va en
  `https://lapfreelance56.online/cuentas-claras/` y ya está construido para eso: `<base href>` en
  cada página, rutas relativas, prefijo en el bucket, la función del borde rehecha y `servir.sh`
  sirviendo bajo la misma subruta. Ver "Servir bajo una subruta".
- ✅ **PWA hecha (25-sep-2026).** Manifiesto, iconos, service worker y dos arneses de prueba
  nuevos. Las tasas **no** entran a la caché, y eso está comprobado ejecutando el service worker,
  no solo leyéndolo. Ver "PWA".
- ⬜ **Pendiente: la API.** Ver "API (pendiente)". Ya no la bloquea nada.
- ✅ Página de autor completa: nombre, bio, correo y enlace al repositorio. El nombre y la bio son
  texto propio de Luis, no inventado: **no reescribirlo**.
- ✅ **Publicado en GitHub**: https://github.com/LuisAlbertoPerezDeLaCruz/cuentas-claras (público).
- ⬜ El nombre "Cuentas Claras" es una propuesta. Alternativas barajadas: *Cuadre*, *Al Día VE*.
  Cambiarlo es barato: vive en `web/assets/js/marco.js` (constantes `NOMBRE` y `NOMBRE_ACENTO`)
  y en los `<title>` de cada página.

## Estructura

```
aws/
├── CLAUDE.md
├── web/                        ← esto es lo que se sube al bucket
│   ├── index.html              ← tasas del día + accesos
│   ├── conversor/  iva-igtf/  feriados/  dividir-cuenta/  cuotas/  autor/
│   ├── 404.html
│   ├── manifest.webmanifest    ← manifiesto de la PWA
│   ├── sw.js                   ← service worker (va DENTRO de la subruta, ver "PWA")
│   └── assets/{css/base.css, js/*.js, data/feriados-extra.json, iconos/*}
└── infra/
    ├── template.yaml           ← CloudFormation
    ├── probar-rutas.js         ← comprueba las rutas del sitio (node, sin servidor)
    ├── probar-funcion-rutas.js ← pruebas de la función del borde (node, sin desplegar)
    ├── probar-pwa.js           ← manifiesto, armazón y versión del service worker
    ├── probar-sw.js            ← ejecuta el service worker en Node y dispara sus manejadores
    ├── generar-iconos.sh       ← regenera los PNG de los iconos desde el SVG (necesita rsvg-convert)
    └── DEPLOY.md               ← guía de despliegue paso a paso
```

Sin paso de compilación y sin dependencias: HTML, CSS y JS planos. Una página por herramienta
(mejor para buscadores). `marco.js` inyecta cabecera y pie en todas para no repetir la navegación.
Los módulos se exponen como globales (`window.Formato`, `window.Tasas`) en vez de módulos ES, para
no depender de que S3 sirva el tipo MIME correcto.

**Las rutas internas son relativas** (`conversor/`, `assets/...`), resueltas contra el
`<base href="/cuentas-claras/">` que lleva el `<head>` de cada página. Nunca poner una barra
inicial: sacaría la ruta de la aplicación. Ver "Servir bajo una subruta".

## Las herramientas

Todas cuelgan de `/cuentas-claras/`:

| Ruta | Qué hace |
|---|---|
| `/conversor/` | USD ⇄ Bs (los dos sentidos) por tasa BCV, Binance, promedio BCV-euro y tasa euro |
| `/iva-igtf/` | IVA 16 % e IGTF 3 %, en modo directo e inverso, en Bs y USD |
| `/feriados/` | Próximo feriado, lista anual y días hábiles entre dos fechas |
| `/dividir-cuenta/` | Reparto con propina, en partes iguales o por consumo |
| `/cuotas/` | Contado vs cuotas (interés implícito) y cuota de préstamo francés |
| `/autor/` | Perfil, diagrama de arquitectura y enlaces |

## Fuentes de datos

⚠️ **No se consulta `bcv.org.ve` directamente, y no es un descuido.** El sitio es estático: las
peticiones salen del navegador del visitante y el BCV no envía cabeceras CORS. Para leerlo de
primera mano haría falta un backend propio (Lambda + API Gateway), y dejaría de ser un sitio
puramente estático.

| Tasa | Endpoint | Campo |
|---|---|---|
| Dólar BCV | `https://ve.dolarapi.com/v1/dolares/oficial` | `promedio`, `fechaActualizacion` |
| Euro BCV | `https://ve.dolarapi.com/v1/euros/oficial` | `promedio`, `fechaActualizacion` |
| Binance | `https://criptoya.com/api/binancep2p/usdt/ves/1` | `totalAsk`, `time` |

**Respaldo** (las tres en una llamada, también con CORS `*`):
`https://raw.githubusercontent.com/JCZR2000/ComercioPrecioAPI/main/tasas_cambio.json` →
`dolar`, `euro`, `usdt`. Solo rellena las que hayan fallado.

### Desfase de "fecha valor" (no es un bug)

El BCV publica por la tarde la tasa con **fecha valor del siguiente día hábil**. Si abres
bcv.org.ve al final de la tarde verás un número distinto al de la página: el BCV ya muestra el de
mañana y las APIs sirven el vigente hoy. Confirmado el 23-sep a las 4:28 p. m. (bcv.org.ve daba
854,4637 con fecha valor 24-sep mientras la API seguía en 853,4993) y confirmado de nuevo el 24-sep
por la mañana, cuando la API ya servía 854,4637.

Por eso las tarjetas del BCV muestran **"Fecha valor: DD/MM/AAAA"** sin hora y solo Binance lleva
hora. La fecha se formatea con regex sobre el texto ISO, **sin pasar por `Date`**, para que el huso
horario no la corra un día.

## Decisiones y trampas encontradas

- **Los feriados NO vienen de una API.** Se calculan en `web/assets/js/feriados.js` a partir de la
  Ley de Fiestas Nacionales y el artículo 184 de la LOTTT, derivando Carnaval y Semana Santa del
  Domingo de Pascua (algoritmo de Meeus, verificado contra 2024-2027). Se probó `date.nager.at`:
  **no trae Jueves ni Viernes Santo** y en cambio lista efemérides que no son días no laborables
  (Día de las Madres, Día del Periodista), lo que daría días hábiles mal contados en ambos
  sentidos. `assets/data/feriados-extra.json` permite añadir feriados decretados o regionales sin
  tocar código.
- **En `/iva-igtf/` la moneda manda sobre el IGTF.** El selector es "Me pagan en", no una
  preferencia de visualización: el IGTF grava solo pagos en moneda distinta al bolívar, así que al
  elegir bolívares la casilla se apaga, se bloquea y la fila muestra "No aplica". La casilla sigue
  existiendo para quien cobra en divisas pero está exento. La preferencia del usuario se guarda en
  `igtfDeseado` porque al volver de bolívares a divisas hay que devolver la casilla como él la
  dejó; forzarla a encendida o apagada da resultados incorrectos sin que se note.
- **Los campos de dinero son `type="text"`, no `type="number"`.** Un `input[type=number]` no admite
  separadores de miles: el navegador considera "1.250.000" un valor inválido y lo descarta. Por eso
  existe `web/assets/js/campo-monto.js`, que formatea al escribir (1.250.000 y, al salir del campo,
  1.250.000,00) y restaura la posición del cursor. **Esos campos nunca deben leerse con
  `parseFloat` ni con `Formato.aNumeroPositivo`**: `parseFloat("1.250.000")` devuelve `1,25`. Se
  leen siempre con `CampoMonto.valor(input)`. Los campos que no son dinero (personas, número de
  cuotas, plazos y porcentajes) siguen siendo `type="number"` y se leen como antes.
- **`[hidden]` no basta.** Los componentes fijan su propio `display`, que le gana al atributo. En
  `base.css` hay una regla `[hidden] { display: none !important; }`; sin ella, ocultar campos desde
  JavaScript no surte efecto.
- **No poner un `id` en un `<dd>` que ya contiene un `<span>`** con otro `id`: al asignar
  `textContent` se destruye el hijo y el segundo `id` queda en `null`. Pasó en `/cuotas/` y el
  síntoma fue silencioso (el número salía bien, el texto secundario nunca aparecía).
- **Solo herramientas, sin backend**, por decisión de Luis. Consecuencia asumida: el sitio
  demuestra *operación* en AWS, no desarrollo de servicios. Si algún día quiere mostrar backend, la
  pieza perfilada es una **lista de precios para comercios** (el comerciante carga productos en USD
  y obtiene un enlace público con los precios en Bs actualizados solos), que no sufre el arranque
  en frío de un mapa de precios comunitario.

## Servir bajo una subruta

**Resuelto el 25-sep-2026.** El sitio vive en `https://lapfreelance56.online/cuentas-claras/`, no
en la raíz del dominio. Se escribió al revés y se rehízo antes del primer despliegue. Así quedaron
las tres decisiones:

**1. Cómo se monta en AWS: prefijo en el bucket, sin *Origin Path*.** Las claves del bucket cuelgan
de `cuentas-claras/`, así que la ruta que pide el navegador y la clave en S3 son la misma. El
`aws s3 sync` **tiene que ir al prefijo** (`s3://BUCKET/cuentas-claras`); a la raíz del bucket deja
todo el sitio en 404. La salida `DestinoSync` de la pila ya lo trae puesto.

⚠️ *Origin Path* haría lo contrario de lo que hace falta: añade el prefijo a una URL que no lo
lleva. Y de cualquier forma **no arregla las rutas del HTML**, que es el problema de verdad.
Ventaja del prefijo: la raíz del dominio queda libre y otro proyecto puede vivir en `/otra-cosa/`
en el mismo bucket y la misma distribución.

**2. Cómo se arreglaron las rutas del HTML: `<base href>` y rutas relativas.** Cada página lleva
`<base href="/cuentas-claras/">` justo después del `<meta charset>` — antes de cualquier ruta, o el
navegador ya habría empezado a pedir el CSS. Es la **única** línea que sabe cuál es la subruta (ocho
copias, una por página); todo lo demás es relativo. `marco.js` no la repite: la lee de
`document.baseURI` y la expone como `Marco.BASE`.

Trampas de este camino, todas ya resueltas:
- **`marco.js` compara rutas.** `PAGINAS` guarda rutas relativas y `location.pathname` es absoluta:
  hay que resolver las primeras con `new URL(ruta, document.baseURI)` antes de comparar, o la barra
  nunca marca la página activa.
- **`fetch` con ruta relativa sí respeta el `<base>`** (se resuelve contra `document.baseURI`). Por
  eso `feriados.js` pide `assets/data/feriados-extra.json` sin barra inicial.
- **La CSP no puede apretar `base-uri` a `'none'`.** Con `'none'` el navegador ignora el `<base>` y
  todas las rutas relativas se resuelven mal, **sin error visible en la página**. Tiene que quedar
  en `'self'`.
- **Nada de enlaces de fragmento sueltos** (`href="#algo"`, `href="#"`): con un `<base>` presente
  resuelven contra la base, no contra la página actual, y navegan fuera. Hoy no hay ninguno; si se
  añade uno, tiene que llevar la ruta delante.
- **El enlace a la portada es `href="./"`**, no `href="/"`.

**3. La función del borde: rehecha, con 17 casos de prueba.** `infra/probar-funcion-rutas.js`
extrae el código **de la propia plantilla** (no lo copia) y lo corre en Node, así que no puede
quedarse validando una versión vieja. Hace tres cosas:
- `/` y `/index.html` → **302** a `/cuentas-claras/`. Es 302 y no 301 a propósito: el día que la
  raíz tenga su propia página, un 301 se habría quedado cacheado en los navegadores de los
  visitantes. Ese bloque hay que **quitarlo** cuando la raíz tenga contenido.
- Sin barra final y sin extensión → **301** a la forma canónica con barra, en vez de reescribir, para
  no servir la misma página en dos URLs.
- Con barra final → reescribe a `index.html`, que es lo que S3 con OAC no resuelve solo.

Se quitó `DefaultRootObject` de la plantilla: en la raíz del bucket no hay ningún `index.html`, y su
sustitución ocurre **antes** de la función del borde, lo que volvía confuso de qué ruta parte la
redirección. La función cubre todos los índices, ese incluido.

**Pendiente de la subruta, del lado de AWS:** certificado ACM **en us-east-1** (lo exige CloudFront,
no sirve en otra región) y registros en Route 53 — el único costo fijo real, ~$0,50/mes.

⚠️ **El dominio está en GoDaddy, no en Route 53** (comprobado el 25-sep-2026: los nameservers son
`ns63/ns64.domaincontrol.com`). Hay que mover el DNS a Route 53 antes de pedir el certificado,
porque el sitio va en el dominio **raíz** y un dominio raíz **no admite CNAME**: lo único que puede
apuntarlo a CloudFront es un registro **A de tipo alias**, que sólo existe dentro de Route 53. El
dominio está limpio (sin MX ni TXT), así que mover el DNS no rompe nada. Pasos en `DEPLOY.md` 5.1
a 5.6.

## PWA

**Hecha el 25-sep-2026.** El sitio se instala y funciona sin conexión. Piezas:
`web/manifest.webmanifest`, `web/sw.js`, `web/assets/js/pwa.js` (el registro) y
`web/assets/iconos/`.

### Las tasas no entran a la caché, y no es una lista de dominios

Es la regla que manda sobre el resto. Una tasa vieja servida desde la caché **no se ve como un
error**: se ve como el número de hoy, y el visitante calcula un precio equivocado sin enterarse.

La garantía no depende de acordarse de excluir `ve.dolarapi.com` y compañía. `sw.js` solo llama a
`respondWith()` para peticiones **GET, de este origen y dentro de la subruta**; a todo lo demás no
le hace nada, y el navegador lo manda a la red como si no hubiera service worker. Agregar mañana
una cuarta fuente de tasas no obliga a tocar nada aquí.

`probar-sw.js` lo comprueba **ejecutando** el service worker, con y sin conexión. Incluye a
propósito un caso que parece rebuscado y no lo es: `https://otro-dominio.com/cuentas-claras/…`. Es
el único que distingue "filtra por origen" de "filtra por ruta", y sin él la prueba pasaba igual
con el guardia de origen borrado.

### Decisiones y trampas

- **`sw.js` va dentro de la subruta**, no en la raíz del bucket: un service worker no puede
  gobernar rutas por encima de aquella desde la que se sirve. Servido desde la raíz no podría
  limitarse a `/cuentas-claras/`; servido desde ahí, su alcance es exactamente el sitio.
- **Ni `sw.js` ni el manifiesto repiten la subruta.** `sw.js` la deduce de su propia ubicación
  (`new URL('./', self.location.href)`), igual que `Marco.BASE` la deduce del `<base href>`. En el
  manifiesto, `start_url` y `scope` son `"./"`, que el navegador resuelve contra la URL del
  manifiesto. El `<base href>` sigue siendo la única línea que sabe cuál es la subruta.
- **El manifiesto NO lleva `id`.** A diferencia del resto de sus campos, `id` se resuelve contra el
  **origen**, no contra la URL del manifiesto: un `"./"` ahí apuntaría a la raíz del dominio. Sin
  `id`, vale `start_url`, que ya es correcto. `probar-pwa.js` falla si alguien lo agrega.
- **Las páginas se guardan con barra final** (`'conversor/'`), que es la URL que pide el navegador
  al navegar, no `'conversor/index.html'`, que es la clave del bucket.
- **Páginas: primero la red. Recursos: primero la caché.** Así un despliegue se ve en la visita
  siguiente en vez de dos visitas después, y el CSS y el JavaScript siguen siendo instantáneos.
- **`VERSION` de `sw.js` lleva un hash del contenido del armazón.** Sin eso, cambiar el CSS y
  desplegar deja a quien tenga la PWA instalada con el CSS anterior: la página carga perfecta y
  muestra lo de antes. `node infra/probar-pwa.js` falla si el hash no corresponde, y
  `--sellar` lo actualiza. **Hay que sellarlo antes de cada despliegue.**
- **`skipWaiting()` + `clients.claim()`** se usan a pesar de la advertencia habitual, porque aquí
  no hay piezas que se pidan después: cada página carga todo su JavaScript de una vez y con
  nombres fijos, así que no puede quedar una mezcla de versión vieja y nueva.
- **Los iconos son arcos, no `<text>`.** Un `<text>` se renderiza con la tipografía de cada
  máquina, así que el icono saldría distinto en cada conversión a PNG. Los PNG están comiteados:
  no hay paso de compilación y el despliegue es un `aws s3 sync` de `web/`.
- **El manifiesto necesita su tipo MIME.** `.webmanifest` no lo conoce ni Python ni el
  `aws s3 sync`; servido como `application/octet-stream` el navegador lo descarta y el sitio deja
  de poder instalarse, **sin error visible**. Por eso `servir.sh` lo registra a mano y `DEPLOY.md`
  lo sube con `aws s3 cp --content-type`.
- **`sw.js` se sube con `Cache-Control: no-cache`.** Un service worker cacheado es un sitio
  congelado: la única copia que puede reemplazarlo es la que no se deja cachear.
- **CSP**: se agregaron `manifest-src 'self'` y `worker-src 'self'`. Heredarían de
  `default-src 'self'`, pero van escritos para que cerrar `default-src` algún día no rompa la PWA
  en silencio.

## API (pendiente)

Alcance pedido por Luis el 25-sep-2026. **Revierte la decisión de "sin backend"** que está
documentada en "Decisiones y trampas encontradas": ya no es una restricción vigente. La que sí
sigue en pie es *sin EC2 ni servidores que administrar* y costo de centavos — o sea API Gateway +
Lambda, nunca una instancia. El motivo es explícito: su curso de AWS cubre cómo incluir APIs, y
quiere aprenderlo y demostrarlo.

Mejor primer candidato: **una Lambda que lea `bcv.org.ve` del lado servidor**. Resuelve el problema
de CORS documentado en "Fuentes de datos" — hoy no se consulta el BCV de primera mano justamente
porque las peticiones salen del navegador del visitante. Es un problema real ya diagnosticado, no
un ejercicio inventado. La *lista de precios para comercios* sigue siendo buena idea, pero es
bastante más grande.

Trampas a revisar al planificar:

- **API + CSP**: hay que **agregar el dominio de la API a `connect-src`** en la plantilla, o dejará
  de cargar sin error visible en la página.
- **API + service worker**: si la API se sirve desde otro dominio, el service worker ni la ve, que
  es lo correcto. Pero si algún día se pone **detrás del mismo dominio** (por ejemplo
  `/api/` en la misma distribución de CloudFront), pasaría a ser del mismo origen. Seguiría fuera
  de la subruta `/cuentas-claras/`, así que `sw.js` tampoco la interceptaría — pero conviene
  agregar el caso a `probar-sw.js` antes de moverla, no después.

## Arquitectura AWS (por desplegar)

S3 privado → CloudFront con Origin Access Control → visitante. Más una CloudFront Function que
reescribe `/ruta/` a `/ruta/index.html`: **es obligatoria**, porque con bucket privado + OAC S3 deja
de resolver los documentos índice de subcarpeta y todo devolvería 403.

La CSP de la plantilla lista en `connect-src` exactamente `ve.dolarapi.com`, `criptoya.com` y
`raw.githubusercontent.com`. **Si se añade una herramienta con otra fuente de datos hay que
agregarla ahí**, o dejará de cargar sin error visible en la página. También lleva
`manifest-src 'self'` y `worker-src 'self'`, que son el manifiesto y el service worker de la PWA.

El despliegue **no es un `aws s3 sync` a secas**: `sw.js` y `manifest.webmanifest` se suben aparte,
con su tipo MIME y su `Cache-Control`. Ver el paso 3 de `DEPLOY.md`.

Costo: CloudFront (1 TB y 10 M peticiones), CloudFront Functions (2 M) y ACM son *always free* y no
expiran. Solo S3 cobra centavos, más $0,50/mes de Route 53 si usa dominio propio.

## Probar localmente

```bash
./servir.sh                          # http://127.0.0.1:8765/cuentas-claras/
node infra/probar-rutas.js           # las rutas resuelven dentro de la subruta y existen
node infra/probar-funcion-rutas.js   # los 19 casos de la función del borde
node infra/probar-pwa.js             # manifiesto, armazón y versión del service worker
node infra/probar-sw.js              # ejecuta el service worker y dispara sus manejadores
```

Las cuatro corren **sin servidor y sin navegador**, y se comprobó que fallan de verdad saboteando a
propósito: una barra inicial suelta, un `<base href>` que se separa de `RutaBase`, un `<base>`
colocado después de la primera ruta, la función del borde vuelta agnóstica de la subruta, un
`start_url` absoluto, un icono que miente sobre su tamaño, un archivo nuevo en `web/` que no entró
al armazón, una página sin registrar el service worker, el CSS cambiado sin sellar `VERSION`, y el
guardia de origen del service worker borrado.

⚠️ Ese último sabotaje **no fallaba** en la primera versión de `probar-sw.js`, porque ninguna URL
de tasas tiene una ruta que empiece por `/cuentas-claras/`: el filtro por ruta la tapaba. Hubo que
agregar el caso `https://otro-dominio.com/cuentas-claras/tasas.json`. Vale la pena recordarlo: una
prueba que pasa no dice nada hasta que se comprueba que puede fallar.
`probar-rutas.js` además lee `RutaBase` **de la plantilla** y lo contrasta con los ocho `<base
href>`, que es el desajuste que desplegaría el sitio roto sin que nada se queje antes.

`servir.sh` **sirve bajo la misma subruta que producción** y se comporta como CloudFront: la raíz
redirige a la subruta y lo que no existe cae en la 404 del sitio. Servirlo en la raíz haría que las
pruebas locales no representaran el destino, que es justo el error que costó rehacer el sitio.

⚠️ **No abrir `web/index.html` con doble clic.** Bajo `file://` el `<base href="/cuentas-claras/">`
apunta a la raíz del disco: la página carga sin estilos ni JavaScript y parece rota. Ya pasó una vez.

Si la extensión de Chrome no está disponible, la lógica se puede probar en Node con un DOM
simulado: basta con un `getElementById` que devuelva objetos con `value`, `textContent`,
`addEventListener` y `setSelectionRange`, cargar los módulos con `eval` y disparar los manejadores
a mano. Así se verificaron el conversor, IVA/IGTF, dividir y cuotas. **No cubre** lo que depende
del DOM real: el renderizado y los campos dinámicos del modo "por consumo" de dividir la cuenta.

Para las **rutas** el arnés de Node alcanza de sobra, y de hecho comprueba más que mirar la página:
`new URL(relativa, base)` en Node aplica el mismo algoritmo WHATWG que el navegador usa para
resolver el `<base href>`. Así se verificó que las 18 rutas únicas de las ocho páginas resuelven
dentro de la subruta y devuelven 200, y que `marco.js` marca la página activa en las seis
herramientas (más `conversor/index.html`, que tiene que contar como la misma que `conversor/`).

Casos verificados a mano que deben seguir dando lo mismo:

| Herramienta | Entrada | Resultado |
|---|---|---|
| IVA/IGTF | base $100, IVA 16 %, con IGTF | 16,00 → 116,00 → 3,48 → **119,48** |
| IVA/IGTF inverso | total $119,48 | base **100,00** |
| IVA en bolívares | base 100 Bs, IVA 16 % | IGTF **No aplica**, total **116,00 Bs** |
| Dividir | $50, 4 personas, 10 % | **13,75** c/u |
| Dividir por consumo | 30 y 20, 10 % | **33,00** y **22,00** |
| Cuotas | contado 100, 6 × 20 | sobrecosto 20 (20 %), **5,47 % mensual** = 89,51 % anual |
| Préstamo | 1.000, 60 % anual, 12 meses | cuota **112,83**, total 1.353,90, intereses 353,90 |
| Días hábiles | 24/09/2026 → 24/10/2026 | 31 totales, 9 finde, 1 feriado, **21 hábiles** |
| Conversor inverso | 100.000 Bs con BCV 855,6625 | **$116,87** (ida y vuelta devuelve el monto original) |
| Formato de entrada | teclear `1250000` | se ve **1.250.000** y, al salir del campo, **1.250.000,00** |

## Git y GitHub

Remoto: `git@github.com:LuisAlbertoPerezDeLaCruz/cuentas-claras.git` (SSH).

⚠️ **No usar los alias de `~/.ssh/config`** (`github.com-LuisAlbertoPerezDeLaCruz`): esa clave
quedó obsoleta y GitHub la rechaza. La que autentica es `~/.ssh/id_rsa`, que es la que usa el host
`github.com` a secas. Luis tiene tres cuentas de GitHub configuradas, de ahí los alias.

## Próximos pasos

1. **Desplegar**: seguir `infra/DEPLOY.md`. En marcha desde el 25-sep-2026. El AWS CLI ya está
   instalado (2.37.3, por Homebrew); falta `aws configure`, que lo hace Luis. El dominio hay que
   moverlo de GoDaddy a Route 53 primero, ver arriba.
   Al terminar, correr las comprobaciones de "Comprobar que quedó bien" de `DEPLOY.md`: el fallo
   de la subruta no da error, solo un sitio sin estilos, y el de la PWA tampoco.
2. **Mirar la PWA en Chrome.** La lógica está probada en Node, pero falta verla en
   DevTools > Application: que el manifiesto no dé advertencias, que el *scope* del service worker
   sea `/cuentas-claras/` y que en modo *Offline* las tarjetas de tasas digan "No disponible".
   Queda pendiente porque la extensión de Chrome no estaba conectada el 25-sep-2026.
3. **API** en API Gateway + Lambda; empezar por leer el BCV del lado servidor. Ver "API
   (pendiente)".
4. El nombre "Cuentas Claras" quedó de hecho fijado por la subruta y la URL del repositorio.
   Cambiarlo ya no es gratis: habría que tocar el código, el enlace de `/autor/`, la URL pública y
   el repositorio.
