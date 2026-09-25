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
node infra/probar-pwa.js             # manifiesto, armazón y versión del service worker
node infra/probar-sw.js              # ejecuta el service worker y dispara sus manejadores
```

`probar-rutas.js` contrasta el parámetro `RutaBase` contra el `<base href>` de las ocho páginas: es
el desajuste que deja el sitio sin estilos y que ningún validador detecta.

`probar-pwa.js` falla si `VERSION` de `sw.js` no corresponde al contenido actual. **Séllalo antes
de subir** con `node infra/probar-pwa.js --sellar`, o quien ya tenga la PWA instalada seguirá
viendo la versión anterior.

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

aws s3 sync web/ "$DESTINO" --delete \
  --exclude "sw.js" --exclude "manifest.webmanifest"

# Las dos piezas de la PWA necesitan cabeceras propias (ver abajo).
aws s3 cp web/sw.js "$DESTINO/sw.js" \
  --cache-control "no-cache" --content-type "text/javascript"

aws s3 cp web/manifest.webmanifest "$DESTINO/manifest.webmanifest" \
  --content-type "application/manifest+json"
```

`--delete` borra lo que ya no existe en `web/`, para que no queden archivos viejos sirviéndose.
Acotado al prefijo: no toca nada que tengas fuera de `cuentas-claras/` en el mismo bucket. Los
`--exclude` se aplican también al destino, así que esos dos archivos no se borran: solo quedan
fuera del `sync` para subirlos aparte.

⚠️ **Por qué esos dos archivos van aparte:**

- **`manifest.webmanifest`**: el `sync` adivina el tipo MIME por la extensión y `.webmanifest` no
  la conoce, así que lo subiría como `application/octet-stream`. El navegador entonces descarta
  el manifiesto y el sitio deja de poder instalarse, **sin ningún error en la página**.
- **`sw.js`**: con `no-cache` el navegador siempre pregunta si hay versión nueva antes de usar la
  que tiene. Un service worker cacheado es un sitio congelado: la única copia que puede
  reemplazarlo es la que no se deja cachear.

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

El dominio **`lapfreelance56.online`** está registrado en **GoDaddy**, y su DNS también lo sirve
GoDaddy (`ns63/ns64.domaincontrol.com`). Hay que mover el DNS a Route 53.

⚠️ **Por qué no basta con dejarlo en GoDaddy.** El sitio va en el dominio **raíz**, y un dominio
raíz **no admite CNAME**: es una regla del DNS, no una limitación de GoDaddy. Lo que sí puede
apuntar la raíz a CloudFront es un **registro A de tipo alias**, y ese tipo de registro sólo
existe dentro de Route 53. Desde GoDaddy la única alternativa sería usar `www` y reenviar la raíz,
que es un salto HTTP por servidores de terceros.

El dominio está limpio (sin MX ni TXT: nada de correo ni verificaciones), así que mover el DNS no
rompe nada.

### 5.1 Crear la zona alojada en Route 53

```bash
aws route53 create-hosted-zone \
  --name lapfreelance56.online \
  --caller-reference "cuentas-claras-$(date +%s)"
```

Guarda el `Id` que devuelve (con la forma `/hostedzone/Z0123…`; en los comandos de abajo va sólo
la parte `Z0123…`). Apunta también los cuatro nameservers que trae la respuesta en
`DelegationSet.NameServers`. Si ya la creaste antes y sólo quieres verlos:

```bash
ZONA=$(aws route53 list-hosted-zones-by-name --dns-name lapfreelance56.online \
  --query 'HostedZones[0].Id' --output text | cut -d/ -f3)

aws route53 get-hosted-zone --id $ZONA --query 'DelegationSet.NameServers' --output table
```

Desde aquí, **$0,50/mes** por la zona. Es el único costo fijo del proyecto.

### 5.2 Cambiar los nameservers en GoDaddy

En el panel de GoDaddy: *Mis productos > Dominios > lapfreelance56.online > DNS > Nameservers >
Cambiar > Usar mis propios nameservers*, y pones los cuatro de Route 53.

Esto lo haces tú a mano en el navegador; no se puede desde el AWS CLI porque el registrador no es
AWS.

**Espera a que el cambio surta efecto antes de seguir.** Suele tardar entre minutos y un par de
horas (el límite teórico son 48 h). Comprobación:

```bash
dig NS lapfreelance56.online +short
# tiene que devolver los ns-…awsdns-… de Route 53, no los domaincontrol.com de GoDaddy
```

⚠️ **No pidas el certificado antes de esto.** ACM valida creando un registro DNS y luego
leyéndolo desde fuera; si el mundo todavía pregunta a GoDaddy, el registro que crees en Route 53
no lo ve nadie y el certificado se queda en `PENDING_VALIDATION` sin explicar por qué.

### 5.3 Pedir el certificado en us-east-1

**Sin excepción en `us-east-1`**: CloudFront no acepta certificados de ninguna otra región, y es el
error que más tiempo hace perder aquí. La región del resto de la pila da igual.

```bash
CERT=$(aws acm request-certificate --region us-east-1 \
  --domain-name lapfreelance56.online \
  --validation-method DNS \
  --query CertificateArn --output text)

echo $CERT
```

### 5.4 Validar el certificado

ACM dice qué registro CNAME hay que crear. Como el DNS ya está en Route 53, se puede crear con un
comando en vez de a mano:

