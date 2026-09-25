# Cuentas Claras

Herramientas sencillas para las cuentas del día a día en Venezuela: convertir a la tasa del día,
calcular IVA e IGTF, saber si hay banco el lunes, dividir una cuenta y comparar el precio de
contado contra las cuotas.

Sitio estático, sin dependencias ni paso de compilación, servido desde un bucket S3 **privado** a
través de CloudFront, en **<https://lapfreelance56.online/cuentas-claras/>**. Es además una
**PWA**: se instala en el teléfono y funciona sin conexión, salvo las tasas, que por definición
nunca se guardan.

## Herramientas

Todas cuelgan de `/cuentas-claras/`:

| Ruta | Qué hace |
|---|---|
| `/conversor/` | USD ⇄ Bs (los dos sentidos) por tasa BCV, Binance, promedio BCV-euro y tasa euro |
| `/iva-igtf/` | IVA 16 % e IGTF 3 %, en modo directo e inverso, en Bs y USD |
| `/feriados/` | Próximo feriado, lista anual y días hábiles entre dos fechas |
| `/dividir-cuenta/` | Reparto con propina, en partes iguales o por consumo |
| `/cuotas/` | Contado vs cuotas (interés implícito) y cuota de préstamo francés |

## Arquitectura

```
Navegador ──▶ CloudFront (HTTPS + función en el borde) ──▶ Bucket S3 privado (OAC)
    └──────▶ APIs públicas de tasas (BCV, Binance)
```

- **S3 privado**: el bucket no acepta tráfico público directo.
- **Origin Access Control**: única vía de acceso al bucket, restringida a esta distribución.
- **CloudFront Function**: resuelve `…/conversor/` → `…/conversor/index.html`, que S3 deja de hacer
  al servirse por OAC, y manda la raíz del dominio a la subruta del sitio.
- **Response Headers Policy**: HSTS, CSP, `X-Content-Type-Options` y `Referrer-Policy`.
- **CloudFormation**: toda la infraestructura versionada en `infra/template.yaml`.
- **Service worker**: guarda el sitio entero para usarlo sin conexión, y **nunca las tasas**. La
  garantía no es una lista de dominios: solo intercepta peticiones del propio origen, así que las
  APIs de tasas salen a la red siempre. Una tasa vieja servida desde la caché no parecería un
  error, parecería el número de hoy.

Sin EC2 y sin servidores que administrar. El costo mensual es de centavos: las capas gratuitas de
CloudFront (1 TB y 10 M peticiones) y CloudFront Functions (2 M invocaciones) no expiran.

## Estructura

```
web/      el sitio (esto es lo que se sube al bucket, bajo el prefijo cuentas-claras/)
infra/    plantilla de CloudFormation, guía de despliegue y pruebas de la función del borde
```

El sitio vive en una **subruta** del dominio, no en la raíz. Cada página lo declara con un
`<base href="/cuentas-claras/">` en el `<head>` y todas sus rutas internas son relativas, así que
esa línea es lo único que hay que tocar para moverlo de sitio.

## Probar localmente

```bash
./servir.sh
# abre http://127.0.0.1:8765/cuentas-claras/
```

Sirve bajo la misma subruta que producción, y como CloudFront: la raíz redirige a la subruta y lo
demás cae en la 404 del sitio.

No abras `web/index.html` con doble clic: el `<base href="/cuentas-claras/">` apunta, bajo el
protocolo `file://`, a la raíz del disco, así que no cargan ni el CSS ni el JavaScript y la página
parece rota.

Las rutas y la función del borde se prueban sin servidor ni navegador:

```bash
node infra/probar-rutas.js           # las rutas resuelven dentro de la subruta y existen
node infra/probar-funcion-rutas.js   # los casos de la función del borde
node infra/probar-pwa.js             # el manifiesto, el armazón y la versión del service worker
node infra/probar-sw.js              # carga el service worker y dispara sus manejadores
```

`probar-sw.js` ejecuta el service worker de verdad en Node, con un entorno simulado: así se puede
forzar el caso "sin conexión", que en el navegador es incómodo de provocar, y comprobar en cada
modo que las tasas nunca se interceptan.

Al cambiar cualquier archivo de `web/` hay que volver a sellar el service worker, o quien tenga la
PWA instalada seguirá viendo la versión anterior:

```bash
node infra/probar-pwa.js --sellar
```

## Desplegar

Ver [`infra/DEPLOY.md`](infra/DEPLOY.md).

## Nota sobre las tasas

Las tasas provienen de APIs públicas de terceros y son **referenciales**. No se consulta
`bcv.org.ve` directamente porque no envía cabeceras CORS: al ser un sitio estático, las peticiones
salen del navegador del visitante. El BCV publica por la tarde la tasa con *fecha valor* del
siguiente día hábil, así que puede diferir de la que el sitio muestra como vigente.
