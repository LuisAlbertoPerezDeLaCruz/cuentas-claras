# Cuentas Claras

Herramientas sencillas para las cuentas del día a día en Venezuela: convertir a la tasa del día,
calcular IVA e IGTF, saber si hay banco el lunes, dividir una cuenta y comparar el precio de
contado contra las cuotas.

Sitio estático, sin dependencias ni paso de compilación, servido desde un bucket S3 **privado** a
través de CloudFront.

## Herramientas

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
- **CloudFront Function**: resuelve `/conversor/` → `/conversor/index.html`, que S3 deja de hacer
  al servirse por OAC.
- **Response Headers Policy**: HSTS, CSP, `X-Content-Type-Options` y `Referrer-Policy`.
- **CloudFormation**: toda la infraestructura versionada en `infra/template.yaml`.

Sin EC2 y sin servidores que administrar. El costo mensual es de centavos: las capas gratuitas de
CloudFront (1 TB y 10 M peticiones) y CloudFront Functions (2 M invocaciones) no expiran.

## Estructura

```
web/      el sitio (esto es lo que se sube al bucket)
infra/    plantilla de CloudFormation y guía de despliegue
```

## Probar localmente

```bash
./servir.sh
# abre http://127.0.0.1:8765/
```

No abras `web/index.html` con doble clic: las rutas son absolutas (`/assets/...`) porque el sitio
vive en la raíz del dominio, y bajo `file://` esa barra apunta a la raíz del disco, así que no
cargan ni el CSS ni el JavaScript.

## Desplegar

Ver [`infra/DEPLOY.md`](infra/DEPLOY.md).

## Nota sobre las tasas

Las tasas provienen de APIs públicas de terceros y son **referenciales**. No se consulta
`bcv.org.ve` directamente porque no envía cabeceras CORS: al ser un sitio estático, las peticiones
salen del navegador del visitante. El BCV publica por la tarde la tasa con *fecha valor* del
siguiente día hábil, así que puede diferir de la que el sitio muestra como vigente.