```bash
# El registro que pide ACM (puede tardar unos segundos en aparecer tras pedirlo).
aws acm describe-certificate --region us-east-1 --certificate-arn $CERT \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

Con los valores `Name` y `Value` de arriba:

```bash
aws route53 change-resource-record-sets --hosted-zone-id $ZONA --change-batch '{
  "Changes": [{
    "Action": "UPSERT",
    "ResourceRecordSet": {
      "Name": "EL_NAME_QUE_DIJO_ACM",
      "Type": "CNAME",
      "TTL": 300,
      "ResourceRecords": [{ "Value": "EL_VALUE_QUE_DIJO_ACM" }]
    }
  }]
}'
```

Y a esperar a que quede `ISSUED` (normalmente unos minutos):

```bash
aws acm wait certificate-validated --region us-east-1 --certificate-arn $CERT
aws acm describe-certificate --region us-east-1 --certificate-arn $CERT \
  --query 'Certificate.Status' --output text
```

### 5.5 Volver a desplegar la pila con el dominio

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name cuentas-claras \
  --parameter-overrides \
    NombreProyecto=cuentas-claras \
    RutaBase=cuentas-claras \
    NombreDominio=lapfreelance56.online \
    CertificadoArn=$CERT
```

CloudFront vuelve a tardar entre 5 y 15 minutos. La plantilla sólo activa el dominio si **le das
las dos cosas**, dominio y certificado: con una sola, CloudFront rechazaría el alias.

### 5.6 Apuntar el dominio a CloudFront

Un **registro A de tipo alias**, no un CNAME. El `HostedZoneId` de abajo (`Z2FDTNDATAQYW2`) es
fijo y público: es el de CloudFront, igual para todas las cuentas y todas las distribuciones.

```bash
DOMINIO_CF=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='DominioParaDNS'].OutputValue" --output text)

aws route53 change-resource-record-sets --hosted-zone-id $ZONA --change-batch "{
  \"Changes\": [{
    \"Action\": \"UPSERT\",
    \"ResourceRecordSet\": {
      \"Name\": \"lapfreelance56.online\",
      \"Type\": \"A\",
      \"AliasTarget\": {
        \"HostedZoneId\": \"Z2FDTNDATAQYW2\",
        \"DNSName\": \"$DOMINIO_CF\",
        \"EvaluateTargetHealth\": false
      }
    }
  }]
}"
```

El alias no cuesta nada: Route 53 no cobra las consultas resueltas por un alias a CloudFront.

## Actualizar el sitio después

Cada vez que cambies algo en `web/`:

```bash
aws s3 sync web/ "$DESTINO" --delete --exclude "sw.js" --exclude "manifest.webmanifest"
aws s3 cp web/sw.js "$DESTINO/sw.js" --cache-control "no-cache" --content-type "text/javascript"
aws s3 cp web/manifest.webmanifest "$DESTINO/manifest.webmanifest" --content-type "application/manifest+json"
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

⚠️ **Antes de subir, sella el service worker:**

```bash
node infra/probar-pwa.js --sellar
```

`VERSION` en `sw.js` lleva un hash del contenido del sitio. Si cambias el CSS y no la subes, los
visitantes que ya tienen la PWA instalada **siguen viendo el CSS anterior**: la página carga
perfecta, solo que con lo de antes. `probar-pwa.js` falla si se te olvida.

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

### La PWA

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $URL/cuentas-claras/sw.js
# 200 text/javascript

curl -s -I $URL/cuentas-claras/sw.js | grep -i cache-control
# cache-control: no-cache

curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $URL/cuentas-claras/manifest.webmanifest
# 200 application/manifest+json
```

Y en Chrome, **DevTools > Application**:

1. *Manifest*: sin advertencias, y los iconos se ven (no cuadros rotos).
2. *Service Workers*: uno **activated and running**, con *Source* `/cuentas-claras/sw.js` y
   *Scope* `/cuentas-claras/`. Si el scope sale `/`, el archivo se subió a la raíz del bucket.
3. *Cache Storage*: una sola entrada `cuentas-claras-v1-…` con las 27 rutas del armazón.
4. Marcar **Offline** en *Network* y recargar: el sitio tiene que seguir navegándose entero, y las
   tarjetas de tasas tienen que decir **"No disponible"**. Si sin conexión muestran un número,
   algo está cacheando las tasas y hay que arreglarlo antes que nada.

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
| Sigo viendo la versión vieja | Falta invalidar la caché (paso 4); si tienes la PWA instalada, además `VERSION` de `sw.js` sin sellar |
| No aparece la opción de instalar | El manifiesto se subió sin `application/manifest+json`, o falta un icono |
| El service worker toma todo el dominio | `sw.js` se subió a la raíz del bucket en vez de al prefijo |
| Sin conexión se ven tasas | Algo está cacheando las tasas: correr `node infra/probar-sw.js` |
| CloudFront rechaza el certificado | No está en `us-east-1` |
| El certificado no sale de `PENDING_VALIDATION` | Los nameservers de GoDaddy todavía no apuntan a Route 53, así que nadie ve el registro de validación (paso 5.2) |
| El dominio no resuelve tras cambiar los nameservers | Todavía propagando; comprobar con `dig NS lapfreelance56.online +short` |
| `CNAMEAlreadyExists` al desplegar | Otra distribución de CloudFront ya tiene ese alias |

## Borrar todo

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='NombreBucket'].OutputValue" --output text)

aws s3 rm s3://$BUCKET --recursive
aws cloudformation delete-stack --stack-name cuentas-claras
```

El bucket tiene `DeletionPolicy: Retain`, así que **sobrevive al borrado de la pila**: si quieres
eliminarlo del todo, hazlo a mano después.
