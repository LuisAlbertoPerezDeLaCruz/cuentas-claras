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

## Estado (24-sep-2026)

- ✅ Seis páginas construidas y **verificadas en el navegador**, con los cálculos contrastados a
  mano y la consola limpia.
- ✅ `infra/template.yaml` escrita y validada como YAML; la función de reescritura de rutas
  probada con cinco casos.
- ⬜ **Pendiente: desplegar.** No se ha creado ninguna pila ni bucket todavía.
- ⬜ **Pendiente: rellenar la página de autor** — tiene marcadores `[TU NOMBRE]`, `[TU GITHUB]`,
  `[TU EMAIL O LINKEDIN]` y la bio.
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
│   └── assets/{css/base.css, js/*.js, data/feriados-extra.json}
└── infra/
    ├── template.yaml           ← CloudFormation
    └── DEPLOY.md               ← guía de despliegue paso a paso
```

Sin paso de compilación y sin dependencias: HTML, CSS y JS planos. Una página por herramienta
(mejor para buscadores). `marco.js` inyecta cabecera y pie en todas para no repetir la navegación.
Los módulos se exponen como globales (`window.Formato`, `window.Tasas`) en vez de módulos ES, para
no depender de que S3 sirva el tipo MIME correcto.

**Las rutas internas son absolutas** (`/conversor/`, `/assets/...`) porque el sitio vive en la raíz
del dominio.

## Las herramientas

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

## Arquitectura AWS (por desplegar)

S3 privado → CloudFront con Origin Access Control → visitante. Más una CloudFront Function que
reescribe `/ruta/` a `/ruta/index.html`: **es obligatoria**, porque con bucket privado + OAC S3 deja
de resolver los documentos índice de subcarpeta y todo devolvería 403.

La CSP de la plantilla lista en `connect-src` exactamente `ve.dolarapi.com`, `criptoya.com` y
`raw.githubusercontent.com`. **Si se añade una herramienta con otra fuente de datos hay que
agregarla ahí**, o dejará de cargar sin error visible en la página.

Costo: CloudFront (1 TB y 10 M peticiones), CloudFront Functions (2 M) y ACM son *always free* y no
expiran. Solo S3 cobra centavos, más $0,50/mes de Route 53 si usa dominio propio.

## Probar localmente

```bash
./servir.sh          # http://127.0.0.1:8765/
```

⚠️ **No abrir `web/index.html` con doble clic.** Las rutas son absolutas (`/assets/...`) y bajo
`file://` la barra inicial apunta a la raíz del disco: la página carga sin estilos ni JavaScript y
parece rota. Ya pasó una vez. Las rutas absolutas son las correctas para el destino real, donde el
sitio vive en la raíz del dominio.

Casos verificados a mano que deben seguir dando lo mismo:

| Herramienta | Entrada | Resultado |
|---|---|---|
| IVA/IGTF | base $100, IVA 16 %, con IGTF | 16,00 → 116,00 → 3,48 → **119,48** |
| IVA/IGTF inverso | total $119,48 | base **100,00** |
| Dividir | $50, 4 personas, 10 % | **13,75** c/u |
| Dividir por consumo | 30 y 20, 10 % | **33,00** y **22,00** |
| Cuotas | contado 100, 6 × 20 | sobrecosto 20 (20 %), **5,47 % mensual** = 89,51 % anual |
| Préstamo | 1.000, 60 % anual, 12 meses | cuota **112,83**, total 1.353,90, intereses 353,90 |
| Días hábiles | 24/09/2026 → 24/10/2026 | 31 totales, 9 finde, 1 feriado, **21 hábiles** |
| Conversor inverso | 100.000 Bs con BCV 855,6625 | **$116,87** (ida y vuelta devuelve el monto original) |

## Próximos pasos

1. **Desplegar**: seguir `infra/DEPLOY.md`.
2. Rellenar los marcadores de `/autor/`.
3. Decidir el nombre definitivo y, si aplica, registrar dominio.
4. **Iniciar un repositorio git y publicarlo**: hoy la carpeta no tiene control de versiones, y
   para promocionarse como desarrollador el repositorio con la plantilla de infraestructura vale
   tanto como el sitio.
