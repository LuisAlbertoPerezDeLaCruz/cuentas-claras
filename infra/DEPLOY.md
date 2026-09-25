# Desplegar Cuentas Claras en AWS

Guía para publicar el sitio. La plantilla crea un bucket S3 **privado** servido a través de
CloudFront: el bucket nunca queda expuesto a internet, que es la diferencia entre "subí unos
archivos a S3" y un montaje serio.

Todo lo que sigue lo ejecutas tú en tu cuenta.

## ⚠️ El sitio vive en una subruta, no en la raíz

El destino es **`https://lapfreelance56.online/cuentas-claras/`**. Eso cambia tres cosas respecto
a un sitio normal en la raíz del dominio, y las tres tienen que coincidir entre sí:

`node infra/probar-rutas.js` comprueba que las dos primeras coincidan antes de desplegar.

| Pieza | Valor | Si no coincide |
|---|---|---|
| El `<base href>` del `<head>` de cada página de `web/` | `/cuentas-claras/` | El sitio carga sin CSS ni JavaScript |
| El parámetro `RutaBase` de la plantilla | `cuentas-claras` | La 404 y la redirección de la raíz apuntan mal |
| El prefijo del `aws s3 sync` | `s3://BUCKET/cuentas-claras` | Todo el sitio da 404 |

**No se usa *Origin Path* de CloudFront.** La subruta es un prefijo de las claves del bucket, así
que la ruta que pide el navegador y la clave en S3 son la misma: `/cuentas-claras/conversor/` →
`cuentas-claras/conversor/index.html`. Un Origin Path haría lo contrario (añadir el prefijo a una
URL que no lo lleva) y además no arregla las rutas del HTML, que es el problema de verdad.

Ventaja de montarlo así: la raíz del dominio queda libre para lo que pongas después, y otro
proyecto puede vivir en `/otra-cosa/` en el mismo bucket y la misma distribución.

## Lo que se crea

| Recurso | Para qué |
|---|---|
| Bucket S3 privado | Guarda los archivos del sitio |
| CloudFront | CDN, HTTPS y punto de entrada público |
| Origin Access Control (OAC) | Única vía de acceso al bucket |
| CloudFront Function | Resuelve `…/conversor/` → `…/conversor/index.html` y manda la raíz del dominio a `/cuentas-claras/` |
| Response Headers Policy | HSTS, CSP y demás cabeceras de seguridad |

## Requisitos

- AWS CLI configurada (`aws configure`) con permisos sobre S3, CloudFront y CloudFormation.
- Opcional: AWS SAM CLI, si prefieres `sam deploy`. La plantilla es CloudFormation puro, así que
  funciona igual con `aws cloudformation`.

## 1. Validar la plantilla

```bash
aws cloudformation validate-template --template-body file://infra/template.yaml
```

Validar la plantilla **no** comprueba que las rutas estén bien. Para eso hay dos pruebas que
corren sin desplegar nada, sin servidor y sin navegador (leen el código y los valores de la propia
plantilla, así que no se pueden quedar desfasadas):

```bash
node infra/probar-rutas.js           # las rutas resuelven dentro de la subruta y existen
node infra/probar-funcion-rutas.js   # los casos de la función del borde
```

`probar-rutas.js` contrasta el parámetro `RutaBase` contra el `<base href>` de las ocho páginas: es
el desajuste que deja el sitio sin estilos y que ningún validador detecta.

## 2. Crear la pila

Sin dominio propio (empieza por aquí, funciona de inmediato):

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name cuentas-claras \
  --parameter-overrides NombreProyecto=cuentas-claras
```

La primera vez CloudFront tarda **entre 5 y 15 minutos** en desplegarse. Es normal.

Al terminar, pide las salidas:

```bash
aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query 'Stacks[0].Outputs' --output table
```

Guarda `DestinoSync`, `IdDistribucion` y `UrlCloudFront`.

## 3. Subir el sitio

⚠️ **Al prefijo, no a la raíz del bucket.** Subir `web/` a la raíz deja el sitio entero en 404,
porque CloudFront busca las claves bajo `cuentas-claras/`. La salida `DestinoSync` ya trae el
prefijo puesto, así que conviene usarla en vez de escribirlo a mano:

```bash
DESTINO=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='DestinoSync'].OutputValue" --output text)

aws s3 sync web/ "$DESTINO" --delete
```

`--delete` borra lo que ya no existe en `web/`, para que no queden archivos viejos sirviéndose.
Acotado al prefijo: no toca nada que tengas fuera de `cuentas-claras/` en el mismo bucket.

## 4. Invalidar la caché

CloudFront cachea de forma agresiva: sin este paso seguirás viendo la versión anterior.

```bash
DIST=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='IdDistribucion'].OutputValue" --output text)

aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

Las primeras 1.000 rutas invalidadas al mes son gratis; después cuestan ~$0,005 cada una.
Invalidar `/*` cuenta como **una sola** ruta.

## 5. Dominio propio

El dominio ya está registrado: **`lapfreelance56.online`**.

1. Pide el certificado **en la región `us-east-1`**, sin excepción: CloudFront no acepta
   certificados de ninguna otra región, y es el error que más tiempo hace perder aquí.

   ```bash
   aws acm request-certificate --region us-east-1 \
     --domain-name lapfreelance56.online --validation-method DNS
   ```

2. Valida el certificado creando el registro CNAME que indique ACM, y espera a que quede
   `ISSUED`.
3. Vuelve a desplegar pasando el dominio y el ARN:

   ```bash
   aws cloudformation deploy \
     --template-file infra/template.yaml \
     --stack-name cuentas-claras \
     --parameter-overrides \
       NombreProyecto=cuentas-claras \
       RutaBase=cuentas-claras \
       NombreDominio=lapfreelance56.online \
       CertificadoArn=arn:aws:acm:us-east-1:TU_CUENTA:certificate/TU_ID
   ```

4. Apunta el dominio a CloudFront. En Route 53, un registro **A de tipo alias** hacia la
   distribución (no un CNAME: el dominio raíz no admite CNAME). Fuera de Route 53, usa el valor
   de la salida `DominioParaDNS`.

## Actualizar el sitio después

Cada vez que cambies algo en `web/`:

```bash
aws s3 sync web/ "$DESTINO" --delete
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

## Comprobar que quedó bien

El fallo típico de la subruta **no da error**: la página carga, pero sin estilos ni JavaScript,
igual que si la abrieras con doble clic. Así que además de mirarla, conviene comprobar los códigos:

```bash
URL=https://lapfreelance56.online

curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' $URL/                       # 302 -> /cuentas-claras/
curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}\n' $URL/cuentas-claras          # 301 -> /cuentas-claras/
curl -s -o /dev/null -w '%{http_code}\n'                    $URL/cuentas-claras/         # 200
curl -s -o /dev/null -w '%{http_code}\n'                    $URL/cuentas-claras/conversor/          # 200
curl -s -o /dev/null -w '%{http_code} %{content_type}\n'    $URL/cuentas-claras/assets/css/base.css # 200 text/css
curl -s -o /dev/null -w '%{http_code}\n'                    $URL/cuentas-claras/no-existe/          # 404
```

Si `base.css` da 404 mientras la página da 200, el sitio está subido a la raíz del bucket en vez
de al prefijo, o el `<base href>` y `RutaBase` no coinciden.

En el navegador, con la consola abierta: no debe haber ni un error, y la cabecera y el pie que
inyecta `marco.js` deben aparecer en las seis páginas con la pestaña actual marcada.

## Costo

| Servicio | Costo |
|---|---|
| CloudFront | **$0** — 1 TB de salida y 10 M de peticiones al mes son *always free* y no expiran |
| CloudFront Functions | **$0** — 2 M de invocaciones gratis al mes |
| S3 | ~$0,02–0,10/mes con este volumen |
| ACM | **$0** |
| Route 53 (solo con dominio propio) | $0,50/mes por zona + ~$12–15/año el dominio |

En la práctica: **centavos al mes**, o alrededor de $1,50/mes con dominio propio.

Conviene igual poner una alarma de facturación en Budgets, por si algún día el tráfico se dispara.

## Si algo falla

| Síntoma | Causa casi siempre |
|---|---|
| **El sitio sin estilos ni JavaScript** | El `<base href>` de las páginas y `RutaBase` no coinciden, o el sitio se subió a la raíz del bucket en vez de al prefijo `cuentas-claras/` |
| 404 en todo el sitio | Falta el prefijo en el `aws s3 sync` (paso 3) |
| La raíz del dominio no redirige | La función del borde no está asociada, o `DefaultRootObject` volvió a la plantilla |
| 403 al abrir `/cuentas-claras/conversor/` | La CloudFront Function no está asociada, o se desplegó sin `AutoPublish` |
| 403 en todo el sitio | La política del bucket no coincide con el ARN de la distribución |
| Una herramienta no carga las tasas | Falta el dominio de esa API en `connect-src` de la CSP |
| Sigo viendo la versión vieja | Falta invalidar la caché (paso 4) |
| CloudFront rechaza el certificado | No está en `us-east-1` |

## Borrar todo

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='NombreBucket'].OutputValue" --output text)

aws s3 rm s3://$BUCKET --recursive
aws cloudformation delete-stack --stack-name cuentas-claras
```

El bucket tiene `DeletionPolicy: Retain`, así que **sobrevive al borrado de la pila**: si quieres
eliminarlo del todo, hazlo a mano después.
